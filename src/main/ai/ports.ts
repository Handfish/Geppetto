import type { Effect } from 'effect'
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
  AiProviderNotRegisteredError,
  AiProviderUsageError,
} from './errors'

export type AiSignInEffect = Effect.Effect<
  AiProviderSignInResult,
  AiProviderAuthenticationError | AiProviderFeatureUnsupportedError
>

export type AiSignOutEffect = Effect.Effect<
  void,
  AiProviderAuthenticationError | AiProviderFeatureUnsupportedError
>

export type AiCheckAuthEffect = Effect.Effect<
  AiProviderAuthStatus,
  AiProviderAuthenticationError | AiProviderFeatureUnsupportedError
>

export type AiUsageEffect = Effect.Effect<
  AiUsageSnapshot,
  AiProviderUsageError | AiProviderFeatureUnsupportedError | AiProviderAuthenticationError
>

export interface AiProviderAdapter {
  readonly provider: AiProviderType
  readonly supportsUsage: boolean

  signIn(): AiSignInEffect
  signOut(accountId: AiAccountId): AiSignOutEffect
  checkAuth(accountId: AiAccountId): AiCheckAuthEffect
  getUsage(accountId: AiAccountId): AiUsageEffect
}

export interface AiProviderRegistryPort {
  getAdapter(provider: AiProviderType): Effect.Effect<
    AiProviderAdapter,
    AiProviderNotRegisteredError
  >
  listAdapters(): ReadonlyArray<AiProviderAdapter>
}
