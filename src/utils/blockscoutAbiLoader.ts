type BlockscoutAbiLoaderConfig = {
  /**
   * Either:
   * - Blockscout root, e.g. https://eth.blockscout.com (v2 API)
   * - Etherscan-compatible API endpoint, e.g. https://eth.blockscout.com/api
   */
  baseURL?: string
  /** Optional Blockscout API key, if the instance requires it. */
  apiKey?: string
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '')
}

function isEtherscanStyleApi(baseURL: string): boolean {
  // Common Blockscout deployments expose an Etherscan-compatible endpoint at `/api`.
  // If the user provides that, prefer the Etherscan-style ABI API.
  return /\/api$/i.test(normalizeBaseUrl(baseURL))
}

async function fetchJson(url: URL): Promise<unknown> {
  const res = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function parseAbiMaybe(value: unknown): any[] {
  if (Array.isArray(value)) return value as any[]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Minimal Blockscout ABI loader for whatsabi v0.9.x (implements `loadABI`).
 *
 * Based on upstream Blockscout loader behavior in newer whatsabi versions.
 */
export class BlockscoutABILoader {
  private readonly baseURL: string
  private readonly apiKey?: string

  constructor(config: BlockscoutAbiLoaderConfig) {
    this.baseURL = normalizeBaseUrl(
      config.baseURL || 'https://eth.blockscout.com/api',
    )
    this.apiKey = config.apiKey?.trim() || undefined
  }

  async loadABI(address: string): Promise<any[]> {
    if (!this.baseURL) return []

    try {
      if (isEtherscanStyleApi(this.baseURL)) {
        // Etherscan-compatible ABI endpoint.
        // GET {baseURL}?module=contract&action=getabi&address=0x...&apikey=...
        const url = new URL(this.baseURL)
        url.searchParams.set('module', 'contract')
        url.searchParams.set('action', 'getabi')
        url.searchParams.set('address', address)
        if (this.apiKey) url.searchParams.set('apikey', this.apiKey)

        const json = (await fetchJson(url)) as {
          status?: string
          message?: string
          result?: unknown
        }

        // Blockscout generally matches Etherscan here:
        // { status: "1", result: "[...]" }
        if (json?.status !== '1') return []
        return parseAbiMaybe(json.result)
      }

      // Blockscout v2 API.
      // GET {baseURL}/api/v2/smart-contracts/:address?apikey=...
      const url = new URL(`${this.baseURL}/api/v2/smart-contracts/${address}`)
      if (this.apiKey) url.searchParams.set('apikey', this.apiKey)

      const json = (await fetchJson(url)) as {
        abi?: unknown
        is_verified?: boolean
      }

      // Some instances return null/empty for unverified contracts.
      return parseAbiMaybe(json?.abi)
    } catch {
      return []
    }
  }
}
