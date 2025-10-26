import { Schema as S } from 'effect'
import { Data } from 'effect'

/**
 * CommitHash - Value object representing a Git commit SHA-1 hash
 *
 * A commit hash is a 40-character hexadecimal string (SHA-1) or 64-character (SHA-256).
 * This value object ensures hash validity and provides type safety.
 *
 * Domain invariants:
 * - Must be a valid hexadecimal string
 * - Must be 7-40 characters (short SHA) or 40 characters (full SHA-1) or 64 characters (SHA-256)
 * - Cannot be empty or whitespace
 */
export class CommitHash extends S.Class<CommitHash>('CommitHash')({
  value: S.String.pipe(
    S.pattern(/^[0-9a-f]{7,64}$/i),
    S.annotations({
      title: 'Commit Hash',
      description: 'Git commit SHA-1 or SHA-256 hash',
      examples: ['abc123f', '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12'],
    })
  ),
}) {
  /**
   * Check if this is a short hash (less than full SHA-1 length)
   */
  isShort(): boolean {
    return this.value.length < 40
  }

  /**
   * Check if this is a full SHA-1 hash
   */
  isFullSHA1(): boolean {
    return this.value.length === 40
  }

  /**
   * Check if this is a full SHA-256 hash
   */
  isFullSHA256(): boolean {
    return this.value.length === 64
  }

  /**
   * Get abbreviated hash (7 characters)
   */
  toShort(): string {
    return this.value.slice(0, 7)
  }

  /**
   * Compare two commit hashes for equality
   */
  equals(other: CommitHash): boolean {
    return this.value.toLowerCase() === other.value.toLowerCase()
  }

  /**
   * Check if this hash starts with the given prefix (for short hash matching)
   */
  startsWith(prefix: string): boolean {
    return this.value.toLowerCase().startsWith(prefix.toLowerCase())
  }
}

/**
 * Error thrown when creating an invalid commit hash
 */
export class InvalidCommitHashError extends Data.TaggedError('InvalidCommitHashError')<{
  value: string
  reason: string
}> {}

/**
 * Smart constructor for CommitHash with validation
 */
export const makeCommitHash = (value: string): CommitHash => {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new InvalidCommitHashError({
      value,
      reason: 'Commit hash cannot be empty',
    })
  }

  if (!/^[0-9a-f]{7,64}$/i.test(trimmed)) {
    throw new InvalidCommitHashError({
      value,
      reason: 'Commit hash must be a valid hexadecimal string (7-64 characters)',
    })
  }

  return new CommitHash({ value: trimmed.toLowerCase() })
}
