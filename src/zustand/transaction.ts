import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'

import { createStore } from './utils'

export type Transaction = {
  hash: string
  from: string
  to?: string
  value?: string
  data?: string
  chainId: number
  timestamp: number
}

export type TransactionState = {
  transactions: Transaction[]
}

export type TransactionActions = {
  addTransaction(transaction: Transaction): void
  getTransactions(address: string, chainId: number): Transaction[]
}

export type TransactionStore = TransactionState & TransactionActions

const MAX_TRANSACTIONS = 100

export const transactionStore = createStore<TransactionStore>(
  (set, get) => ({
    transactions: [],
    addTransaction(transaction) {
      set((state) => {
        const newTransactions = [transaction, ...state.transactions]
        // Keep only the most recent MAX_TRANSACTIONS
        return {
          transactions: newTransactions.slice(0, MAX_TRANSACTIONS),
        }
      })
    },
    getTransactions(address, chainId) {
      return get().transactions.filter(
        (tx) =>
          tx.from.toLowerCase() === address.toLowerCase() &&
          tx.chainId === chainId,
      )
    },
  }),
  {
    persist: {
      name: 'transactions',
      version: 0,
    },
  },
)

export const useTransactionStore = () =>
  useSyncExternalStoreWithTracked(
    transactionStore.subscribe,
    transactionStore.getState,
  )
