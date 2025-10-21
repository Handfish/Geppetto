import { Schema as S } from 'effect'
import { GitHubUser } from './user'

export class GitHubIssue extends S.Class<GitHubIssue>('GitHubIssue')({
  id: S.Number,
  number: S.Number,
  title: S.String,
  body: S.NullOr(S.String),
  state: S.Literal('open', 'closed'),
  user: GitHubUser,
  created_at: S.String,
  updated_at: S.String,
  html_url: S.String,
}) {}

