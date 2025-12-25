import { useMemo } from 'react'

import { getClient } from '~/viem'
import { useNetworkStore } from '~/zustand'

export function useClient({ rpcUrl }: { rpcUrl?: string } = {}) {
  const { network, networks } = useNetworkStore()
  const targetRpcUrl = rpcUrl || network.rpcUrl
  const targetNetwork =
    networks.find((n) => n.rpcUrl === targetRpcUrl) || network

  return useMemo(
    () =>
      getClient({
        rpcUrl: targetRpcUrl,
        mode: targetNetwork.type || 'anvil',
      }),
    [targetRpcUrl, targetNetwork.type],
  )
}
