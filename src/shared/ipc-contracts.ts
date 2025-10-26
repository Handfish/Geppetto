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
  GitOperationError,
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
import { WorkspaceConfig } from './schemas/workspace'
import {
  AiWatcher,
  AiWatcherConfig,
  LogEntry,
  TmuxSession,
} from './schemas/ai-watchers'
import {
  ProcessError,
  WatcherNotFoundError,
  WatcherOperationError,
  TmuxError,
} from './schemas/ai-watchers/errors'

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
 * Workspace Management IPC Contracts
 */
export const WorkspaceIpcContracts = {
  getWorkspaceConfig: {
    channel: 'workspace:getConfig' as const,
    input: S.Void,
    output: WorkspaceConfig,
    errors: S.Union(NetworkError),
  },

  setWorkspacePath: {
    channel: 'workspace:setPath' as const,
    input: S.Struct({ path: S.String }),
    output: S.Void,
    errors: S.Union(NetworkError),
  },

  selectWorkspaceDirectory: {
    channel: 'workspace:selectDirectory' as const,
    input: S.Void,
    output: S.NullOr(S.String),
    errors: S.Union(NetworkError),
  },

  cloneToWorkspace: {
    channel: 'workspace:cloneToWorkspace' as const,
    input: S.Struct({
      cloneUrl: S.String,
      repoName: S.String,
      owner: S.String,
      defaultBranch: S.String,
      provider: S.String,
    }),
    output: S.Struct({
      bareRepoPath: S.String,
      worktreePath: S.String,
    }),
    errors: S.Union(NetworkError, NotFoundError, GitOperationError),
  },

  checkRepositoryInWorkspace: {
    channel: 'workspace:checkRepositoryInWorkspace' as const,
    input: S.Struct({
      owner: S.String,
      repoName: S.String,
      provider: S.String,
      defaultBranch: S.String,
    }),
    output: S.Struct({
      inWorkspace: S.Boolean,
      bareRepoPath: S.NullOr(S.String),
      worktreePath: S.NullOr(S.String),
    }),
    errors: S.Union(NetworkError),
  },
} as const

/**
 * AI Watcher IPC Contracts
 */
export const AiWatcherIpcContracts = {
  'ai-watcher:create': {
    channel: 'ai-watcher:create' as const,
    input: AiWatcherConfig,
    output: AiWatcher,
    errors: S.Union(ProcessError, WatcherOperationError),
  },

  'ai-watcher:attach-tmux': {
    channel: 'ai-watcher:attach-tmux' as const,
    input: S.Struct({ sessionName: S.String }),
    output: AiWatcher,
    errors: S.Union(TmuxError, ProcessError, WatcherOperationError),
  },

  'ai-watcher:list': {
    channel: 'ai-watcher:list' as const,
    input: S.Void,
    output: S.Array(AiWatcher),
    errors: S.Never,
  },

  'ai-watcher:get': {
    channel: 'ai-watcher:get' as const,
    input: S.Struct({ watcherId: S.String }),
    output: AiWatcher,
    errors: S.Union(WatcherNotFoundError),
  },

  'ai-watcher:stop': {
    channel: 'ai-watcher:stop' as const,
    input: S.Struct({ watcherId: S.String }),
    output: S.Void,
    errors: S.Union(WatcherNotFoundError, ProcessError),
  },

  'ai-watcher:start': {
    channel: 'ai-watcher:start' as const,
    input: S.Struct({ watcherId: S.String }),
    output: S.Void,
    errors: S.Union(WatcherNotFoundError, WatcherOperationError),
  },

  'ai-watcher:get-logs': {
    channel: 'ai-watcher:get-logs' as const,
    input: S.Struct({
      watcherId: S.String,
      limit: S.optional(S.Number),
    }),
    output: S.Array(LogEntry),
    errors: S.Union(WatcherNotFoundError),
  },

  'ai-watcher:list-tmux': {
    channel: 'ai-watcher:list-tmux' as const,
    input: S.Void,
    output: S.Array(TmuxSession),
    errors: S.Union(TmuxError),
  },
} as const

/**
 * Source Control IPC Contracts
 */
