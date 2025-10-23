import { AiUsageMetric } from '../../../shared/schemas/ai/provider'
import type { UsageBarSnapshot } from './ports'

const PERCENT_LIMIT = 100

const slugify = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.length > 0 ? normalized : 'usage'
}

export const usageBarsToMetrics = (
  bars: ReadonlyArray<UsageBarSnapshot>
): ReadonlyArray<AiUsageMetric> =>
  bars.map(bar => {
    const usedPercent =
      bar.mode === 'used' ? bar.percent : Math.max(0, 100 - bar.percent)
    const labelParts = [bar.title]
    if (bar.subtitle && bar.subtitle !== bar.title) {
      labelParts.push(bar.subtitle)
    }
    if (bar.detail && !labelParts.includes(bar.detail)) {
      labelParts.push(bar.detail)
    }

    return new AiUsageMetric({
      toolId: `usage.${slugify(bar.title)}`,
      toolName: labelParts.join(' - '),
      used: usedPercent,
      limit: PERCENT_LIMIT,
      usagePercentage: usedPercent,
      unit: 'percent',
    })
  })
