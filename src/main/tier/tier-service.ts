/**
 * TierService - Feature Gating and Tier Enforcement
 *
 * Enforces tier-based limits on account operations.
 * This service acts as a domain service that validates business rules
 * related to account limits across providers.
 */

import { Effect, Layer, Context, Data } from 'effect'
import { getCurrentTierLimits, type TierLimits } from '../../shared/tier-config'
import { type AccountContext, type ProviderType } from '../../shared/schemas/account-context'

/**
 * TierService errors
 */
export class AccountLimitExceededError extends Data.TaggedError('AccountLimitExceededError')<{
  provider: ProviderType
  currentCount: number
  maxAllowed: number
  tier: string
}> {}

export class FeatureNotAvailableError extends Data.TaggedError('FeatureNotAvailableError')<{
  feature: string
  tier: string
  requiredTier: string
}> {}

/**
 * TierService implementation
 */
export class TierService extends Effect.Service<TierService>()('TierService', {
  sync: () => ({
    /**
     * Get current tier configuration
     */
    getTierLimits: () => getCurrentTierLimits(),

    checkCanAddAccount: (provider: ProviderType, accountContext: AccountContext) =>
      Effect.gen(function* () {
        const limits = getCurrentTierLimits()
        const currentCount = accountContext.countAccountsByProvider(provider)

        let maxAllowed: number
        switch (provider) {
          case 'github':
            maxAllowed = limits.maxGitHubAccounts
            break
          case 'gitlab':
            maxAllowed = limits.maxGitLabAccounts
            break
          case 'bitbucket':
            maxAllowed = limits.maxBitbucketAccounts
            break
          default:
            maxAllowed = 0
        }

        if (currentCount >= maxAllowed) {
          yield* Effect.fail(
            new AccountLimitExceededError({
              provider,
              currentCount,
              maxAllowed,
              tier: limits.tier,
            })
          )
        }
      }),

    checkFeatureAvailable: (feature: string) =>
      Effect.gen(function* () {
        const limits = getCurrentTierLimits()

        // Check specific features
        if (feature === 'account-switcher' && !limits.enableAccountSwitcher) {
          yield* Effect.fail(
            new FeatureNotAvailableError({
              feature,
              tier: limits.tier,
              requiredTier: 'pro',
            })
          )
        }

        if (feature === 'gitlab' && limits.maxGitLabAccounts === 0) {
          yield* Effect.fail(
            new FeatureNotAvailableError({
              feature,
              tier: limits.tier,
              requiredTier: 'pro',
            })
          )
        }

        if (feature === 'bitbucket' && limits.maxBitbucketAccounts === 0) {
          yield* Effect.fail(
            new FeatureNotAvailableError({
              feature,
              tier: limits.tier,
              requiredTier: 'pro',
            })
          )
        }
      }),

    getMaxAccountsForProvider: (provider: ProviderType) => {
      const limits = getCurrentTierLimits()
      switch (provider) {
        case 'github':
          return limits.maxGitHubAccounts
        case 'gitlab':
          return limits.maxGitLabAccounts
        case 'bitbucket':
          return limits.maxBitbucketAccounts
      }
    },

    /**
     * Check if multi-account features are enabled
     */
    isMultiAccountEnabled: () => getCurrentTierLimits().enableAccountSwitcher,
  }),
}) {}
