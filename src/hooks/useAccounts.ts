import { useMemo } from 'react'
import { useAccountStore, useNetworkStore } from '~/zustand'

export function useAccounts() {
  const { accounts, getAccounts } = useAccountStore()
  const { network } = useNetworkStore()

  return useMemo(
    () => getAccounts({ activeFirst: true, rpcUrl: network.rpcUrl }),
    [accounts, network.rpcUrl],
  )
}
