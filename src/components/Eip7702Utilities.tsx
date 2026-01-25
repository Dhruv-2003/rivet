import * as Accordion from '@radix-ui/react-accordion'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { type Address, isAddress } from 'viem'

import { SIMPLE_ACCOUNT_7702 } from '~/constants/eip7702'
import {
  Box,
  Button,
  Inline,
  Inset,
  SFSymbol,
  Stack,
  Text,
} from '~/design-system'
import {
  useAccountDelegation,
  useDelegateAccount,
  useEip7702Support,
} from '~/hooks/useEip7702'
import { truncate } from '~/utils'
import { useAccountStore } from '~/zustand'

import { Tooltip } from './Tooltip'
import * as Form from './form'
import { Spinner } from './svgs'

type DelegateFormData = {
  implementationAddress: string
}

export function Eip7702Utilities() {
  const { account } = useAccountStore()
  const {
    data: isSupported,
    isLoading: isCheckingSupport,
    isError: supportError,
  } = useEip7702Support()

  const {
    data: delegatedAddress,
    isDelegated,
    isLoading: isCheckingDelegation,
  } = useAccountDelegation({ address: account?.address })

  const { mutate: delegate, isPending: isDelegating } = useDelegateAccount()

  const [isOpen, setIsOpen] = useState(false)

  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<DelegateFormData>({
    defaultValues: {
      implementationAddress: SIMPLE_ACCOUNT_7702,
    },
  })

  const onSubmit = handleSubmit(({ implementationAddress }) => {
    delegate(
      { implementationAddress: implementationAddress as Address },
      {
        onSuccess: (hash) => {
          toast.success(`Delegation transaction sent: ${truncate(hash)}`)
        },
        onError: (error) => {
          toast.error(`Delegation failed: ${error.message}`)
        },
      },
    )
  })

  const isLoading = isCheckingSupport || isCheckingDelegation

  // Status indicator
  const getStatusIndicator = () => {
    if (isLoading) {
      return (
        <Inline alignVertical="center" gap="4px">
          <Spinner size="12px" />
          <Text color="text/tertiary" size="11px">
            Checking...
          </Text>
        </Inline>
      )
    }

    if (supportError || isSupported === false) {
      return (
        <Inline alignVertical="center" gap="4px">
          <SFSymbol
            color="surface/red"
            size="12px"
            symbol="xmark"
            weight="medium"
          />
          <Text color="surface/red" size="11px">
            Not Supported
          </Text>
        </Inline>
      )
    }

    if (isDelegated) {
      return (
        <Inline alignVertical="center" gap="4px">
          <SFSymbol
            color="surface/green"
            size="12px"
            symbol="checkmark"
            weight="medium"
          />
          <Text color="surface/green" size="11px">
            Delegated
          </Text>
        </Inline>
      )
    }

    return (
      <Inline alignVertical="center" gap="4px">
        <SFSymbol
          color="surface/yellowTint"
          size="12px"
          symbol="minus"
          weight="medium"
        />
        <Text color="text/tertiary" size="11px">
          Not Delegated
        </Text>
      </Inline>
    )
  }

  const isDisabled = !isSupported || !account?.address

  return (
    <Accordion.Root
      type="single"
      collapsible
      value={isOpen ? 'eip7702' : ''}
      onValueChange={(value) => setIsOpen(value === 'eip7702')}
    >
      <Accordion.Item value="eip7702">
        <Box
          backgroundColor="surface/secondary/elevated"
          borderRadius="6px"
          overflow="hidden"
        >
          <Accordion.Trigger asChild>
            <Box
              as="button"
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              padding="12px"
              width="full"
              style={{
                cursor: 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              <Inline alignVertical="center" gap="8px">
                <Text weight="medium">EIP-7702 Delegation</Text>
                {getStatusIndicator()}
              </Inline>
              <SFSymbol
                color="text/tertiary"
                size="12px"
                symbol="chevron.down"
                weight="medium"
              />
            </Box>
          </Accordion.Trigger>

          <Accordion.Content>
            <Box paddingHorizontal="12px" paddingBottom="12px">
              <Stack gap="12px">
                {/* Current Delegation Status */}
                <Box>
                  <Text color="text/tertiary" size="9px">
                    CURRENT DELEGATION
                  </Text>
                  <Inset top="4px">
                    {isCheckingDelegation ? (
                      <Spinner size="12px" />
                    ) : isDelegated && delegatedAddress ? (
                      <Inline alignVertical="center" gap="4px">
                        <Tooltip label={delegatedAddress}>
                          <Text size="12px">{truncate(delegatedAddress)}</Text>
                        </Tooltip>
                        <Button.Copy
                          height="20px"
                          text={delegatedAddress}
                          variant="ghost primary"
                        />
                      </Inline>
                    ) : (
                      <Text color="text/tertiary" size="12px">
                        Not delegated
                      </Text>
                    )}
                  </Inset>
                </Box>

                {/* Delegation Form */}
                {!isDisabled && (
                  <Form.Root onSubmit={onSubmit}>
                    <Stack gap="8px">
                      <Box>
                        <Form.InputField
                          label="Implementation Address"
                          height="24px"
                          placeholder="0x..."
                          register={register('implementationAddress', {
                            required: 'Implementation address is required',
                            validate: (value) =>
                              isAddress(value) || 'Invalid address',
                          })}
                        />
                        {errors.implementationAddress && (
                          <Text color="surface/red" size="11px">
                            {errors.implementationAddress.message}
                          </Text>
                        )}
                        <Inset top="4px">
                          <Text color="text/tertiary" size="9px">
                            Default: SimpleAccount7702
                          </Text>
                        </Inset>
                      </Box>

                      <Inline gap="8px">
                        <Button
                          height="24px"
                          variant="stroked fill"
                          width="fit"
                          type="submit"
                          disabled={isDelegating}
                        >
                          {isDelegating ? (
                            <Inline alignVertical="center" gap="4px">
                              <Spinner size="12px" />
                              <Text size="12px">Delegating...</Text>
                            </Inline>
                          ) : (
                            'Delegate'
                          )}
                        </Button>
                      </Inline>
                    </Stack>
                  </Form.Root>
                )}

                {/* Disabled State Message */}
                {isDisabled && !isLoading && (
                  <Text color="text/tertiary" size="11px">
                    {!account?.address
                      ? 'No active account selected'
                      : 'This chain does not support EIP-7702'}
                  </Text>
                )}
              </Stack>
            </Box>
          </Accordion.Content>
        </Box>
      </Accordion.Item>
    </Accordion.Root>
  )
}
