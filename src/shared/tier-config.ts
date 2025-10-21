/**
 * Application Tier Configuration
 *
 * Defines feature capabilities for Free and Pro tiers.
 * This configuration is injected at build time via Vite environment variables.
 */

import { Schema as S } from 'effect'

/**
 * Application tier enum
 */
export const AppTier = S.Literal('free', 'pro')
export type AppTier = S.Schema.Type<typeof AppTier>

/**
 * Tier feature limits
 */
export class TierLimits extends S.Class<TierLimits>('TierLimits')({
  /** Maximum number of GitHub accounts */
  maxGitHubAccounts: S.Number,
  /** Maximum number of GitLab accounts (future) */
  maxGitLabAccounts: S.Number,
  /** Maximum number of Bitbucket accounts (future) */
  maxBitbucketAccounts: S.Number,
  /** Whether multi-account switching UI is enabled */
  enableAccountSwitcher: S.Boolean,
  /** Application tier */
  tier: AppTier,
}) {}

/**
 * Tier configurations
 */
export const TIER_CONFIGS: Record<AppTier, TierLimits> = {
  free: new TierLimits({
    maxGitHubAccounts: 1,
    maxGitLabAccounts: 0,
    maxBitbucketAccounts: 0,
    enableAccountSwitcher: false,
    tier: 'free',
  }),
  pro: new TierLimits({
    maxGitHubAccounts: Number.POSITIVE_INFINITY,
    maxGitLabAccounts: Number.POSITIVE_INFINITY,
    maxBitbucketAccounts: Number.POSITIVE_INFINITY,
    enableAccountSwitcher: true,
    tier: 'pro',
  }),
}

/**
 * Get current application tier from environment
 * Falls back to 'free' if not specified
 */
export const getCurrentTier = (): AppTier => {
  const tier = process.env.APP_TIER as AppTier | undefined
  return tier === 'pro' ? 'pro' : 'free'
}

/**
 * Get tier limits for current build
 */
export const getCurrentTierLimits = (): TierLimits => {
  return TIER_CONFIGS[getCurrentTier()]
}
