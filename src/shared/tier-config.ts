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
  /** Maximum number of Gitea accounts (future) */
  maxGiteaAccounts: S.Number,
  /** Maximum number of OpenAI accounts */
  maxOpenAiAccounts: S.Number,
  /** Maximum number of Claude accounts */
  maxClaudeAccounts: S.Number,
  /** Whether multi-account switching UI is enabled */
  enableAccountSwitcher: S.Boolean,
  /** Whether AI provider integrations are enabled */
  enableAiProviders: S.Boolean,
  /** Application tier */
  tier: AppTier,
}) {}

/**
 * Free tier configuration
 * Tree-shaken out in pro builds
 */
const FREE_TIER_LIMITS = new TierLimits({
  maxGitHubAccounts: 1,
  maxGitLabAccounts: 0,
  maxBitbucketAccounts: 0,
  maxGiteaAccounts: 0,
  maxOpenAiAccounts: 1,
  maxClaudeAccounts: 1,
  enableAccountSwitcher: false,
  enableAiProviders: true,
  tier: 'free',
})

/**
 * Pro tier configuration
 * Tree-shaken out in free builds
 */
const PRO_TIER_LIMITS = new TierLimits({
  maxGitHubAccounts: Number.POSITIVE_INFINITY,
  maxGitLabAccounts: Number.POSITIVE_INFINITY,
  maxBitbucketAccounts: Number.POSITIVE_INFINITY,
  maxGiteaAccounts: Number.POSITIVE_INFINITY,
  maxOpenAiAccounts: Number.POSITIVE_INFINITY,
  maxClaudeAccounts: Number.POSITIVE_INFINITY,
  enableAccountSwitcher: true,
  enableAiProviders: true,
  tier: 'pro',
})

/**
 * Get tier limits for current build
 * Uses build-time constant propagation for tree-shaking.
 * In free builds, PRO_TIER_LIMITS is eliminated.
 * In pro builds, FREE_TIER_LIMITS is eliminated.
 */
export const getCurrentTierLimits = (): TierLimits => {
  // Vite replaces process.env.APP_TIER with literal 'free' or 'pro'
  // This enables dead code elimination of the unused branch
  if (process.env.APP_TIER === 'pro') {
    return PRO_TIER_LIMITS
  }
  return FREE_TIER_LIMITS
}
