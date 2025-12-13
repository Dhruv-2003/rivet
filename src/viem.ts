import {
  type Client as Client_Base,
  type EIP1474Methods,
  type PublicActions,
  type TestActions,
  type Transport,
  type WalletActions,
  createClient,
  custom,
  publicActions,
  testActions,
  walletActions,
} from 'viem'
import { type Chain, foundry, mainnet } from 'viem/chains'

import { getMessenger } from '~/messengers'
import { getProvider } from '~/provider'

export const defaultChain = {
  ...mainnet,
  rpcUrls: foundry.rpcUrls,
} as const satisfies Chain

const messenger = getMessenger('background:wallet')

export function buildChain({ rpcUrl }: { rpcUrl: string }): Chain {
  return {
    ...defaultChain,
    rpcUrls: {
      default: {
        http: [rpcUrl],
      },
      public: {
        http: [rpcUrl],
      },
    },
  }
}

export type Client = Client_Base<
  Transport,
  Chain,
  undefined,
  EIP1474Methods,
  WalletActions &
    PublicActions &
    TestActions & { mode: 'anvil' | 'remote'; rpcUrl: string }
>

const clientCache = new Map()

export function getClient({
  rpcUrl,
  mode = 'anvil',
}: {
  rpcUrl: string
  mode?: 'anvil' | 'remote'
}): Client {
  const cacheKey = `${rpcUrl}-${mode}`
  const cachedClient = clientCache.get(cacheKey)
  if (cachedClient) return cachedClient

  const client = createClient({
    key: rpcUrl,
    chain: buildChain({ rpcUrl }),
    transport: custom(
      getProvider({
        eventMessenger: messenger,
        requestMessenger: messenger,
        rpcUrl,
      }),
      { retryCount: 0 },
    ),
    pollingInterval: mode === 'remote' ? 12_000 : 4_000,
  })
    .extend(() => ({ mode, rpcUrl }))
    .extend(testActions({ mode: 'anvil' }))
    .extend(publicActions)
    .extend(walletActions)
  clientCache.set(cacheKey, client)
  return client
}
