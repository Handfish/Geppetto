import { Schema as S } from 'effect'

export class GitHubRepository extends S.Class<GitHubRepository>('GitHubRepository')({
  id: S.Number,
  name: S.String,
  full_name: S.String,
  description: S.NullOr(S.String),
  html_url: S.String,
  stargazers_count: S.Number,
  language: S.NullOr(S.String),
  updated_at: S.String,
  private: S.Boolean,
}) {}

