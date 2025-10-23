import { Schema as S } from 'effect'

export class GitHubRepository extends S.Class<GitHubRepository>('GitHubRepository')({
  id: S.Number,
  name: S.String,
  full_name: S.String,
  description: S.NullOr(S.String),
  html_url: S.String,
  stargazers_count: S.Number,
  forks_count: S.Number,
  open_issues_count: S.Number,
  language: S.NullOr(S.String),
  default_branch: S.String,
  visibility: S.optional(S.Literal('public', 'private', 'internal')),
  owner: S.Struct({
    login: S.String,
    avatar_url: S.optional(S.String),
  }),
  updated_at: S.String,
  private: S.Boolean,
}) {}
