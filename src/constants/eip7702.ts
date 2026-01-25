import type { Address, Hex } from 'viem'

// SimpleAccount7702 implementation address
// https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/accounts/Simple7702Account.sol
export const SIMPLE_ACCOUNT_7702 =
  '0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9' as const satisfies Address

// EIP-7702 delegation prefix in bytecode
// When an EOA is delegated, its code becomes: 0xef0100 + <20-byte address>
export const EIP7702_DELEGATION_PREFIX = '0xef0100' as const

// Test address used for EIP-7702 support detection
export const EIP7702_TEST_ADDRESS =
  '0xdeadbeef00000000000000000000000000000000' as const satisfies Address

// Test delegation code for support detection
export const EIP7702_TEST_CODE =
  '0xef01000000000000000000000000000000000000000001' as const satisfies Hex
