import {
  http,
  type Address,
  type Hex,
  type RpcTransactionReceipt,
  type RpcTransactionRequest,
  createWalletClient,
  keccak256,
  numberToHex,
  stringToHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { type HttpRpcClient, getHttpRpcClient } from 'viem/utils'

import {
  UnauthorizedProviderError,
  UnsupportedProviderMethodError,
  UserRejectedRequestError,
} from '~/errors'
import { type Messenger, getMessenger } from '~/messengers'
import type { RpcRequest, RpcResponse } from '~/types/rpc'
import {
  accountStore,
  batchCallsStore,
  networkStore,
  pendingRequestsStore,
  sessionsStore,
  settingsStore,
} from '~/zustand'

const inpageMessenger = getMessenger('background:inpage')
const walletMessenger = getMessenger('background:wallet')

export function setupRpcHandler({ messenger }: { messenger: Messenger }) {
  messenger.reply('request', async ({ request, rpcUrl: rpcUrl_ }, meta) => {
    const isInpage =
      meta.sender.tab &&
      !meta.sender.tab?.url?.includes('extension://') &&
      (!meta.sender.frameId || meta.sender.frameId === 0)

    const rpcUrl = rpcUrl_ || networkStore.getState().network.rpcUrl
    const network =
      networkStore.getState().networks.find((n) => n.rpcUrl === rpcUrl) ||
      networkStore.getState().network
    const networkType = network.type || 'anvil'
    const rpcClient = getHttpRpcClient(rpcUrl)

    const { getSession } = sessionsStore.getState()
    const host = new URL(meta.sender.url || '').host
    const session = getSession({ host })

    const hasOnboarded = isInpage ? networkStore.getState().onboarded : rpcUrl
    if (!hasOnboarded)
      return {
        id: request.id,
        jsonrpc: '2.0',
        error: {
          code: UnsupportedProviderMethodError.code,
          message: 'Rivet has not been onboarded.',
        },
      } as RpcResponse

    const { bypassSignatureAuth, bypassTransactionAuth } =
      settingsStore.getState()
    // If the method is a "signable" method, request approval from the user.
    if (
      (request.method === 'eth_sendTransaction' && !bypassTransactionAuth) ||
      (request.method === 'eth_sign' && !bypassSignatureAuth) ||
      (request.method === 'eth_signTypedData_v4' && !bypassSignatureAuth) ||
      (request.method === 'personal_sign' && !bypassSignatureAuth) ||
      (request.method === 'wallet_sendCalls' && !bypassTransactionAuth)
    ) {
      const { addPendingRequest, removePendingRequest } =
        pendingRequestsStore.getState()

      if (!session)
        return {
          id: request.id,
          jsonrpc: '2.0',
          error: {
            code: UnauthorizedProviderError.code,
          },
        } as RpcResponse

      addPendingRequest({ ...request, sender: meta.sender })

      const response = await new Promise((resolve, reject) => {
        walletMessenger.reply(
          'pendingRequest',
          async ({ request: pendingRequest, status }) => {
            if (pendingRequest.id !== request.id) return

            removePendingRequest(request.id)

            if (status === 'rejected') {
              resolve({
                id: request.id,
                jsonrpc: '2.0',
                error: {
                  code: UserRejectedRequestError.code,
                  message: UserRejectedRequestError.message,
                  data: { request },
                },
              } satisfies RpcResponse)
              return
            }

            try {
              const { id, method, params } = pendingRequest
              const response = await execute(
                rpcClient,
                {
                  method,
                  params,
                  id,
                } as RpcRequest,
                networkType,
              )
              resolve(response)
            } catch (err) {
              reject(err)
            }
          },
        )
      })
      return response as RpcResponse
    }

    if (isInpage) {
      if (request.method === 'eth_requestAccounts') {
        const authorize = () => {
          const { getAccounts } = accountStore.getState()
          const { network } = networkStore.getState()
          const { addSession } = sessionsStore.getState()

          const accounts = getAccounts({
            activeFirst: true,
            rpcUrl: network.rpcUrl,
          })

          const host = new URL(meta.sender.url || '').host.replace('www.', '')
          const addresses = accounts.map((x) => x.address) as Address[]

          addSession({ session: { host } })
          if (network.chainId !== -1) {
            inpageMessenger.send('connect', {
              chainId: numberToHex(network.chainId),
            })
          }

          return {
            id: request.id,
            jsonrpc: '2.0',
            result: addresses,
          } as RpcResponse
        }

        const { bypassConnectAuth } = settingsStore.getState()
        if (bypassConnectAuth) return authorize()

        const { addPendingRequest, removePendingRequest } =
          pendingRequestsStore.getState()

        addPendingRequest({ ...request, sender: meta.sender })

        try {
          const response = await new Promise((resolve) => {
            walletMessenger.reply(
              'pendingRequest',
              async ({ request: pendingRequest, status }) => {
                if (pendingRequest.id !== request.id) return

                if (status === 'rejected') {
                  resolve({
                    id: request.id,
                    jsonrpc: '2.0',
                    error: {
                      code: UserRejectedRequestError.code,
                      message: UserRejectedRequestError.message,
                      data: { request },
                    },
                  } satisfies RpcResponse)
                  return
                }

                resolve(authorize())
              },
            )
          })
          return response as RpcResponse
        } finally {
          removePendingRequest(request.id)
        }
      }

      if (request.method === 'eth_accounts') {
        const { getAccounts } = accountStore.getState()
        const { network } = networkStore.getState()

        const accounts = getAccounts({
          activeFirst: true,
          rpcUrl: network.rpcUrl,
        })
        const addresses = session
          ? (accounts.map((x) => x.address) as Address[])
          : []

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: addresses,
        } as RpcResponse
      }

      if (request.method === 'wallet_getCallsStatus') {
        const batchId = request.params![0]
        const { batch } = batchCallsStore.getState()
        const { transactionHashes } = batch[batchId]

        const responses = await Promise.allSettled(
          transactionHashes.map((hash) =>
            rpcClient.request({
              body: {
                method: 'eth_getTransactionReceipt',
                params: [hash],
              },
            }),
          ),
        )
        const pending = responses.some(
          (response) =>
            response.status === 'rejected' || !response.value.result,
        )

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: {
            status: pending ? 'PENDING' : 'CONFIRMED',
            receipts: pending
              ? []
              : responses
                  .map((response) => {
                    if (response.status === 'rejected') return
                    const receipt = response.value
                      .result as RpcTransactionReceipt
                    return {
                      blockHash: receipt.blockHash,
                      blockNumber: receipt.blockNumber,
                      gasUsed: receipt.gasUsed,
                      logs: receipt.logs,
                      transactionHash: receipt.transactionHash,
                      status: receipt.status,
                    }
                  })
                  .filter(Boolean),
          },
        } as RpcResponse
      }

      if (request.method === 'wallet_getCapabilities') {
        const { networks } = networkStore.getState()
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: networks.reduce((capabilities, network) => {
            if (network.chainId === -1) return capabilities
            return {
              ...capabilities,
              [numberToHex(network.chainId)]: {
                atomicBatch: {
                  supported: false,
                },
              },
            }
          }, {}),
        } as RpcResponse
      }

      if (request.method === 'wallet_showCallsStatus') {
        const batchId = request.params![0]
        const { batch } = batchCallsStore.getState()
        const { transactionHashes } = batch[batchId]
        walletMessenger.send(
          'pushRoute',
          `/transaction/${transactionHashes[0]}`,
        )
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: undefined,
        } as RpcResponse
      }
    }

    return execute(rpcClient, request, networkType)
  })
}

