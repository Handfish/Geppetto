import { Schema as S } from 'effect'
import {
  ProviderSignInResult,
  ProviderRepository,
  ProviderAuthStatus,
  ProviderAccountRepositories,
} from './schemas/provider'
import {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  ProviderFeatureUnavailableError,
  ProviderUnavailableError,
  ProviderOperationError,
} from './schemas/errors'
import { Account, AccountContext, AccountId, ProviderType } from './schemas/account-context'

/**
 * Account Management IPC Contracts
 */
export const AccountIpcContracts = {
  getAccountContext: {
    channel: 'account:getContext' as const,
    input: S.Void,
    output: AccountContext,
    errors: S.Union(NetworkError),
  },

  switchAccount: {
    channel: 'account:switchAccount' as const,
    input: S.Struct({ accountId: AccountId }),
    output: S.Void,
    errors: S.Union(NotFoundError),
  },

  removeAccount: {
    channel: 'account:removeAccount' as const,
    input: S.Struct({ accountId: AccountId }),
    output: S.Void,
    errors: S.Union(NotFoundError),
  },

  getActiveAccount: {
    channel: 'account:getActiveAccount' as const,
    input: S.Void,
    output: S.NullOr(Account),
    errors: S.Union(NetworkError),
  },

  getTierLimits: {
    channel: 'account:getTierLimits' as const,
    input: S.Void,
    output: S.Struct({
      tier: S.Literal('free', 'pro'),
      maxGitHubAccounts: S.Number,
      maxGitLabAccounts: S.Number,
      maxBitbucketAccounts: S.Number,
      maxGiteaAccounts: S.Number,
      enableAccountSwitcher: S.Boolean,
    }),
    errors: S.Union(NetworkError),
  },
} as const

/**
 * Provider IPC Contracts
 */
export const ProviderIpcContracts = {
  signIn: {
    channel: 'provider:signIn' as const,
    input: S.Struct({ provider: ProviderType }),
    output: ProviderSignInResult,
    errors: S.Union(AuthenticationError, ProviderFeatureUnavailableError, ProviderUnavailableError, NetworkError),
  },

  checkAuth: {
    channel: 'provider:checkAuth' as const,
    input: S.Struct({ accountId: AccountId }),
    output: ProviderAuthStatus,
    errors: S.Union(AuthenticationError, NetworkError, ProviderUnavailableError, ProviderOperationError),
  },

  signOut: {
    channel: 'provider:signOut' as const,
    input: S.Struct({ accountId: AccountId }),
    output: S.Void,
    errors: S.Union(NetworkError, ProviderUnavailableError, ProviderOperationError),
  },

  getAccountRepositories: {
    channel: 'provider:getAccountRepositories' as const,
    input: S.Struct({ accountId: AccountId }),
    output: S.Array(ProviderRepository),
    errors: S.Union(
      AuthenticationError,
      NetworkError,
      ProviderOperationError,
      ProviderUnavailableError
    ),
  },

  getProviderRepositories: {
    channel: 'provider:getProviderRepositories' as const,
    input: S.Struct({ provider: ProviderType }),
    output: S.Array(ProviderAccountRepositories),
    errors: S.Union(
      AuthenticationError,
      NetworkError,
      ProviderOperationError,
      ProviderUnavailableError,
      ProviderFeatureUnavailableError
    ),
  },
} as const

/**
 * Combined IPC Contracts
 */
export const IpcContracts = {
  ...AccountIpcContracts,
  ...ProviderIpcContracts,
} as const

export type IpcContracts = typeof IpcContracts
export type IpcChannels = keyof IpcContracts
