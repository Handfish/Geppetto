import { Effect } from 'effect'
import { AccountId, ProviderType } from '../../shared/schemas/account-context'
import {
  ProviderAuthStatus,
  ProviderRepository,
  ProviderSignInResult,
} from '../../shared/schemas/provider'
import {
  ProviderAuthenticationError,
  ProviderFeatureUnsupportedError,
  ProviderNotRegisteredError,
  ProviderRepositoryError,
} from './errors'

export type SignInEffect = Effect.Effect<
  ProviderSignInResult,
  ProviderAuthenticationError | ProviderFeatureUnsupportedError
>

export type SignOutEffect = Effect.Effect<
  void,
  ProviderAuthenticationError | ProviderFeatureUnsupportedError
>

export type CheckAuthEffect = Effect.Effect<
  ProviderAuthStatus,
  ProviderAuthenticationError | ProviderFeatureUnsupportedError
>

export type FetchRepositoriesEffect = Effect.Effect<
  ReadonlyArray<ProviderRepository>,
  ProviderRepositoryError | ProviderFeatureUnsupportedError | ProviderAuthenticationError
>

/**
 * Primary port describing a provider adapter.
 * Each adapter may decide which capabilities it supports.
 */
export interface ProviderAdapter {
  readonly provider: ProviderType
  readonly supportsRepositories: boolean
  readonly supportsIssues: boolean
  readonly supportsPullRequests: boolean

  signIn(): SignInEffect
  signOut(accountId: AccountId): SignOutEffect
  checkAuth(accountId: AccountId): CheckAuthEffect
  getRepositories(accountId: AccountId): FetchRepositoriesEffect
}

/**
 * Registry port used by the application layer to resolve adapters.
 */
export interface ProviderRegistryPort {
  getAdapter(provider: ProviderType): Effect.Effect<
    ProviderAdapter,
    ProviderNotRegisteredError
  >
  listAdapters(): ReadonlyArray<ProviderAdapter>
}
