import { Schema as S } from 'effect'

/**
 * Provider types supported for AI integrations.
 * Kept isolated from VCS providers to avoid accidental mixing.
 */
export const AiProviderType = S.Literal('openai', 'claude')
export type AiProviderType = S.Schema.Type<typeof AiProviderType>

/**
 * Unique identifier for AI accounts.
 * Format: `{provider}:{accountKey}`
 */
export const AiAccountId = S.String.pipe(
  S.brand('AiAccountId'),
  S.pattern(/^(openai|claude):[A-Za-z0-9._-]+$/)
)
export type AiAccountId = S.Schema.Type<typeof AiAccountId>

/**
 * Account entity representing an authenticated AI provider credential.
 */
export class AiAccount extends S.Class<AiAccount>('AiAccount')({
  id: AiAccountId,
  provider: AiProviderType,
  label: S.String,
  apiKeyPreview: S.optional(S.String),
  createdAt: S.Date,
  lastUsedAt: S.Date,
}) {
  /**
   * Helper to construct identifiers consistently.
   */
  static makeAccountId(provider: AiProviderType, identifier: string): AiAccountId {
    return `${provider}:${identifier}` as AiAccountId
  }

  static parseAccountId(accountId: AiAccountId): { provider: AiProviderType; identifier: string } {
    const [provider, identifier] = accountId.split(':') as [AiProviderType, string]
    return { provider, identifier }
  }
}

/**
 * Aggregate root storing all AI accounts.
 */
export class AiAccountContext extends S.Class<AiAccountContext>('AiAccountContext')({
  accounts: S.Array(AiAccount),
  activeAccountId: S.NullOr(AiAccountId),
  lastModified: S.Date,
}) {
  getActiveAccount(): AiAccount | null {
    if (!this.activeAccountId) {
      return null
    }
    return this.accounts.find((account) => account.id === this.activeAccountId) ?? null
  }

  getAccountsByProvider(provider: AiProviderType): ReadonlyArray<AiAccount> {
    return this.accounts.filter((account) => account.provider === provider)
  }

  getAccount(accountId: AiAccountId): AiAccount | null {
    return this.accounts.find((account) => account.id === accountId) ?? null
  }

  hasAccount(accountId: AiAccountId): boolean {
    return this.accounts.some((account) => account.id === accountId)
  }

  countAccountsByProvider(provider: AiProviderType): number {
    return this.getAccountsByProvider(provider).length
  }

  static empty(): AiAccountContext {
    return new AiAccountContext({
      accounts: [],
      activeAccountId: null,
      lastModified: new Date(),
    })
  }
}

/**
 * Result returned after a successful sign-in flow.
 */
export class AiProviderSignInResult extends S.Class<AiProviderSignInResult>(
  'AiProviderSignInResult'
)({
  provider: AiProviderType,
  accountId: AiAccountId,
  label: S.String,
  metadata: S.Struct({
    accountIdentifier: S.String,
  }),
}) {}

/**
 * Authentication status for AI providers.
 */
export class AiProviderAuthStatus extends S.Class<AiProviderAuthStatus>(
  'AiProviderAuthStatus'
)({
  provider: AiProviderType,
  accountId: AiAccountId,
  authenticated: S.Boolean,
}) {}

/**
 * Usage metric describing a single CLI tool quota.
 */
export class AiUsageMetric extends S.Class<AiUsageMetric>('AiUsageMetric')({
  toolId: S.String,
  toolName: S.String,
  used: S.Number,
  limit: S.optional(S.Number),
  usagePercentage: S.Number.pipe(
    S.greaterThanOrEqualTo(0),
    S.lessThanOrEqualTo(100)
  ),
  unit: S.optional(S.String),
}) {}

/**
 * Usage snapshot aggregated for a provider account.
 */
export class AiUsageSnapshot extends S.Class<AiUsageSnapshot>('AiUsageSnapshot')({
  provider: AiProviderType,
  accountId: AiAccountId,
  capturedAt: S.Date,
  metrics: S.Array(AiUsageMetric),
}) {}
