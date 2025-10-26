import { Schema as S } from 'effect'
import { CommitHash } from '../value-objects/commit-hash'

/**
 * GitAuthor - Represents a Git commit author or committer
 */
export class GitAuthor extends S.Class<GitAuthor>('GitAuthor')({
  name: S.String,
  email: S.String,
  timestamp: S.Date,
}) {}

/**
 * Commit - Entity representing a Git commit
 *
 * A commit is the basic unit of version control in Git. It contains:
 * - A unique hash (SHA-1 or SHA-256)
 * - Parent commit references
 * - Author and committer information
 * - Commit message
 * - Tree reference
 *
 * Domain invariants:
 * - Commits are immutable (except in Git rewrite operations)
 * - First commit has no parents
 * - Merge commits have 2+ parents
 * - Regular commits have exactly 1 parent
 */
export class Commit extends S.Class<Commit>('Commit')({
  hash: CommitHash,
  parents: S.Array(CommitHash),
  author: GitAuthor,
  committer: GitAuthor,
  message: S.String,
  subject: S.String, // First line of message
  body: S.optional(S.String), // Rest of message
  tree: S.String, // Tree SHA
}) {
  /**
   * Check if this is the initial commit (no parents)
   */
  isInitialCommit(): boolean {
    return this.parents.length === 0
  }

  /**
   * Check if this is a merge commit (2+ parents)
   */
  isMergeCommit(): boolean {
    return this.parents.length >= 2
  }

  /**
   * Check if this is a regular commit (exactly 1 parent)
   */
  isRegularCommit(): boolean {
    return this.parents.length === 1
  }

  /**
   * Get the number of parents
   */
  getParentCount(): number {
    return this.parents.length
  }

  /**
   * Get the first parent (for merge commits, this is the branch being merged into)
   */
  getFirstParent(): CommitHash | undefined {
    return this.parents[0]
  }

  /**
   * Get merge parents (all parents except the first)
   */
  getMergeParents(): CommitHash[] {
    return this.parents.slice(1)
  }

  /**
   * Check if commit message is empty or just whitespace
   */
  hasEmptyMessage(): boolean {
    return this.message.trim().length === 0
  }

  /**
   * Get short subject (first 50 characters)
   */
  getShortSubject(): string {
    if (this.subject.length <= 50) {
      return this.subject
    }
    return this.subject.slice(0, 47) + '...'
  }

  /**
   * Compare commits by timestamp (for sorting)
   */
  isNewerThan(other: Commit): boolean {
    return this.author.timestamp.getTime() > other.author.timestamp.getTime()
  }

  /**
   * Compare commits by hash (for equality)
   */
  equals(other: Commit): boolean {
    return this.hash.equals(other.hash)
  }
}

/**
 * CommitWithRefs - Commit with additional reference information
 *
 * Used in commit graph to show which branches/tags point to this commit
 */
export class CommitWithRefs extends S.Class<CommitWithRefs>('CommitWithRefs')({
  commit: Commit,
  branches: S.Array(S.String), // Branch names pointing to this commit
  tags: S.Array(S.String), // Tag names pointing to this commit
  isHead: S.Boolean, // Is this the current HEAD
}) {
  /**
   * Check if this commit has any references
   */
  hasRefs(): boolean {
    return this.branches.length > 0 || this.tags.length > 0 || this.isHead
  }

  /**
   * Get all reference labels
   */
  getRefLabels(): string[] {
    const labels: string[] = []

    if (this.isHead) {
      labels.push('HEAD')
    }

    labels.push(...this.branches)
    labels.push(...this.tags)

    return labels
  }
}

/**
 * CommitRange - Represents a range of commits
 */
export class CommitRange extends S.Class<CommitRange>('CommitRange')({
  from: CommitHash,
  to: CommitHash,
}) {
  /**
   * Get Git range notation (from..to)
   */
  toGitNotation(): string {
    return `${this.from.value}..${this.to.value}`
  }

  /**
   * Get Git range notation for exclusive range (from...to)
   */
  toGitExclusiveNotation(): string {
    return `${this.from.value}...${this.to.value}`
  }
}
