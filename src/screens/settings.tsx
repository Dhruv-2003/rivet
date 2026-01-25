import { Container } from '~/components'
import { Box, Inline, Inset, Stack, Text } from '~/design-system'
import { useSettingsStore } from '~/zustand'

export default function Settings() {
  const {
    bypassConnectAuth,
    bypassSignatureAuth,
    bypassTransactionAuth,
    blockscoutApiKey,
    blockscoutApiUrl,
    etherscanApiKey,
    setBypassConnectAuth,
    setBypassSignatureAuth,
    setBypassTransactionAuth,
    setBlockscoutApiKey,
    setBlockscoutApiUrl,
    setEtherscanApiKey,
  } = useSettingsStore()

  return (
    <Container dismissable fit header="Settings">
      <Stack gap="16px">
        <Text color="text/tertiary">Cheats</Text>
        <Inset right="4px">
          <Stack gap="8px">
            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Box as="label" htmlFor="instant-connect-auth" width="full">
                <Text size="12px">Bypass Connect Authorization</Text>
              </Box>
              {/** TODO: <Checkbox> component */}
              <Box
                as="input"
                id="instant-connect-auth"
                checked={bypassConnectAuth}
                onChange={(e) => {
                  setBypassConnectAuth(e.target.checked)
                }}
                type="checkbox"
              />
            </Inline>
            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Box as="label" htmlFor="instant-signature-auth" width="full">
                <Text size="12px">Bypass Signature Authorization</Text>
              </Box>
              {/** TODO: <Checkbox> component */}
              <Box
                as="input"
                id="instant-signature-auth"
                checked={bypassSignatureAuth}
                onChange={(e) => {
                  setBypassSignatureAuth(e.target.checked)
                }}
                type="checkbox"
              />
            </Inline>
            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Box as="label" htmlFor="instant-transaction-auth" width="full">
                <Text size="12px">Bypass Transaction Authorization</Text>
              </Box>
              {/** TODO: <Checkbox> component */}
              <Box
                as="input"
                id="instant-transaction-auth"
                checked={bypassTransactionAuth}
                onChange={(e) => {
                  setBypassTransactionAuth(e.target.checked)
                }}
                type="checkbox"
              />
            </Inline>
          </Stack>
        </Inset>

        <Text color="text/tertiary">ABI Providers</Text>
        <Inset right="4px">
          <Stack gap="8px">
            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Box as="label" htmlFor="etherscan-api-key" width="full">
                <Text size="12px">Etherscan API Key (optional)</Text>
              </Box>
              <Box
                as="input"
                id="etherscan-api-key"
                value={etherscanApiKey ?? ''}
                onChange={(e) => setEtherscanApiKey(e.target.value)}
                type="password"
                placeholder="API key"
                style={{ width: '240px' }}
              />
            </Inline>

            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Box as="label" htmlFor="blockscout-api-url" width="full">
                <Text size="12px">Blockscout API URL (optional)</Text>
              </Box>
              <Box
                as="input"
                id="blockscout-api-url"
                value={blockscoutApiUrl ?? ''}
                onChange={(e) => setBlockscoutApiUrl(e.target.value)}
                type="text"
                placeholder="https://eth.blockscout.com/api"
                style={{ width: '240px' }}
              />
            </Inline>

            <Inline
              alignVertical="center"
              alignHorizontal="justify"
              wrap={false}
            >
              <Box as="label" htmlFor="blockscout-api-key" width="full">
                <Text size="12px">Blockscout API Key (optional)</Text>
              </Box>
              <Box
                as="input"
                id="blockscout-api-key"
                value={blockscoutApiKey ?? ''}
                onChange={(e) => setBlockscoutApiKey(e.target.value)}
                type="password"
                placeholder="API key"
                style={{ width: '240px' }}
              />
            </Inline>
          </Stack>
        </Inset>
      </Stack>
    </Container>
  )
}
