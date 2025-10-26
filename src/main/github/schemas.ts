import { Schema as S } from 'effect'

/**
 * GitHub OAuth Token Response
 * Response from GitHub's token exchange endpoint
 */
export class GitHubTokenResponse extends S.Class<GitHubTokenResponse>(
  'GitHubTokenResponse'
)({
  access_token: S.String,
  token_type: S.String,
  scope: S.optional(S.String),
}) {}
