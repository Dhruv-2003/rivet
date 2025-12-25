import {
  http,
  type Address,
  type Hex,
  type RpcTransactionReceipt,
  type RpcTransactionRequest,
  createWalletClient,
  isAddress,
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
  tokensStore,
  transactionStore,
} from '~/zustand'
import { waitForHydration } from '~/zustand/utils'

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
      // Check if the account can sign.
      let from: Address | undefined
      if (request.method === 'eth_sendTransaction') {
        from = (request.params as [RpcTransactionRequest])[0].from
      } else if (request.method === 'personal_sign') {
        const [param1, param2] = request.params as [Hex, Hex]
        from = isAddress(param1) ? param1 : (param2 as Address)
      } else if (request.method === 'eth_signTypedData_v4') {
        from = (request.params as [Address, string])[0]
      }

      if (from) {
        const { accounts } = accountStore.getState()
        const account = accounts.find(
          (acc) => acc.address.toLowerCase() === from!.toLowerCase(),
        )
        if (
          account?.type === 'json-rpc' &&
          (networkType === 'remote' || !account.impersonate)
        ) {
          return {
            id: request.id,
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message:
                'Account cannot sign. It is a watch-only account or impersonation is not supported on this network.',
            },
          } as RpcResponse
        }
      }

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

      if (request.method === 'wallet_watchAsset') {
        const {
          type,
          options: { address },
        } = request.params as any

        if (type === 'ERC20') {
          const { account } = accountStore.getState()
          const { network } = networkStore.getState()
          if (account && network) {
            tokensStore.getState().addToken(
              {
                accountAddress: account.address,
                rpcUrl: network.rpcUrl,
              },
              { tokenAddress: address },
            )
          }
        }

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: true,
        } as RpcResponse
      }

      if (request.method === 'wallet_switchEthereumChain') {
        const [{ chainId }] = request.params as [{ chainId: Hex }]
        const { networks, switchNetwork } = networkStore.getState()
        const network = networks.find(
          (n) => n.chainId === Number.parseInt(chainId, 16),
        )

        if (!network) {
          return {
            id: request.id,
            jsonrpc: '2.0',
            error: {
              code: 4902,
              message: 'Unrecognized chain ID',
            },
          } as RpcResponse
        }

        switchNetwork(network.rpcUrl)
        inpageMessenger.send('chainChanged', { chainId, sessions: [session!] })

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: null,
        } as RpcResponse
      }

      if (request.method === 'wallet_addEthereumChain') {
        const [chain] = request.params as [
          {
            chainId: Hex
            chainName: string
            rpcUrls: string[]
            nativeCurrency?: {
              name: string
              symbol: string
              decimals: number
            }
            blockExplorerUrls?: string[]
          },
        ]

        const { upsertNetwork, switchNetwork } = networkStore.getState()
        const rpcUrl = chain.rpcUrls[0]

        await upsertNetwork({
          network: {
            chainId: Number.parseInt(chain.chainId, 16),
            name: chain.chainName,
            rpcUrl,
            type: 'remote',
          },
          rpcUrl,
        })
        switchNetwork(rpcUrl)
        inpageMessenger.send('chainChanged', {
          chainId: chain.chainId,
          sessions: [session!],
        })

        return {
          id: request.id,
          jsonrpc: '2.0',
          result: null,
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
  await Promise.all([
    waitForHydration(accountStore),
    waitForHydration(networkStore),
    waitForHydration(settingsStore),
  ])

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
        // TODO: The chain info should be fetched from the network config, this fixed won't work for CGT networks
        const client = createWalletClient({
          account: localAccount,
          chain: {
            id: network.chainId,
            name: 'Local',
            nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
            rpcUrls: { default: { http: [network.rpcUrl] } },
          },
          transport: http(network.rpcUrl),
        })

        const hash = await client.sendTransaction({
          to: txParams.to,
          data: txParams.data,
          gas: txParams.gas ? BigInt(txParams.gas) : undefined,
          value: txParams.value ? BigInt(txParams.value) : undefined,
          nonce: txParams.nonce ? Number(txParams.nonce) : undefined,
          ...(txParams.maxFeePerGas
            ? {
                maxFeePerGas: BigInt(txParams.maxFeePerGas),
                maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
                  ? BigInt(txParams.maxPriorityFeePerGas)
                  : undefined,
              }
            : {
                gasPrice: txParams.gasPrice
                  ? BigInt(txParams.gasPrice)
                  : undefined,
              }),
        } as any)

        const { addTransaction } = transactionStore.getState()
        addTransaction({
          hash,
          from: txParams.from,
          to: txParams.to ?? undefined,
          value: txParams.value ? BigInt(txParams.value).toString() : undefined,
          data: txParams.data,
          chainId: network.chainId,
          timestamp: Date.now(),
        })

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

  if (request.method === 'personal_sign') {
    const [param1, param2] = request.params as [Hex, Hex]
    let data = param1
    let from = param2 as Address

    if (isAddress(param1) && !isAddress(param2)) {
      from = param1
      data = param2
    }

    const { accounts } = accountStore.getState()
    const account = accounts.find(
      (acc) => acc.address.toLowerCase() === from.toLowerCase(),
    )

    if (account && account.type === 'local' && 'privateKey' in account) {
      try {
        const localAccount = privateKeyToAccount(account.privateKey as Hex)
        const signature = await localAccount.signMessage({
          message: { raw: data },
        })
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: signature,
        } as RpcResponse
      } catch (error) {
        return {
          id: request.id,
          jsonrpc: '2.0',
          error: (error as Error).message || 'Signing failed',
        } as RpcResponse
      }
    }
  }

  if (request.method === 'eth_signTypedData_v4') {
    const [from, data] = request.params as [Address, string]
    const { accounts } = accountStore.getState()
    const account = accounts.find(
      (acc) => acc.address.toLowerCase() === from.toLowerCase(),
    )

    if (account && account.type === 'local' && 'privateKey' in account) {
      try {
        const localAccount = privateKeyToAccount(account.privateKey as Hex)
        const signature = await localAccount.signTypedData(
          JSON.parse(data) as any,
        )
        return {
          id: request.id,
          jsonrpc: '2.0',
          result: signature,
        } as RpcResponse
      } catch (error) {
        return {
          id: request.id,
          jsonrpc: '2.0',
          error: (error as Error).message || 'Signing failed',
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
  ) {
    if (request.method === 'eth_sendTransaction' && (response as any).result) {
      const [txParams] = request.params as [RpcTransactionRequest]
      const { network } = networkStore.getState()
      const { addTransaction } = transactionStore.getState()
      addTransaction({
        hash: (response as any).result,
        from: txParams.from,
        to: txParams.to ?? undefined,
        value: txParams.value ? BigInt(txParams.value).toString() : undefined,
        data: txParams.data,
        chainId: network.chainId,
        timestamp: Date.now(),
      })
    }
    walletMessenger.send('transactionExecuted', undefined)
  }

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

export function setupPendingRequestCleanup() {
  walletMessenger.reply('pendingRequest', async ({ request }) => {
    const { removePendingRequest } = pendingRequestsStore.getState()
    removePendingRequest(request.id)
  })
}
