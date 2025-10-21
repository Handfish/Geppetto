import { Schema as S } from 'effect'
import { GitHubUser, GitHubRepository, GitHubIssue, AuthenticationError, NetworkError, NotFoundError } from './schemas'

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
    output: S.Array(S.Unknown),
    errors: S.Union(AuthenticationError, NetworkError, NotFoundError),
  },
} as const

export type IpcContracts = typeof GitHubIpcContracts
export type IpcChannels = keyof IpcContracts

