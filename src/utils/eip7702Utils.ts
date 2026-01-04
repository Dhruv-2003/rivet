import { type Address, type Hex, encodeFunctionData } from 'viem'

import { simple7702AccountAbi } from '~/constants/abi'
import {
  EIP7702_DELEGATION_PREFIX,
  EIP7702_TEST_ADDRESS,
  EIP7702_TEST_CODE,
  SIMPLE_ACCOUNT_7702,
} from '~/constants/eip7702'

////////////////////////////////////////////////////////////////////////
// Types

type JsonRpcResponse<T = unknown> = {
  jsonrpc: '2.0'
  id: number | string
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

////////////////////////////////////////////////////////////////////////
// EIP-7702 Support Cache

const eip7702SupportCache = new Map<string, boolean>()

/**
 * Check if a chain supports EIP-7702 by using eth_estimateGas
 * with a state override containing 7702 delegation code.
 * Results are cached per rpcUrl.
 */
export async function checkEip7702Support(rpcUrl: string): Promise<boolean> {
  // Check cache first
  if (eip7702SupportCache.has(rpcUrl)) {
    return eip7702SupportCache.get(rpcUrl)!
  }

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateGas',
        params: [
          {
            from: EIP7702_TEST_ADDRESS,
            to: EIP7702_TEST_ADDRESS,
            data: '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
            value: '0x0',
          },
          'latest',
          {
            [EIP7702_TEST_ADDRESS]: {
              code: EIP7702_TEST_CODE,
            },
          },
        ],
        id: Date.now(),
      }),
    })

    const data = (await response.json()) as JsonRpcResponse
    const supported = !data.error?.message?.includes('unsupported')

    // Cache the result
    eip7702SupportCache.set(rpcUrl, supported)

    return supported
  } catch {
    eip7702SupportCache.set(rpcUrl, false)
    return false
  }
}

/**
 * Clear the EIP-7702 support cache (useful for testing)
 */
export function clearEip7702SupportCache() {
  eip7702SupportCache.clear()
}

////////////////////////////////////////////////////////////////////////
// Delegation Detection

/**
 * Get the bytecode of an address via RPC
 */
async function getBytecode(
  rpcUrl: string,
  address: Address,
): Promise<Hex | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [address, 'latest'],
        id: Date.now(),
      }),
    })

    const data = (await response.json()) as JsonRpcResponse<Hex>
    if (data.result && data.result !== '0x') {
      return data.result
    }
    return null
  } catch {
    return null
  }
}

/**
 * Extract the delegated address from EIP-7702 bytecode.
 * EIP-7702 delegated accounts have bytecode: 0xef0100 + <20-byte address>
 */
export function getDelegatedAddress(bytecode: Hex | null): Address | null {
  if (!bytecode) return null
  if (
    !bytecode.toLowerCase().startsWith(EIP7702_DELEGATION_PREFIX.toLowerCase())
  )
    return null
  // Bytecode should be exactly 0x + 6 chars (ef0100) + 40 chars (address) = 48 chars
  if (bytecode.length !== 48) return null
  return `0x${bytecode.slice(8)}` as Address
}

/**
 * Check if an address is delegated to SimpleAccount7702
 */
export async function isDelegatedToSimple7702(
  rpcUrl: string,
  address: Address,
): Promise<boolean> {
  const bytecode = await getBytecode(rpcUrl, address)
  const delegatedTo = getDelegatedAddress(bytecode)

  if (!delegatedTo) return false

  // Compare addresses case-insensitively
  return delegatedTo.toLowerCase() === SIMPLE_ACCOUNT_7702.toLowerCase()
}

/**
 * Check if an address is delegated to any contract
 */
export async function getDelegation(
  rpcUrl: string,
  address: Address,
): Promise<Address | null> {
  const bytecode = await getBytecode(rpcUrl, address)
  return getDelegatedAddress(bytecode)
}

////////////////////////////////////////////////////////////////////////
// Execute Batch Encoding

/**
 * Encode an executeBatch call for SimpleAccount7702
 * @param calls Array of calls with target, value, and data
 * @returns Encoded calldata for executeBatch function
 */
export function encodeExecuteBatch(
  calls: { target: Address; value: bigint; data: Hex }[],
): Hex {
  return encodeFunctionData({
    abi: simple7702AccountAbi,
    functionName: 'executeBatch',
    args: [calls],
  })
}

/**
 * Encode a single execute call for SimpleAccount7702
 * @param target Target address
 * @param value Value to send
 * @param data Calldata
 * @returns Encoded calldata for execute function
 */
export function encodeExecute(target: Address, value: bigint, data: Hex): Hex {
  return encodeFunctionData({
    abi: simple7702AccountAbi,
    functionName: 'execute',
    args: [target, value, data],
  })
}
