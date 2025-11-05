import { Effect, Context } from 'effect'
import type {
  AiAccountId,
  AiProviderAuthStatus,
  AiProviderSignInResult,
  AiProviderType,
  AiUsageSnapshot,
} from '../../shared/schemas/ai/provider'
import type {
  AiProviderAuthenticationError,
  AiProviderFeatureUnsupportedError,
  AiProviderUsageError,
} from './errors'

/**
 * AiProviderPort - Hexagonal Architecture Port
 *
 * This is the contract that all AI provider adapters must implement.
 * Following the Effectful Ports pattern from docs/effect_ports_migration_guide.md
 *
 * Each provider (OpenAI, Claude, Cursor, etc.) will be implemented as a Layer
 * that can be hot-swapped at runtime.
 */
export interface AiProviderPort {
  readonly provider: AiProviderType
  readonly supportsUsage: boolean

  signIn(): Effect.Effect<
    AiProviderSignInResult,
    AiProviderAuthenticationError | AiProviderFeatureUnsupportedError
  >

  signOut(
    accountId: AiAccountId
  ): Effect.Effect<
    void,
    AiProviderAuthenticationError | AiProviderFeatureUnsupportedError
  >

  checkAuth(
    accountId: AiAccountId
  ): Effect.Effect<
    AiProviderAuthStatus,
    AiProviderAuthenticationError | AiProviderFeatureUnsupportedError
  >

  getUsage(
    accountId: AiAccountId
  ): Effect.Effect<
    AiUsageSnapshot,
    | AiProviderUsageError
    | AiProviderFeatureUnsupportedError
    | AiProviderAuthenticationError
  >
}

/**
 * Create a tagged service for a specific AI provider.
 * This allows us to have multiple provider instances in the same context.
 *
 * Usage:
 * ```typescript
 * const OpenAiProvider = makeAiProviderService('openai')
 * const ClaudeProvider = makeAiProviderService('claude')
 * ```
 */
export const makeAiProviderService = (provider: AiProviderType) => {
  return Context.GenericTag<AiProviderPort>(`AiProvider:${provider}`)
}

/**
 * Registry of all AI provider tags.
 * This allows us to retrieve the correct service tag by provider type.
 */
export class AiProviderTags {
  private static tags = new Map<AiProviderType, Context.Tag<AiProviderPort, AiProviderPort>>()

  static register(provider: AiProviderType): Context.Tag<AiProviderPort, AiProviderPort> {
    const existing = this.tags.get(provider)
    if (existing) return existing

    const tag = makeAiProviderService(provider)
    this.tags.set(provider, tag)
    return tag
  }

  static get(provider: AiProviderType): Context.Tag<AiProviderPort, AiProviderPort> | undefined {
    return this.tags.get(provider)
  }

  static getOrCreate(provider: AiProviderType): Context.Tag<AiProviderPort, AiProviderPort> {
    return this.get(provider) ?? this.register(provider)
  }

  static all(): ReadonlyArray<Context.Tag<AiProviderPort, AiProviderPort>> {
    return Array.from(this.tags.values())
  }
}
