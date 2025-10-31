import { Schema as S } from 'effect'

export class GitHubUser extends S.Class<GitHubUser>('GitHubUser')({
  login: S.String,
  id: S.Number,
  name: S.optional(S.NullOr(S.String)), // Optional because API may omit this field
  avatar_url: S.String,
  email: S.optional(S.NullOr(S.String)),
}) {}