/////////////////////////////////////////////////////////////////////////////////
// Utilties

async function execute(
  rpcClient: HttpRpcClient,
  request: RpcRequest,
  networkType: 'anvil' | 'remote',
) {
  // Anvil doesn't support `personal_sign` – use `eth_sign` instead.
  if (networkType === 'anvil' && request.method === 'personal_sign') {
    request.method = 'eth_sign' as any
    request.params = [request.params[1], request.params[0]]
  }

  // Handle Local Account Signing
  if (request.method === 'eth_sendTransaction') {
    const [txParams] = request.params as [RpcTransactionRequest]
    const { from } = txParams
    const { accounts } = accountStore.getState()
    const account = accounts.find(
      (acc) => acc.address.toLowerCase() === from.toLowerCase(),
    )

    if (account && account.type === 'local' && 'privateKey' in account) {
      try {
        const { network } = networkStore.getState()
        const localAccount = privateKeyToAccount(account.privateKey as Hex)
        const client = createWalletClient({
          account: localAccount,
          chain: undefined,
          transport: http(network.rpcUrl),
        })

        const hash = await client.sendTransaction({
          ...txParams,
          gas: txParams.gas ? BigInt(txParams.gas) : undefined,
          gasPrice: txParams.gasPrice ? BigInt(txParams.gasPrice) : undefined,
          value: txParams.value ? BigInt(txParams.value) : undefined,
          nonce: txParams.nonce ? Number(txParams.nonce) : undefined,
          maxFeePerGas: txParams.maxFeePerGas
            ? BigInt(txParams.maxFeePerGas)
            : undefined,
          maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
            ? BigInt(txParams.maxPriorityFeePerGas)
            : undefined,
        } as any)

        walletMessenger.send('transactionExecuted', undefined)
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: hash,
        } as RpcResponse
      } catch (error) {
        return {
          id: request.id,
          jsonrpc: '2.0',
          error: (error as Error).message || 'Transaction failed',
        } as RpcResponse
      }
    }
  }

  const response = (await (() => {
    if (request.method === 'wallet_sendCalls') {
      return handleSendCalls({
        ...request.params![0],
        id: request.id,
        rpcClient,
        networkType,
      } as any)
    }

    return rpcClient.request({
      body: request,
    })
  })()) as unknown as RpcResponse

  if (
    request.method === 'eth_sendTransaction' ||
    request.method === 'wallet_sendCalls'
  )
    walletMessenger.send('transactionExecuted', undefined)

  if ((response as { success?: boolean }).success === false)
    return {
      id: request.id,
      jsonrpc: '2.0',
      error: 'An unknown error occurred.',
    } as RpcResponse

  return response
}

