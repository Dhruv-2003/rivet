import { formatUnits } from 'viem'
import { Box, Column, Columns, Stack, Text } from '~/design-system'

export function AssetChanges({
  changes,
  networkType,
}: {
  changes: readonly any[] | undefined
  networkType?: 'anvil' | 'remote'
}) {
  if (!changes || changes.length === 0) {
    return (
      <Box padding="16px">
        <Stack gap="8px">
          <Text size="12px" color="text/tertiary">
            No asset changes detected.
          </Text>
          {networkType === 'remote' && (
            <Text size="11px" color="text/quarternary">
              Note: Asset change detection may be limited on remote networks.
            </Text>
          )}
        </Stack>
      </Box>
    )
  }

  return (
    <Stack gap="8px">
      {changes.map((change, i) => {
        const { token, value } = change
        const diff = BigInt(value.diff)
        const pre = BigInt(value.pre)
        const post = BigInt(value.post)
        const isPositive = diff > 0n
        const isNegative = diff < 0n
        const absDiff = diff > 0n ? diff : -diff
        const formattedDiff = formatUnits(absDiff, token.decimals || 18)
        const formattedPre = formatUnits(pre, token.decimals || 18)
        const formattedPost = formatUnits(post, token.decimals || 18)

        // Determine color based on direction
        const diffColor = isPositive
          ? 'surface/green'
          : isNegative
            ? 'surface/red'
            : 'text/secondary'

        return (
          <Box
            key={i}
            padding="12px"
            backgroundColor="surface/fill"
            borderRadius="6px"
          >
            <Stack gap="8px">
              <Columns alignVertical="center" gap="8px">
                <Column>
                  <Text size="12px" weight="medium">
                    {token.symbol || 'Unknown Token'}
                  </Text>
                  <Text size="11px" color="text/tertiary">
                    {token.address?.slice(0, 10)}...{token.address?.slice(-8)}
                  </Text>
                </Column>
                <Column alignHorizontal="right">
                  <Text size="14px" weight="semibold" color={diffColor as any}>
                    {isPositive ? '+' : isNegative ? '-' : ''}
                    {formattedDiff} {token.symbol || ''}
                  </Text>
                </Column>
              </Columns>
              <Columns gap="8px">
                <Column>
                  <Text size="9px" color="text/quarternary">
                    Before
                  </Text>
                  <Text size="11px" color="text/tertiary">
                    {formattedPre}
                  </Text>
                </Column>
                <Column>
                  <Text size="9px" color="text/quarternary">
                    After
                  </Text>
                  <Text size="11px" color="text/secondary">
                    {formattedPost}
                  </Text>
                </Column>
              </Columns>
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
