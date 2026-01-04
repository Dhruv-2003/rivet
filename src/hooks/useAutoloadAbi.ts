import { loaders, whatsabi } from '@shazow/whatsabi'
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Address, Client } from 'viem'
import { createQueryKey } from '~/react-query'
// import { etherscanApiUrls } from '../constants/etherscan'
// import { BlockscoutABILoader } from '../utils/blockscoutAbiLoader'
import { useSettingsStore } from '../zustand'
import { useClient } from './useClient'

type AutoloadAbiParameters = {
  address?: Address | null
  enabled?: boolean
}

export const autoloadAbiQueryKey = createQueryKey<
  'autoload-abi',
  [key: Client['key'], address: Address, abiLoaderConfigNonce: number]
>('autoload-abi')

export function useAutoloadAbiQueryOptions({
  address,
  enabled,
}: AutoloadAbiParameters) {
  const client = useClient()
  const {
    abiLoaderConfigNonce,
    etherscanApiKey,
    blockscoutApiKey,
    blockscoutApiUrl,
  } = useSettingsStore()

  return queryOptions({
    enabled: enabled && Boolean(address),
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
    queryKey: autoloadAbiQueryKey([client.key, address!, abiLoaderConfigNonce]),
    async queryFn() {
      if (!address) throw new Error('address is required')
      if (!client) throw new Error('client is required')
      const result = await whatsabi.autoload(address, {
        provider: client,
        followProxies: true,
        onProgress: (phase) =>
          console.log('whatsabi autoload progress:', phase),
        onError: (phase, context) =>
          console.error('whatsabi autoload error:', phase, context),
        abiLoader: new loaders.MultiABILoader([
          new loaders.SourcifyABILoader({
            chainId: client.chain.id,
          }),
          new loaders.EtherscanABILoader({
            apiKey: etherscanApiKey?.trim() || '',
            chainId: client.chain.id,
          }),
          new loaders.AnyABILoader(),
          new loaders.BlockscoutABILoader({
            baseURL: blockscoutApiUrl,
            apiKey: blockscoutApiKey?.trim() || undefined,
          }),
        ]),
      })
      console.log({ result })
      if (!result.abi.some((item) => (item as { name?: string }).name))
        return null
      return result.abi.map((abiItem) => ({
        ...abiItem,
        outputs: 'outputs' in abiItem && abiItem.outputs ? abiItem.outputs : [],
      }))
    },
  })
}

export function useAutoloadAbi(args: AutoloadAbiParameters) {
  const queryOptions = useAutoloadAbiQueryOptions(args)
  return useQuery(queryOptions)
}
