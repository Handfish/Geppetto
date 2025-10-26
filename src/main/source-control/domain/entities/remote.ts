import { Schema as S } from 'effect'
import { RemoteUrl } from '../value-objects/remote-url'

/**
 * RemoteName - Value object for remote name
 */
export class RemoteName extends S.Class<RemoteName>('RemoteName')({
  value: S.String.pipe(
    S.nonEmptyString(),
    S.annotations({
      title: 'Remote Name',
      description: 'Git remote name (e.g., origin, upstream)',
      examples: ['origin', 'upstream', 'fork'],
    })
  ),
}) {
  /**
   * Check if this is the default origin remote
   */
  isOrigin(): boolean {
    return this.value === 'origin'
  }

  /**
   * Check if this is an upstream remote
   */
  isUpstream(): boolean {
    return this.value === 'upstream'
  }

  /**
   * Compare remote names for equality
   */
  equals(other: RemoteName): boolean {
    return this.value === other.value
  }
}

/**
 * RefSpec - Git refspec for fetch/push
 *
 * A refspec maps remote refs to local refs:
 * - Fetch: +refs/heads/*:refs/remotes/origin/*
 * - Push: refs/heads/main:refs/heads/main
 */
export class RefSpec extends S.Class<RefSpec>('RefSpec')({
  source: S.String, // Source ref pattern
  destination: S.String, // Destination ref pattern
  force: S.Boolean, // Force update (+ prefix)
}) {
  /**
   * Get the refspec string
   */
  toString(): string {
    const prefix = this.force ? '+' : ''
    return `${prefix}${this.source}:${this.destination}`
  }

  /**
   * Check if this is a wildcard refspec
   */
  isWildcard(): boolean {
    return this.source.includes('*') || this.destination.includes('*')
  }

  /**
   * Check if this refspec allows force updates
   */
  allowsForce(): boolean {
    return this.force
  }
}

/**
 * Remote - Entity representing a Git remote
 *
 * A remote is a reference to a remote repository. It contains:
 * - Name (e.g., "origin")
 * - URL for fetching
 * - URL for pushing (may be different from fetch URL)
 * - Refspecs for mapping remote refs to local refs
 *
 * Domain invariants:
 * - Remote name must be unique within a repository
 * - At least one URL (fetch or push) must be defined
 * - Most remotes have "origin" as default name
 */
export class Remote extends S.Class<Remote>('Remote')({
  name: RemoteName,
  fetchUrl: RemoteUrl,
  pushUrl: S.optional(RemoteUrl), // If undefined, uses fetchUrl
  fetchRefSpecs: S.Array(RefSpec),
  pushRefSpecs: S.Array(RefSpec),
}) {
  /**
   * Get the effective push URL (uses fetchUrl if pushUrl is undefined)
   */
  getEffectivePushUrl(): RemoteUrl {
    return this.pushUrl ?? this.fetchUrl
  }

  /**
   * Check if this remote has separate push and fetch URLs
   */
  hasSeparatePushUrl(): boolean {
    return this.pushUrl !== undefined && !this.pushUrl.equals(this.fetchUrl)
  }

  /**
   * Check if this is the origin remote
   */
  isOrigin(): boolean {
    return this.name.isOrigin()
  }

  /**
   * Check if this is an upstream remote
   */
  isUpstream(): boolean {
    return this.name.isUpstream()
  }

  /**
   * Get the provider type (github, gitlab, bitbucket, other)
   */
  getProviderType(): 'github' | 'gitlab' | 'bitbucket' | 'other' {
    return this.fetchUrl.getProviderType()
  }

  /**
   * Check if this remote is from GitHub
   */
  isGitHub(): boolean {
    return this.fetchUrl.isGitHub()
  }

  /**
   * Check if this remote is from GitLab
   */
  isGitLab(): boolean {
    return this.fetchUrl.isGitLab()
  }

  /**
   * Check if this remote is from Bitbucket
   */
  isBitbucket(): boolean {
    return this.fetchUrl.isBitbucket()
  }

  /**
   * Get repository owner and name from URL
   */
  getOwnerAndRepo(): { owner: string; repo: string } | undefined {
    return this.fetchUrl.getOwnerAndRepo()
  }

  /**
   * Compare remotes by name for equality
   */
  equals(other: Remote): boolean {
    return this.name.equals(other.name)
  }
}

/**
 * RemoteConnection - State of connection to remote
 */
export class RemoteConnection extends S.Class<RemoteConnection>('RemoteConnection')({
  remote: Remote,
  isReachable: S.Boolean,
  lastFetchTime: S.optional(S.Date),
  lastPushTime: S.optional(S.Date),
  error: S.optional(S.String),
}) {
  /**
   * Check if remote is currently reachable
   */
  isConnected(): boolean {
    return this.isReachable && this.error === undefined
  }

  /**
   * Check if remote has connection errors
   */
  hasError(): boolean {
    return this.error !== undefined
  }

  /**
   * Check if remote has been fetched
   */
  hasFetched(): boolean {
    return this.lastFetchTime !== undefined
  }

  /**
   * Check if remote has been pushed to
   */
  hasPushed(): boolean {
    return this.lastPushTime !== undefined
  }

  /**
   * Get time since last fetch
   */
  getTimeSinceLastFetch(): number | undefined {
    if (!this.lastFetchTime) return undefined
    return Date.now() - this.lastFetchTime.getTime()
  }
}
