import { Schema as S } from 'effect'
import { Data } from 'effect'

/**
 * BranchName - Value object representing a Git branch name
 *
 * Git branch names have specific rules:
 * - Cannot start or end with a slash
 * - Cannot contain consecutive slashes
 * - Cannot contain certain special characters (see Git check-ref-format)
 * - Cannot be empty
 *
 * Common patterns:
 * - Local branch: "main", "develop", "feature/new-feature"
 * - Remote branch: "origin/main", "upstream/develop"
 */
export class BranchName extends S.Class<BranchName>('BranchName')({
  value: S.String.pipe(
    S.nonEmptyString(),
    S.annotations({
      title: 'Branch Name',
      description: 'Git branch name following Git ref naming rules',
      examples: ['main', 'develop', 'feature/authentication', 'origin/main'],
    })
  ),
}) {
  /**
   * Check if this is a remote branch (contains '/')
   */
  isRemote(): boolean {
    return this.value.includes('/')
  }

  /**
   * Get the short name (without remote prefix)
   * e.g., "origin/main" -> "main"
   */
  getShortName(): string {
    if (this.isRemote()) {
      const parts = this.value.split('/')
      return parts.slice(1).join('/')
    }
    return this.value
  }

  /**
   * Get the remote name if this is a remote branch
   * e.g., "origin/main" -> "origin"
   */
  getRemoteName(): string | undefined {
    if (this.isRemote()) {
      return this.value.split('/')[0]
    }
    return undefined
  }

  /**
   * Check if this branch name matches common main branch patterns
   */
  isMainBranch(): boolean {
    const shortName = this.getShortName().toLowerCase()
    return shortName === 'main' || shortName === 'master'
  }

  /**
   * Check if this branch name matches common development branch patterns
   */
  isDevelopBranch(): boolean {
    const shortName = this.getShortName().toLowerCase()
    return shortName === 'develop' || shortName === 'development' || shortName === 'dev'
  }

  /**
   * Compare two branch names for equality
   */
  equals(other: BranchName): boolean {
    return this.value === other.value
  }
}

/**
 * Error thrown when creating an invalid branch name
 */
export class InvalidBranchNameError extends Data.TaggedError('InvalidBranchNameError')<{
  value: string
  reason: string
}> {}

/**
 * Smart constructor for BranchName with validation
 */
export const makeBranchName = (value: string): BranchName => {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new InvalidBranchNameError({
      value,
      reason: 'Branch name cannot be empty',
    })
  }

  // Git branch name validation rules
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
    throw new InvalidBranchNameError({
      value,
      reason: 'Branch name cannot start or end with a slash',
    })
  }

  if (trimmed.includes('//')) {
    throw new InvalidBranchNameError({
      value,
      reason: 'Branch name cannot contain consecutive slashes',
    })
  }

  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    throw new InvalidBranchNameError({
      value,
      reason: 'Branch name cannot start or end with a dot',
    })
  }

  // Check for invalid characters
  const invalidChars = /[\s~^:?*\[\\]/
  if (invalidChars.test(trimmed)) {
    throw new InvalidBranchNameError({
      value,
      reason: 'Branch name contains invalid characters',
    })
  }

  return new BranchName({ value: trimmed })
}
