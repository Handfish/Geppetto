import { Schema as S } from 'effect'
import { GitHubUser, GitHubRepository, GitHubIssue, GitHubPullRequest, AuthenticationError, NetworkError, NotFoundError } from './schemas'
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
      enableAccountSwitcher: S.Boolean,
    }),
    errors: S.Union(NetworkError),
  },
} as const

/**
 * GitHub IPC Contracts
 */
export const GitHubIpcContracts = {
  signIn: {
    channel: 'github:signIn' as const,
    input: S.Void,
    output: S.Struct({
      user: GitHubUser,
      token: S.Redacted(S.String),
    }),
    errors: S.Union(AuthenticationError, NetworkError),
  },

  checkAuth: {
    channel: 'github:checkAuth' as const,
    input: S.Void,
    output: S.Struct({
      authenticated: S.Boolean,
      user: S.optional(GitHubUser),
    }),
    errors: S.Union(NetworkError),
  },

  signOut: {
    channel: 'github:signOut' as const,
    input: S.Void,
    output: S.Void,
    errors: S.Union(NetworkError),
  },
  
  getRepos: {
    channel: 'github:getRepos' as const,
    input: S.Struct({ username: S.optional(S.String) }),
    output: S.Array(GitHubRepository),
    errors: S.Union(AuthenticationError, NetworkError),
  },
  
  getRepo: {
    channel: 'github:getRepo' as const,
    input: S.Struct({ owner: S.String, repo: S.String }),
    output: GitHubRepository,
    errors: S.Union(AuthenticationError, NetworkError, NotFoundError),
  },
  
  getIssues: {
    channel: 'github:getIssues' as const,
    input: S.Struct({
      owner: S.String,
      repo: S.String,
      state: S.optional(S.Literal('open', 'closed', 'all')),
    }),
    output: S.Array(GitHubIssue),
    errors: S.Union(AuthenticationError, NetworkError, NotFoundError),
  },
  
  getPullRequests: {
    channel: 'github:getPullRequests' as const,
    input: S.Struct({
      owner: S.String,
      repo: S.String,
      state: S.optional(S.Literal('open', 'closed', 'all')),
    }),
    output: S.Array(GitHubPullRequest),
    errors: S.Union(AuthenticationError, NetworkError, NotFoundError),
  },
} as const

/**
 * Combined IPC Contracts
 */
export const IpcContracts = {
  ...AccountIpcContracts,
  ...GitHubIpcContracts,
} as const

export type IpcContracts = typeof IpcContracts
export type IpcChannels = keyof IpcContracts

