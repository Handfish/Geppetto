import { Schema as S } from 'effect'

export class GitHubUser extends S.Class<GitHubUser>('GitHubUser')({
  login: S.String,
  id: S.Number,
  name: S.NullOr(S.String),
  avatar_url: S.String,
  email: S.optional(S.NullOr(S.String)),
}) {}
