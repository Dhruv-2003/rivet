import { useQuery } from '@tanstack/react-query'
import { type Address, type Hex, stringify } from 'viem'

import { createQueryKey } from '~/react-query'
import { useClient } from './useClient'

export const getSimulateCallsQueryKey = createQueryKey<
  'simulateCalls',
  [key: string, account: Address | undefined, calls: string]
>('simulateCalls')

export function useSimulateCalls({
  account,
  calls,
}: {
  account?: Address
  calls: { to?: Address; data?: Hex; value?: bigint }[]
}) {
  const client = useClient()

  return useQuery({
    queryKey: getSimulateCallsQueryKey([
      client.key,
      account,
      stringify(calls),
    ]),
    queryFn: async () => {
      if (!calls.length) return null
      try {
        // @ts-ignore
        return await client.simulateCalls({
          account,
          calls,
          traceAssetChanges: true,
        })
      } catch (error) {
        console.error('simulateCalls error', error)
        throw error
      }
    },
    enabled: Boolean(client && calls.length),
    retry: false,
  })
}