async function handleSendCalls({
  calls,
  from,
  id,
  rpcClient,
  networkType,
}: {
  calls: RpcTransactionRequest[]
  from: Address
  id: number
  rpcClient: HttpRpcClient
  networkType: 'anvil' | 'remote'
}) {
  const { setBatch } = batchCallsStore.getState()

  // Simulate calls for errors (to ensure atomicity).
  for (const call of calls) {
    const { error } = await rpcClient.request({
      body: {
        method: 'eth_call',
        params: [{ ...call, from: from ?? call.from, nonce: undefined }],
      },
    })
    if (error) throw new Error(error.message)
  }

  // Disable automining (if enabled) to mine transactions atomically.
  let automine: any
  if (networkType === 'anvil') {
    automine = await rpcClient
      .request({
        body: {
          method: 'anvil_getAutomine',
        },
      })
      .catch(() => {})
    if (automine?.result)
      await rpcClient.request({
        body: {
          method: 'evm_setAutomine',
          params: [false],
        },
      })
  }

  try {
    const transactionHashes = []
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      const { result, error } = await rpcClient.request({
        body: {
          method: 'eth_sendTransaction',
          params: [
            {
              ...call,
              from: from ?? call.from,
              nonce: undefined,
            },
          ],
        },
      })
      if (error) throw new Error(error.message)

      transactionHashes.push(result)
    }

    // Mine a block if automining was originally enabled.
    if (automine?.result)
      await rpcClient.request({
        body: {
          method: 'anvil_mine',
          params: ['0x1', '0x0'],
        },
      })

    const batchId = keccak256(stringToHex(JSON.stringify(transactionHashes)))
    setBatch(batchId, { calls, transactionHashes })

    return { id, jsonrpc: '2.0', result: batchId }
  } finally {
    // Re-enable automining (if previously enabled).
    if (automine?.result)
      await rpcClient.request({
        body: {
          method: 'evm_setAutomine',
          params: [true],
        },
      })
  }
}
