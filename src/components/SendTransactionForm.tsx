import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  type Address,
  type Hex,
  type RpcTransactionRequest,
  formatEther,
  isAddress,
  isHex,
  numberToHex,
  parseEther,
} from 'viem'

import * as Form from '~/components/form'
import { Box, Button, Inline, Stack, Text } from '~/design-system'
import { useBalance } from '~/hooks/useBalance'
import { getMessenger } from '~/messengers'
import { getUniqueId } from '~/utils'
import { pendingRequestsStore } from '~/zustand'

type SendTransactionFormData = {
  to: string
  value: string
  data: string
}

const numberIntl8SigFigs = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 8,
})

export function SendTransactionForm({
  from,
  onSubmit,
}: {
  from: Address
  onSubmit?: () => void
}) {
  const { data: balance } = useBalance({ address: from })
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null)
  const pendingRequestIdRef = useRef<number | null>(null)

  // Listen for request results from background (set up once)
  useEffect(() => {
    const backgroundMessenger = getMessenger('background:wallet')

    const handler = async ({
      requestId,
      result,
      error,
    }: { requestId: number; result?: string; error?: string }) => {
      if (pendingRequestIdRef.current === requestId) {
        if (result) {
          setLastTxHash(result)
        } else if (error) {
          // Error is already shown in toast by the background
        }
        pendingRequestsStore.getState().removePendingRequest(requestId)
        setPendingRequestId(null)
      }
    }

    return backgroundMessenger.reply('requestResult', handler)
  }, [])

  useEffect(() => {
    pendingRequestIdRef.current = pendingRequestId
  }, [pendingRequestId])

  const {
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SendTransactionFormData>({
    defaultValues: {
      to: '',
      value: '',
      data: '',
    },
  })

  const toValue = watch('to')
  const dataValue = watch('data')
  const isContractDeployment = !toValue && dataValue

  const submit = handleSubmit(({ to, value, data }) => {
    // Generate unique request ID
    const requestId = getUniqueId()

    // Create the transaction request params
    const txParams: RpcTransactionRequest = {
      from: from as Hex,
      to: to ? (to as Hex) : undefined, // Allow undefined for contract deployment
      value: value ? numberToHex(parseEther(value)) : undefined,
      data: data ? (data as Hex) : undefined,
    }

    // Clear previous hash
    setLastTxHash(null)
    setPendingRequestId(requestId)

    // Add synthetic pending request
    pendingRequestsStore.getState().addPendingRequest({
      id: requestId,
      method: 'eth_sendTransaction',
      params: [txParams],
    })

    reset()
    onSubmit?.()
  })

  const handleMaxClick = () => {
    if (typeof balance === 'bigint') {
      setValue('value', formatEther(balance))
    }
  }

  return (
    <Form.Root onSubmit={submit} style={{ width: '100%' }}>
      <Stack gap="16px">
        <Box>
          <Form.InputField
            label="To Address"
            height="24px"
            placeholder="0x... (leave empty for contract deployment)"
            register={register('to', {
              validate: (value) => {
                // For contract deployment, 'to' can be empty if 'data' is provided
                if (!value) {
                  const data = watch('data')
                  if (!data) {
                    return 'Address required (or provide bytecode in Data for contract deployment)'
                  }
                  return true
                }
                return isAddress(value) || 'Invalid Ethereum address'
              },
            })}
          />
          {errors.to && (
            <Text color="surface/red" size="11px">
              {errors.to.message}
            </Text>
          )}
        </Box>

        <Box>
          <Inline alignHorizontal="justify" alignVertical="center">
            <Text color="text/tertiary" size="9px">
              VALUE (ETH)
            </Text>
            {typeof balance === 'bigint' && (
              <Box
                as="button"
                type="button"
                onClick={handleMaxClick}
                style={{
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                <Text color="text/tertiary" size="9px">
                  Balance:{' '}
                  {numberIntl8SigFigs.format(Number(formatEther(balance)))} ETH
                  (MAX)
                </Text>
              </Box>
            )}
          </Inline>
          <Form.InputField
            label="Value (ETH)"
            hideLabel
            height="24px"
            placeholder="0.0"
            register={register('value', {
              validate: (value) => {
                if (!value) return true
                try {
                  parseEther(value)
                  return true
                } catch {
                  return 'Invalid ETH value'
                }
              },
            })}
          />
          {errors.value && (
            <Text color="surface/red" size="11px">
              {errors.value.message}
            </Text>
          )}
        </Box>

        <Box>
          <Form.InputField
            label={isContractDeployment ? 'Bytecode' : 'Data (optional)'}
            height="24px"
            placeholder="0x..."
            register={register('data', {
              validate: (value) => {
                if (!value) return true
                return isHex(value) || 'Invalid hex data'
              },
            })}
          />
          {errors.data && (
            <Text color="surface/red" size="11px">
              {errors.data.message}
            </Text>
          )}
          {isContractDeployment && (
            <Text color="text/tertiary" size="9px" style={{ marginTop: '4px' }}>
              Contract will be deployed when you submit
            </Text>
          )}
        </Box>

        <Inline gap="8px">
          <Button
            height="24px"
            variant="stroked fill"
            width="fit"
            type="submit"
          >
            {isContractDeployment ? 'Deploy Contract' : 'Send Transaction'}
          </Button>
        </Inline>

        {lastTxHash && (
          <Stack gap="8px">
            <Text size="9px" color="text/tertiary">
              TRANSACTION HASH
            </Text>
            <Inline gap="8px" alignVertical="center" wrap={false}>
              <Text size="11px" style={{ wordBreak: 'break-all', flex: 1 }}>
                {lastTxHash}
              </Text>
              <Button.Symbol
                height="20px"
                label="Copy"
                onClick={() => {
                  navigator.clipboard.writeText(lastTxHash)
                }}
                symbol="doc.on.doc"
                variant="ghost primary"
              />
            </Inline>
          </Stack>
        )}
      </Stack>
    </Form.Root>
  )
}
