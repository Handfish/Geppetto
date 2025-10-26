import { Schema as S } from 'effect'
import { Data } from 'effect'

/**
 * RemoteUrl - Value object representing a Git remote URL
 *
 * Git remotes can use various URL formats:
 * - HTTPS: https://github.com/user/repo.git
 * - SSH: git@github.com:user/repo.git
 * - Git protocol: git://github.com/user/repo.git
 * - File: /path/to/repo.git or file:///path/to/repo.git
 */
export class RemoteUrl extends S.Class<RemoteUrl>('RemoteUrl')({
  value: S.String.pipe(
    S.nonEmptyString(),
    S.annotations({
      title: 'Remote URL',
      description: 'Git remote repository URL',
      examples: [
        'https://github.com/user/repo.git',
        'git@github.com:user/repo.git',
        'git://github.com/user/repo.git',
      ],
    })
  ),
}) {
  /**
   * Get the protocol (https, ssh, git, file)
   */
  getProtocol(): string {
    if (this.value.startsWith('https://')) return 'https'
    if (this.value.startsWith('http://')) return 'http'
    if (this.value.startsWith('git@')) return 'ssh'
    if (this.value.startsWith('ssh://')) return 'ssh'
    if (this.value.startsWith('git://')) return 'git'
    if (this.value.startsWith('file://')) return 'file'
    if (this.value.startsWith('/')) return 'file'
    return 'unknown'
  }

  /**
   * Check if this is an HTTPS URL
   */
  isHttps(): boolean {
    return this.getProtocol() === 'https'
  }

  /**
   * Check if this is an SSH URL
   */
  isSsh(): boolean {
    return this.getProtocol() === 'ssh'
  }

  /**
   * Check if this is a local file path
   */
  isLocal(): boolean {
    return this.getProtocol() === 'file'
  }

  /**
   * Extract the host (e.g., 'github.com')
   */
  getHost(): string | undefined {
    const protocol = this.getProtocol()

    if (protocol === 'https' || protocol === 'http') {
      const match = this.value.match(/^https?:\/\/([^/]+)/)
      return match?.[1]
    }

    if (protocol === 'ssh') {
      if (this.value.startsWith('git@')) {
        const match = this.value.match(/^git@([^:]+):/)
        return match?.[1]
      }
      const match = this.value.match(/^ssh:\/\/(?:git@)?([^/]+)/)
      return match?.[1]
    }

    if (protocol === 'git') {
      const match = this.value.match(/^git:\/\/([^/]+)/)
      return match?.[1]
    }

    return undefined
  }

  /**
   * Extract the repository path (owner/repo)
   */
  getRepositoryPath(): string | undefined {
    const protocol = this.getProtocol()

    if (protocol === 'https' || protocol === 'http' || protocol === 'git') {
      const match = this.value.match(/^(?:https?|git):\/\/[^/]+\/(.+?)(?:\.git)?$/)
      return match?.[1]
    }

    if (protocol === 'ssh') {
      if (this.value.startsWith('git@')) {
        const match = this.value.match(/^git@[^:]+:(.+?)(?:\.git)?$/)
        return match?.[1]
      }
      const match = this.value.match(/^ssh:\/\/(?:git@)?[^/]+\/(.+?)(?:\.git)?$/)
      return match?.[1]
    }

    return undefined
  }

  /**
   * Extract owner and repository name
   */
  getOwnerAndRepo(): { owner: string; repo: string } | undefined {
    const repoPath = this.getRepositoryPath()
    if (!repoPath) return undefined

    const parts = repoPath.split('/')
    if (parts.length < 2) return undefined

    return {
      owner: parts[0],
      repo: parts[parts.length - 1].replace(/\.git$/, ''),
    }
  }

  /**
   * Check if this URL is from GitHub
   */
  isGitHub(): boolean {
    const host = this.getHost()
    return host === 'github.com' || host?.endsWith('.github.com') || false
  }

  /**
   * Check if this URL is from GitLab
   */
  isGitLab(): boolean {
    const host = this.getHost()
    return host === 'gitlab.com' || host?.endsWith('.gitlab.com') || false
  }

  /**
   * Check if this URL is from Bitbucket
   */
  isBitbucket(): boolean {
    const host = this.getHost()
    return host === 'bitbucket.org' || host?.endsWith('.bitbucket.org') || false
  }

  /**
   * Get the provider type (github, gitlab, bitbucket, other)
   */
  getProviderType(): 'github' | 'gitlab' | 'bitbucket' | 'other' {
    if (this.isGitHub()) return 'github'
    if (this.isGitLab()) return 'gitlab'
    if (this.isBitbucket()) return 'bitbucket'
    return 'other'
  }

  /**
   * Compare two remote URLs for equality
   */
  equals(other: RemoteUrl): boolean {
    // Normalize URLs for comparison
    const normalize = (url: string) => url.replace(/\.git$/, '').toLowerCase()
    return normalize(this.value) === normalize(other.value)
  }
}

/**
 * Error thrown when creating an invalid remote URL
 */
export class InvalidRemoteUrlError extends Data.TaggedError('InvalidRemoteUrlError')<{
  value: string
  reason: string
}> {}

/**
 * Smart constructor for RemoteUrl with validation
 */
export const makeRemoteUrl = (value: string): RemoteUrl => {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new InvalidRemoteUrlError({
      value,
      reason: 'Remote URL cannot be empty',
    })
  }

  // Basic validation - just check it's not obviously invalid
  const validProtocols = /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/|\/)/
  if (!validProtocols.test(trimmed)) {
    throw new InvalidRemoteUrlError({
      value,
      reason: 'Remote URL must start with a valid protocol (https://, git@, ssh://, git://, file://, or /)',
    })
  }

  return new RemoteUrl({ value: trimmed })
}
