import { Data } from 'effect'
import type { Effect } from 'effect'
import type { AiProviderType } from '../../../shared/schemas/ai/provider'
import type { AiProviderAuthenticationError } from '../errors'

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

export interface UsagePageSnapshot {
  readonly provider: AiProviderType
  readonly fetchedAt: Date
  readonly bars: ReadonlyArray<UsageBarSnapshot>
}

export class UsagePageError extends Data.TaggedError('UsagePageError')<{
  readonly provider: AiProviderType
  readonly reason: 'request' | 'parse' | 'unsupported'
  readonly message: string
}> {}

export type UsagePageEffect = Effect.Effect<
  UsagePageSnapshot,
  AiProviderAuthenticationError | UsagePageError
>

export interface UsagePagePort {
  fetchUsagePage(provider: AiProviderType): UsagePageEffect
}
