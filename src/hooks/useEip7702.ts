import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { http, type Address, type Hex, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  EIP7702_DELEGATION_PREFIX,
  EIP7702_TEST_ADDRESS,
  EIP7702_TEST_CODE,
} from '~/constants/eip7702'
import { createQueryKey } from '~/react-query'
import type { Client } from '~/viem'

import {
  pendingRequestsStore,
  useAccountStore,
  useNetworkStore,
} from '~/zustand'
import { useBytecode } from './useBytecode'
import { useClient } from './useClient'

////////////////////////////////////////////////////////////////////////
// Types

type JsonRpcResponse<T = unknown> = {
  jsonrpc: '2.0'
  id: number | string
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

////////////////////////////////////////////////////////////////////////
// EIP-7702 Support Detection

export const getEip7702SupportQueryKey = createQueryKey<
  'eip7702-support',
  [key: Client['key']]
>('eip7702-support')

/**
 * Check if the connected chain supports EIP-7702 by using eth_estimateGas
 * with a state override containing 7702 delegation code.
 */
async function checkEip7702Support(rpcUrl: string): Promise<boolean> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateGas',
        params: [
          {
            from: EIP7702_TEST_ADDRESS,
            to: EIP7702_TEST_ADDRESS,
            data: '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
            value: '0x0',
          },
          'latest',
          {
            [EIP7702_TEST_ADDRESS]: {
              code: EIP7702_TEST_CODE,
            },
          },
        ],
        id: 1,
      }),
    })

    const data = (await response.json()) as JsonRpcResponse
    // If there's an error about invalid code prefix or unsupported feature, return false
    return !data.error?.message?.includes('unsupported')
  } catch {
    return false
  }
}

export function getEip7702SupportQueryOptions(client: Client) {
  return queryOptions({
    queryKey: getEip7702SupportQueryKey([client.key]),
    queryFn: () => checkEip7702Support(client.rpcUrl),
    staleTime: 60_000, // Cache for 1 minute
  })
}

export function useEip7702Support() {
  const client = useClient()
  return useQuery(getEip7702SupportQueryOptions(client))
}

////////////////////////////////////////////////////////////////////////
// Account Delegation Detection

/**
 * Extract the delegated address from EIP-7702 bytecode.
 * EIP-7702 delegated accounts have bytecode: 0xef0100 + <20-byte address>
 */
export function getDelegatedAddress(bytecode: Hex | null): Address | null {
  if (!bytecode) return null
  if (!bytecode.startsWith(EIP7702_DELEGATION_PREFIX)) return null
  // Bytecode should be exactly 0x + 6 chars (ef0100) + 40 chars (address) = 48 chars
  if (bytecode.length !== 48) return null
  return `0x${bytecode.slice(8)}` as Address
}

export const getAccountDelegationQueryKey = createQueryKey<
  'account-delegation',
  [key: Client['key'], address: Address | undefined]
>('account-delegation')

export function useAccountDelegation({ address }: { address?: Address }) {
  const { data: bytecode, ...rest } = useBytecode({ address })

  const delegatedAddress = getDelegatedAddress(bytecode ?? null)

  return {
    ...rest,
    data: delegatedAddress,
    isDelegated: delegatedAddress !== null,
  }
}

////////////////////////////////////////////////////////////////////////
// Delegate Account Mutation

type DelegateAccountParams = {
  implementationAddress: Address
}

/**
 * Hook to delegate an EOA to a smart contract implementation using EIP-7702.
 *
 * For local accounts (with private key), we use viem's walletClient methods
 * signAuthorization and sendTransaction directly.
 *
 * For JSON-RPC accounts, we use the pending request flow.
 */
export function useDelegateAccount() {
  const { network } = useNetworkStore()
  const { account } = useAccountStore()

  return useMutation({
    async mutationFn({ implementationAddress }: DelegateAccountParams) {
      if (!account?.address) {
        throw new Error('No active account')
      }

      // For local accounts with a private key, use viem walletClient directly
      if (account.type === 'local' && account.privateKey) {
        const viemAccount = privateKeyToAccount(account.privateKey)

        // Create a custom chain with the correct chainId from network
        const chain = {
          id: network.chainId,
          name: network.name,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [network.rpcUrl] },
          },
        } as const

        // Create a wallet client with the correct chain
        const walletClient = createWalletClient({
          account: viemAccount,
          chain,
          transport: http(network.rpcUrl),
        })

        // Sign the authorization - stable in v2.24.0
        // - account: the EOA that is delegating
        // - contractAddress: the contract to delegate to
        // - executor: 'self' since we're sending the tx ourselves (not a relayer)
        const authorization = await walletClient.signAuthorization({
          account: viemAccount,
          contractAddress: implementationAddress,
          executor: 'self',
        })

        // Send transaction with authorization list to delegate the EOA
        const hash = await walletClient.sendTransaction({
          authorizationList: [authorization],
          data: '0x',
          to: viemAccount.address,
        })

        return hash
      }

      // For JSON-RPC accounts, use the pending request flow
      const requestId = Date.now()

      pendingRequestsStore.getState().addPendingRequest({
        id: requestId,
        method: 'eth_sendTransaction',
        params: [
          {
            from: account.address as Hex,
            to: account.address as Hex,
            data: '0x',
            value: '0x0',
          },
        ],
      })

      return `pending:${requestId}`
    },
  })
}
