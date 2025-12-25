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

export const transactionStore = createStore<TransactionStore>(
  (set, get) => ({
    transactions: [],
    addTransaction(transaction) {
      set((state) => ({
        transactions: [transaction, ...state.transactions],
      }))
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
