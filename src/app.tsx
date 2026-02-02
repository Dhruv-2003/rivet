import './hmr'

import { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import {
  RouterProvider,
  createHashRouter,
  createMemoryRouter,
} from 'react-router-dom'
import { numberToHex } from 'viem'

import { getTheme, setTheme } from '~/design-system'
import '~/design-system/styles/global.css'
import { useClient } from '~/hooks/useClient'
import { useNetworkStatus } from '~/hooks/useNetworkStatus'
import {
  getPendingBlockQueryKey,
  usePendingBlock,
} from '~/hooks/usePendingBlock'
import { getPendingTransactionsQueryKey } from '~/hooks/usePendingTransactions'
import { usePrevious } from '~/hooks/usePrevious'
import { getTxpoolQueryKey } from '~/hooks/useTxpool'
import { getMessenger } from '~/messengers'
import { QueryClientProvider, queryClient } from '~/react-query'
import { deepEqual } from '~/utils'
import { getClient } from '~/viem'
import {
  type AccountState,
  type NetworkState,
  networkStore,
  syncStores,
  useAccountStore,
  useNetworkStore,
  useSessionsStore,
} from '~/zustand'

import { type AppMeta, AppMetaContext } from './contexts'
import { useSnapshot } from './hooks/useSnapshot'
import Layout from './screens/_layout'
import AccountDetails from './screens/account-details'
import BlockConfig from './screens/block-config'
import BlockDetails from './screens/block-details'
import ContractDetails from './screens/contract-details'
import Index from './screens/index'
import NetworkConfig from './screens/network-config'
import Networks from './screens/networks'
import OnboardingConfigure from './screens/onboarding/configure'
import OnboardingDownload from './screens/onboarding/download'
import OnboardingRun from './screens/onboarding/run'
import OnboardingStart from './screens/onboarding/start'
import Session from './screens/session'
import Settings from './screens/settings'
import TransactionDetails from './screens/transaction-details'

export function init({ type = 'standalone' }: { type?: AppMeta['type'] } = {}) {
  syncStores()

  const createRouter = (() => {
    if (type === 'embedded') return createMemoryRouter
    return createHashRouter
  })()

  const router = createRouter([
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          path: '',
          element: <Index />,
        },
        {
          path: 'account/:address',
          element: <AccountDetails />,
        },
        {
          path: 'block-config',
          element: <BlockConfig />,
        },
        {
          path: 'block/:blockNumber',
          element: <BlockDetails />,
        },
        {
          path: 'contract/:contractAddress',
          element: <ContractDetails />,
        },
        {
          path: 'transaction/:transactionHash',
          element: <TransactionDetails />,
        },
        {
          path: 'networks',
          element: <Networks />,
        },
        {
          path: 'networks/:rpcUrl',
          element: <NetworkConfig />,
        },
        {
          path: 'session',
          element: <Session />,
        },
        {
          path: 'settings',
          element: <Settings />,
        },
        {
          path: 'onboarding',
          children: [
            {
              path: '',
              element: <OnboardingStart />,
            },
            {
              path: 'configure',
              element: <OnboardingConfigure />,
            },
            {
              path: 'download',
              element: <OnboardingDownload />,
            },
            {
              path: 'run',
              element: <OnboardingRun />,
            },
          ],
        },
      ],
    },
  ])

  const backgroundMessenger = getMessenger('background:wallet')

  // Handle requests from background to toggle the theme.
  backgroundMessenger.reply('toggleTheme', async () => {
    const { storageTheme, systemTheme } = getTheme()
    const theme = storageTheme || systemTheme
    setTheme(theme === 'dark' ? 'light' : 'dark')
  })

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <AppMetaContext.Provider value={{ type }}>
      <QueryClientProvider>
        <AccountsChangedEmitter />
        <NetworkChangedEmitter />
        <SyncBlockNumber />
        <SyncJsonRpcAccounts />
        <SyncNetwork />
        <TransactionToastListener />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppMetaContext.Provider>,
  )
}

////////////////////////////////////////////////////////////////////////////

const inpageMessenger = getMessenger('wallet:inpage')

/** Emits EIP-1193 `accountsChanged` Event */
function AccountsChangedEmitter() {
  const { account, getAccounts } = useAccountStore()
  const { sessions } = useSessionsStore()

  const prevAccounts = useRef<AccountState['accounts']>()
  useEffect(() => {
    if (!account) {
      prevAccounts.current = []
      return
    }

    let accounts_ = getAccounts({ rpcUrl: account.rpcUrl })
    accounts_ = [
      account,
      ...accounts_.filter((x) => x.address !== account.address),
    ]

    if (prevAccounts.current && !deepEqual(prevAccounts.current, accounts_))
      inpageMessenger.send('accountsChanged', {
        accounts: accounts_.map((x) => x.address),
        sessions,
      })

    prevAccounts.current = accounts_
  }, [account])

  return null
}

