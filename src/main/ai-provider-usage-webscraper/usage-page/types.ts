import { Data } from 'effect'
import type { AiProviderType } from '../../../shared/schemas/ai/provider'

/**
 * Normalized representation of a usage bar rendered on a provider usage page.
 * Some providers expose usage as "percent used" while others expose "percent remaining".
 * The `mode` flag captures which semantic is represented so downstream callers
 * can normalize to their preferred interpretation.
 */
export interface UsageBarSnapshot {
  readonly title: string
  readonly subtitle?: string
  readonly percent: number
  readonly mode: 'used' | 'remaining'
  readonly detail?: string
}

/**
 * Complete snapshot of usage data from a provider's usage page
 */
export interface UsagePageSnapshot {
  readonly provider: AiProviderType
  readonly fetchedAt: Date
  readonly bars: ReadonlyArray<UsageBarSnapshot>
}

/**
 * Error when fetching or parsing usage page data
 */
export class UsagePageError extends Data.TaggedError('UsagePageError')<{
  readonly provider: AiProviderType
  readonly reason: 'request' | 'parse' | 'unsupported'
  readonly message: string
}> {}
