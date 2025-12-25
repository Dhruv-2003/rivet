import { formatUnits } from 'viem'
import { Box, Columns, Column, Text, Stack } from '~/design-system'

export function AssetChanges({ changes }: { changes: any[] }) {
  if (!changes || changes.length === 0) {
    return (
      <Box padding="16px">
        <Text size="12px" color="text/tertiary">No asset changes detected.</Text>
      </Box>
    )
  }

  return (
    <Stack gap="8px">
      {changes.map((change, i) => {
        const { token, value } = change
        const diff = BigInt(value.diff)
        const isPositive = diff > 0n
        const formattedDiff = formatUnits(diff > 0n ? diff : -diff, token.decimals)
        
        return (
          <Box key={i} padding="8px" backgroundColor="surface/fill" borderRadius="6px">
            <Columns alignVertical="center" gap="8px">
              <Column>
                <Text size="12px" weight="medium">{token.symbol || 'Unknown Token'}</Text>
                <Text size="11px" color="text/tertiary">{token.address}</Text>
              </Column>
              <Column alignHorizontal="right">
                <Text size="12px">
                  {isPositive ? '+' : '-'}{formattedDiff}
                </Text>
              </Column>
            </Columns>
          </Box>
        )
      })}
    </Stack>
  )
}
