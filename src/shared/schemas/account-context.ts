/**
 * AccountContext Domain Aggregate
 *
 * Central domain model for managing multiple provider accounts.
 * Implements DDD aggregate pattern with AccountContext as the root.
 */

import { Schema as S } from 'effect'

/**
 * Provider types supported by the application
 */
export const ProviderType = S.Literal('github', 'gitlab', 'bitbucket', 'gitea')
export type ProviderType = S.Schema.Type<typeof ProviderType>

/**
 * Unique identifier for an account across providers
 * Format: `{provider}:{userId}`
 * Example: "github:12345", "gitlab:67890"
 */
export const AccountId = S.String.pipe(
  S.brand('AccountId'),
  S.pattern(/^(github|gitlab|bitbucket|gitea):[A-Za-z0-9._-]+$/)
)
export type AccountId = S.Schema.Type<typeof AccountId>

/**
 * Account status
 */
export const AccountStatus = S.Literal('active', 'expired', 'revoked')
export type AccountStatus = S.Schema.Type<typeof AccountStatus>

/**
 * Account entity - represents a single authenticated provider account
 */
export class Account extends S.Class<Account>('Account')({
  /** Unique account identifier */
  id: AccountId,
  /** Provider type */
  provider: ProviderType,
  /** Provider's user ID (as string for consistency) */
  providerId: S.String,
  /** Display username */
  username: S.String,
  /** User's display name */
  displayName: S.optional(S.String),
  /** Avatar URL */
  avatarUrl: S.optional(S.String),
  /** Account status */
  status: AccountStatus,
  /** When the account was added */
  createdAt: S.Date,
  /** Last time the account was used */
  lastUsedAt: S.Date,
}) {
  /**
   * Create an AccountId from provider and providerId
   */
  static makeAccountId(provider: ProviderType, providerId: string): AccountId {
    return `${provider}:${providerId}` as AccountId
  }

  /**
   * Parse an AccountId into its components
   */
  static parseAccountId(accountId: AccountId): {
    provider: ProviderType
    providerId: string
  } {
    const [provider, providerId] = accountId.split(':') as [
      ProviderType,
      string,
    ]
    return { provider, providerId }
  }
}

/**
 * AccountContext Aggregate Root
 *
 * Manages all accounts across providers with a single active account per provider.
 * Enforces business rules like tier limits on account counts.
 */
export class AccountContext extends S.Class<AccountContext>('AccountContext')({
  /** All registered accounts */
  accounts: S.Array(Account),
  /** Currently active account ID (null if no accounts) */
  activeAccountId: S.NullOr(AccountId),
  /** When the context was last modified */
  lastModified: S.Date,
}) {
  /**
   * Get the currently active account
   */
  getActiveAccount(): Account | null {
    if (!this.activeAccountId) return null
    return this.accounts.find(acc => acc.id === this.activeAccountId) ?? null
  }

  /**
   * Get all accounts for a specific provider
   */
  getAccountsByProvider(provider: ProviderType): Account[] {
    return this.accounts.filter(acc => acc.provider === provider)
  }

  /**
   * Get an account by its ID
   */
  getAccount(accountId: AccountId): Account | null {
    return this.accounts.find(acc => acc.id === accountId) ?? null
  }

  /**
   * Check if an account exists
   */
  hasAccount(accountId: AccountId): boolean {
    return this.accounts.some(acc => acc.id === accountId)
  }

  /**
   * Count accounts by provider
   */
  countAccountsByProvider(provider: ProviderType): number {
    return this.getAccountsByProvider(provider).length
  }

  /**
   * Get the active account for a specific provider
   */
  getActiveAccountForProvider(provider: ProviderType): Account | null {
    const activeAccount = this.getActiveAccount()
    if (activeAccount?.provider === provider) {
      return activeAccount
    }
    // Fallback to most recently used account for this provider
    return (
      this.getAccountsByProvider(provider).sort(
        (a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime()
      )[0] ?? null
    )
  }

  /**
   * Create an empty AccountContext
   */
  static empty(): AccountContext {
    return new AccountContext({
      accounts: [],
      activeAccountId: null,
      lastModified: new Date(),
    })
  }
}

/**
 * Domain events for AccountContext
 */
export class AccountAddedEvent extends S.Class<AccountAddedEvent>(
  'AccountAddedEvent'
)({
  accountId: AccountId,
  provider: ProviderType,
  occurredAt: S.Date,
}) {}

export class AccountRemovedEvent extends S.Class<AccountRemovedEvent>(
  'AccountRemovedEvent'
)({
  accountId: AccountId,
  provider: ProviderType,
  occurredAt: S.Date,
}) {}

export class AccountSwitchedEvent extends S.Class<AccountSwitchedEvent>(
  'AccountSwitchedEvent'
)({
  fromAccountId: S.NullOr(AccountId),
  toAccountId: AccountId,
  occurredAt: S.Date,
}) {}

export class AccountExpiredEvent extends S.Class<AccountExpiredEvent>(
  'AccountExpiredEvent'
)({
  accountId: AccountId,
  occurredAt: S.Date,
}) {}