/** Emits EIP-1193 `chainChanged` Event */
function NetworkChangedEmitter() {
  const { network } = useNetworkStore()
  const { sessions } = useSessionsStore()

  const prevNetwork = useRef<NetworkState['network']>()
  useEffect(() => {
    if (!network.chainId || network.chainId === -1) return

    if (prevNetwork.current && prevNetwork.current.chainId !== network.chainId)
      inpageMessenger.send('chainChanged', {
        chainId: numberToHex(network.chainId),
        sessions,
      })

    prevNetwork.current = network
  }, [network])

  return null
}

/** Keeps block number in sync. */
function SyncBlockNumber() {
  const { data: block } = usePendingBlock()
  useSnapshot({ blockNumber: block?.number })
  return null
}

/** Keeps accounts in sync with network. */
function SyncJsonRpcAccounts() {
  const { data: chainId } = useNetworkStatus()
  const client = useClient()
  const { getAccounts, setJsonRpcAccounts } = useAccountStore()

  useEffect(() => {
    ;(async () => {
      const addresses = await client.getAddresses()
      setJsonRpcAccounts({ addresses, rpcUrl: client.rpcUrl })
    })()
  }, [getAccounts, chainId, setJsonRpcAccounts, client])

  return null
}

/** Keeps network in sync (+ ensure chain id is up-to-date). */
function SyncNetwork() {
  const client = useClient()
  const { data: listening } = useNetworkStatus()

  const prevListening = usePrevious(listening)
  useEffect(() => {
    // Reset stale queries that are dependent on the client when node comes back online.
    if (prevListening === false && listening) {
      queryClient.removeQueries({
        predicate(query) {
          return query.queryKey.includes(client.key)
        },
      })
    }
  }, [prevListening, listening, client.key])

  return null
}

/** Handles transaction execution results (invalidating queries + showing toasts) */
function TransactionToastListener() {
  useEffect(() => {
    const backgroundMessenger = getMessenger('background:wallet')
    const pollTimeouts = new Map<string, NodeJS.Timeout>()

    const unreply = backgroundMessenger.reply(
      'transactionExecuted',
      async (data?: { hash?: string; chainId?: number }) => {
        if (!data) return
        const {
          network: { rpcUrl },
        } = networkStore.getState()
        const client = getClient({ rpcUrl })

        queryClient.invalidateQueries({
          queryKey: getPendingBlockQueryKey([client.key]),
        })
        queryClient.invalidateQueries({
          queryKey: getPendingTransactionsQueryKey([client.key]),
        })
        queryClient.invalidateQueries({
          queryKey: getTxpoolQueryKey([client.key]),
        })

        // Show toast for transaction with polling for receipt
        if (data?.hash) {
          // Clear any existing timeout for this hash
          const existingTimeout = pollTimeouts.get(data.hash)
          if (existingTimeout) clearTimeout(existingTimeout)

          const { toast } = await import('sonner')
          const truncatedHash = `${data.hash.slice(0, 10)}...${data.hash.slice(
            -8,
          )}`

          // Show loading toast
          const toastId = toast.loading('Transaction Pending', {
            description: truncatedHash,
          })

          // Poll for receipt with configurable interval based on block time
          // Use shorter interval for local (anvil) and longer for remote
          const { network } = networkStore.getState()
          const pollInterval = network.type === 'remote' ? 5000 : 1000
          const maxAttempts = 60 // Max 60 attempts (1-5 minutes depending on interval)

          let attempts = 0
          const pollForReceipt = async () => {
            attempts++
            try {
              const receipt = await client.getTransactionReceipt({
                hash: data.hash as `0x${string}`,
              })

              if (receipt) {
                if (receipt.status === 'success') {
                  toast.success('Transaction Confirmed', {
                    id: toastId,
                    description: truncatedHash,
                  })
                } else {
                  toast.error('Transaction Failed', {
                    id: toastId,
                    description: truncatedHash,
                  })
                }
                pollTimeouts.delete(data.hash!)
                return // Stop polling
              }
            } catch (_error) {
              // Receipt not found yet, continue polling
            }

            if (attempts < maxAttempts) {
              const timeout = setTimeout(pollForReceipt, pollInterval)
              pollTimeouts.set(data.hash!, timeout)
            } else {
              // Max attempts reached, show info message
              toast('Transaction Status Unknown', {
                id: toastId,
                description: `${truncatedHash} - Check Activity for status`,
              })
              pollTimeouts.delete(data.hash!)
            }
          }

          // Start polling
          const timeout = setTimeout(pollForReceipt, pollInterval)
          pollTimeouts.set(data.hash, timeout)
        }
      },
    )

    return () => {
      unreply()
      for (const timeout of pollTimeouts.values()) {
        clearTimeout(timeout)
      }
      pollTimeouts.clear()
    }
  }, [])

  return null
}
