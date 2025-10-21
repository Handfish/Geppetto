import { Schema as S } from 'effect'
import { GitHubUser } from '../user'

// Branch reference in a pull request
export class PullRequestBranch extends S.Class<PullRequestBranch>('PullRequestBranch')({
  label: S.String,
  ref: S.String,
  sha: S.String,
  user: GitHubUser,
  repo: S.optional(
    S.Struct({
      id: S.Number,
      name: S.String,
      full_name: S.String,
    })
  ),
}) {}

// GitHub Pull Request
export class GitHubPullRequest extends S.Class<GitHubPullRequest>('GitHubPullRequest')({
  id: S.Number,
  number: S.Number,
  state: S.Literal('open', 'closed'),
  title: S.String,
  body: S.NullOr(S.String),
  user: GitHubUser,
  html_url: S.String,
  created_at: S.String,
  updated_at: S.String,
  closed_at: S.optional(S.NullOr(S.String)),
  merged_at: S.optional(S.NullOr(S.String)),
  draft: S.Boolean,
  merged: S.optional(S.Boolean),
  head: PullRequestBranch,
  base: PullRequestBranch,
}) {}
