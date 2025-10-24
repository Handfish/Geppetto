import { Schema as S } from 'effect'
import {
  ProviderSignInResult,
  ProviderRepository,
  ProviderAuthStatus,
  ProviderAccountRepositories,
} from './schemas/provider'
import {
  AiProviderSignInResult,
  AiProviderAuthStatus,
  AiProviderType,
  AiAccountId,
  AiUsageSnapshot,
} from './schemas/ai/provider'
import {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  ProviderFeatureUnavailableError,
  ProviderUnavailableError,
  ProviderOperationError,
} from './schemas/errors'
import {
  AiAuthenticationError,
  AiProviderUnavailableError,
  AiFeatureUnavailableError,
  AiUsageUnavailableError,
} from './schemas/ai/errors'
import {
  Account,
  AccountContext,
  AccountId,
  ProviderType,
} from './schemas/account-context'

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
      maxOpenAiAccounts: S.Number,
      maxClaudeAccounts: S.Number,
      enableAccountSwitcher: S.Boolean,
      enableAiProviders: S.Boolean,
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
    errors: S.Union(
      AuthenticationError,
      ProviderFeatureUnavailableError,
      ProviderUnavailableError,
      NetworkError
    ),
  },

  checkAuth: {
    channel: 'provider:checkAuth' as const,
    input: S.Struct({ accountId: AccountId }),
    output: ProviderAuthStatus,
    errors: S.Union(
      AuthenticationError,
      NetworkError,
      ProviderUnavailableError,
      ProviderOperationError
    ),
  },

  signOut: {
    channel: 'provider:signOut' as const,
    input: S.Struct({ accountId: AccountId }),
    output: S.Void,
    errors: S.Union(
      NetworkError,
      ProviderUnavailableError,
      ProviderOperationError
    ),
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

export const AiProviderIpcContracts = {
  'aiProvider:signIn': {
    channel: 'aiProvider:signIn' as const,
    input: S.Struct({ provider: AiProviderType }),
    output: AiProviderSignInResult,
    errors: S.Union(
      AuthenticationError,
      AiAuthenticationError,
      AiProviderUnavailableError,
      AiFeatureUnavailableError,
      NetworkError
    ),
  },

  'aiProvider:signOut': {
    channel: 'aiProvider:signOut' as const,
    input: S.Struct({ accountId: AiAccountId }),
    output: S.Void,
    errors: S.Union(AiProviderUnavailableError, NetworkError),
  },

  'aiProvider:checkAuth': {
    channel: 'aiProvider:checkAuth' as const,
    input: S.Struct({ accountId: AiAccountId }),
    output: AiProviderAuthStatus,
    errors: S.Union(
      AiAuthenticationError,
      AiProviderUnavailableError,
      NetworkError
    ),
  },

  'aiProvider:getUsage': {
    channel: 'aiProvider:getUsage' as const,
    input: S.Struct({ accountId: AiAccountId }),
    output: AiUsageSnapshot,
    errors: S.Union(
      AiUsageUnavailableError,
      AiProviderUnavailableError,
      AiAuthenticationError,
      NetworkError
    ),
  },

  'aiProvider:getProviderUsage': {
    channel: 'aiProvider:getProviderUsage' as const,
    input: S.Struct({ provider: AiProviderType }),
    output: S.Array(AiUsageSnapshot),
    errors: S.Union(
      AiUsageUnavailableError,
      AiProviderUnavailableError,
      AiFeatureUnavailableError,
      NetworkError
    ),
  },
} as const

/**
 * Combined IPC Contracts
 */
export const IpcContracts = {
  ...AccountIpcContracts,
  ...ProviderIpcContracts,
  ...AiProviderIpcContracts,
} as const

export type IpcContracts = typeof IpcContracts
export type IpcChannels = keyof IpcContracts
