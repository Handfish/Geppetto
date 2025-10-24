import { Schema as S } from 'effect'
import { AccountId, ProviderType } from './account-context'

/**
 * Visibility classification shared by all supported providers.
 */
export const RepositoryVisibility = S.Literal('public', 'private', 'internal')
export type RepositoryVisibility = S.Schema.Type<typeof RepositoryVisibility>

/**
 * Generic representation of a remote VCS user.
 * Consumers should rely on Schema.decode to coerce provider payloads.
 */
export class ProviderUser extends S.Class<ProviderUser>('ProviderUser')({
  provider: ProviderType,
  providerUserId: S.String,
  username: S.String,
  displayName: S.optional(S.String),
  avatarUrl: S.optional(S.String),
  email: S.optional(S.String),
}) {}

/**
 * Standard repository descriptor for UI consumption.
 * Provider-specific payloads can be accessed via `raw`.
 */
export class ProviderRepository extends S.Class<ProviderRepository>(
  'ProviderRepository'
)({
  provider: ProviderType,
  accountId: AccountId,
  repositoryId: S.String,
  owner: S.String,
  name: S.String,
  fullName: S.String,
  description: S.optional(S.String),
  visibility: RepositoryVisibility,
  defaultBranch: S.String,
  language: S.optional(S.String),
  stars: S.Number,
  forks: S.Number,
  openIssues: S.Number,
  webUrl: S.String,
  avatarUrl: S.optional(S.String),
  updatedAt: S.Date,
  raw: S.Unknown,
}) {}

/**
 * Output returned after a successful provider sign-in.
 */
export class ProviderSignInResult extends S.Class<ProviderSignInResult>(
  'ProviderSignInResult'
)({
  provider: ProviderType,
  accountId: AccountId,
  user: ProviderUser,
}) {}

/**
 * Authentication status for a provider account.
 */
export class ProviderAuthStatus extends S.Class<ProviderAuthStatus>(
  'ProviderAuthStatus'
)({
  provider: ProviderType,
  accountId: AccountId,
  authenticated: S.Boolean,
}) {}

/**
 * Aggregated repositories for a provider account.
 */
export class ProviderAccountRepositories extends S.Class<ProviderAccountRepositories>(
  'ProviderAccountRepositories'
)({
  provider: ProviderType,
  accountId: AccountId,
  repositories: S.Array(ProviderRepository),
}) {}
