import { Schema as S } from 'effect'
import { GitHubUser } from './user'

/**
 * GitHub Issue Label
 */
export class GitHubLabel extends S.Class<GitHubLabel>('GitHubLabel')({
  name: S.String,
  color: S.String,
  description: S.NullOr(S.String),
}) {}

/**
 * GitHub Issue - enhanced with labels and assignees
 */
export class GitHubIssue extends S.Class<GitHubIssue>('GitHubIssue')({
  id: S.Number,
  number: S.Number,
  title: S.String,
  body: S.NullOr(S.String),
  state: S.Literal('open', 'closed'),
  user: GitHubUser,
  labels: S.Array(GitHubLabel),
  assignees: S.Array(GitHubUser),
  created_at: S.String,
  updated_at: S.String,
  html_url: S.String,
}) {}

/**
 * GitHub Issue Comment
 */
export class GitHubIssueComment extends S.Class<GitHubIssueComment>(
  'GitHubIssueComment'
)({
  id: S.Number,
  body: S.String,
  user: GitHubUser,
  created_at: S.String,
  updated_at: S.String,
}) {}
