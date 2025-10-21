import { Schema as S } from 'effect'
import { GitHubUser } from '../../shared/schemas'

export class GitHubTokenResponse extends S.Class<GitHubTokenResponse>('GitHubTokenResponse')({
  access_token: S.String,
  token_type: S.String,
  scope: S.optional(S.String),
}) {}

export class StoredGitHubAuth extends S.Class<StoredGitHubAuth>('StoredGitHubAuth')({
  token: S.Redacted(S.String),
  user: GitHubUser,
}) {}

