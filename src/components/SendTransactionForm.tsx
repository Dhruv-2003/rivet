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

  const {
    handleSubmit,
    register,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SendTransactionFormData>({
    defaultValues: {
      to: '',
      value: '',
      data: '',
    },
  })

  const submit = handleSubmit(({ to, value, data }) => {
    // Generate unique request ID
    const requestId = Date.now()

    // Create the transaction request params
    const txParams: RpcTransactionRequest = {
      from: from as Hex,
      to: to as Hex,
      value: value ? numberToHex(parseEther(value)) : undefined,
      data: data ? (data as Hex) : undefined,
    }

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
            placeholder="0x..."
            register={register('to', {
              required: 'Address is required',
              validate: (value) =>
                isAddress(value) || 'Invalid Ethereum address',
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
            label="Data (optional)"
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
        </Box>

        <Inline gap="8px">
          <Button
            height="24px"
            variant="stroked fill"
            width="fit"
            type="submit"
          >
            Send Transaction
          </Button>
        </Inline>
      </Stack>
    </Form.Root>
  )
}
