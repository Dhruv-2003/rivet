import { useSyncExternalStoreWithTracked } from '~/hooks/useSyncExternalStoreWithTracked'
import { createStore } from './utils'

export type SettingsState = {
  bypassConnectAuth?: boolean
  bypassSignatureAuth?: boolean
  bypassTransactionAuth?: boolean

  /** Optional ABI provider configuration used by whatsabi autoload. */
  etherscanApiKey?: string
  blockscoutApiKey?: string
  /** Full Blockscout API endpoint (Etherscan-compatible), e.g. https://eth.blockscout.com/api */
  blockscoutApiUrl?: string

  /** Bumps whenever ABI provider config changes (avoids putting secrets in query keys). */
  abiLoaderConfigNonce: number
}
export type SettingsActions = {
  setBypassConnectAuth: (value?: boolean) => void
  setBypassSignatureAuth: (value?: boolean) => void
  setBypassTransactionAuth: (value?: boolean) => void

  setEtherscanApiKey: (value?: string) => void
  setBlockscoutApiKey: (value?: string) => void
  setBlockscoutApiUrl: (value?: string) => void
}
export type SettingsStore = SettingsState & SettingsActions

export const settingsStore = createStore<SettingsStore>(
  (set) => ({
    bypassConnectAuth: false,
    bypassSignatureAuth: false,
    bypassTransactionAuth: false,

    etherscanApiKey: '',
    blockscoutApiKey: '',
    blockscoutApiUrl: '',
    abiLoaderConfigNonce: 0,

    setBypassConnectAuth(value) {
      set({ bypassConnectAuth: value })
    },
    setBypassSignatureAuth(value) {
      set({ bypassSignatureAuth: value })
    },
    setBypassTransactionAuth(value) {
      set({ bypassTransactionAuth: value })
    },

    setEtherscanApiKey(value) {
      set((state) => ({
        etherscanApiKey: value ?? '',
        abiLoaderConfigNonce: state.abiLoaderConfigNonce + 1,
      }))
    },
    setBlockscoutApiKey(value) {
      set((state) => ({
        blockscoutApiKey: value ?? '',
        abiLoaderConfigNonce: state.abiLoaderConfigNonce + 1,
      }))
    },
    setBlockscoutApiUrl(value) {
      set((state) => ({
        blockscoutApiUrl: value ?? '',
        abiLoaderConfigNonce: state.abiLoaderConfigNonce + 1,
      }))
    },
  }),
  {
    persist: {
      name: 'settings',
      version: 0,
    },
  },
)

export const useSettingsStore = () =>
  useSyncExternalStoreWithTracked(
    settingsStore.subscribe,
    settingsStore.getState,
  )