import {
  Repository,
  RepositoryId,
  RepositoryMetadata,
  RepositoryDiscoveryInfo,
} from './schemas/source-control/repository'
import {
  CommitGraph,
  GraphOptions,
  GraphStatistics,
  Commit,
  CommitWithRefs,
} from './schemas/source-control/commit-graph'
import {
  WorkingTree,
  WorkingTreeStatus,
  FileChange,
  StashEntry,
} from './schemas/source-control/working-tree'

export const SourceControlIpcContracts = {
  // Repository Management
  'source-control:discover-repositories': {
    channel: 'source-control:discover-repositories' as const,
    input: S.Struct({
      searchPaths: S.Array(S.String),
    }),
    output: S.Array(Repository),
    errors: S.Union(NetworkError, GitOperationError),
  },

  'source-control:get-repository': {
    channel: 'source-control:get-repository' as const,
    input: S.Struct({
      path: S.String,
    }),
    output: Repository,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-repository-by-id': {
    channel: 'source-control:get-repository-by-id' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: Repository,
    errors: S.Union(NotFoundError),
  },

  'source-control:refresh-repository': {
    channel: 'source-control:refresh-repository' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: Repository,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:validate-repository': {
    channel: 'source-control:validate-repository' as const,
    input: S.Struct({
      path: S.String,
    }),
    output: RepositoryDiscoveryInfo,
    errors: S.Never,
  },

  'source-control:get-repository-metadata': {
    channel: 'source-control:get-repository-metadata' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: RepositoryMetadata,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-all-repositories': {
    channel: 'source-control:get-all-repositories' as const,
    input: S.Void,
    output: S.Array(Repository),
    errors: S.Never,
  },

  'source-control:forget-repository': {
    channel: 'source-control:forget-repository' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: S.Void,
    errors: S.Never,
  },

  // Commit Graph Operations
  'source-control:build-commit-graph': {
    channel: 'source-control:build-commit-graph' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      options: S.optional(GraphOptions),
    }),
    output: CommitGraph,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-commit-graph-statistics': {
    channel: 'source-control:get-commit-graph-statistics' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: GraphStatistics,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-commit': {
    channel: 'source-control:get-commit' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      commitHash: S.String,
    }),
    output: Commit,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-commit-with-refs': {
    channel: 'source-control:get-commit-with-refs' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      commitHash: S.String,
    }),
    output: CommitWithRefs,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-commit-history': {
    channel: 'source-control:get-commit-history' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      branchName: S.String,
      maxCount: S.optional(S.Number),
    }),
    output: S.Array(Commit),
    errors: S.Union(NotFoundError, GitOperationError),
  },

  // Working Tree Operations
  'source-control:get-status': {
    channel: 'source-control:get-status' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: WorkingTree,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-status-summary': {
    channel: 'source-control:get-status-summary' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: WorkingTreeStatus,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:stage-files': {
    channel: 'source-control:stage-files' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      paths: S.Array(S.String),
    }),
    output: WorkingTree,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:unstage-files': {
    channel: 'source-control:unstage-files' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      paths: S.Array(S.String),
    }),
    output: WorkingTree,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:discard-changes': {
    channel: 'source-control:discard-changes' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      paths: S.Array(S.String),
    }),
    output: WorkingTree,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:get-diff': {
    channel: 'source-control:get-diff' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      path: S.String,
      staged: S.optional(S.Boolean),
    }),
    output: S.String,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:create-stash': {
    channel: 'source-control:create-stash' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      message: S.optional(S.String),
      includeUntracked: S.optional(S.Boolean),
    }),
    output: S.String,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:list-stashes': {
    channel: 'source-control:list-stashes' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: S.Array(StashEntry),
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:pop-stash': {
    channel: 'source-control:pop-stash' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      stashIndex: S.optional(S.Number),
    }),
    output: WorkingTree,
    errors: S.Union(NotFoundError, GitOperationError),
  },
} as const

/**
 * Combined IPC Contracts
 */
export const IpcContracts = {
  ...AccountIpcContracts,
  ...ProviderIpcContracts,
  ...AiProviderIpcContracts,
  ...WorkspaceIpcContracts,
  ...AiWatcherIpcContracts,
  ...SourceControlIpcContracts,
} as const

export type IpcContracts = typeof IpcContracts
export type IpcChannels = keyof IpcContracts
