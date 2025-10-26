import { CoreInfrastructureLayer } from '../core-infrastructure-layer'

/**
 * AI Infrastructure Layer
 *
 * This re-exports the CoreInfrastructureLayer for AI-specific use.
 * All AI adapters depend on these core browser services.
 *
 * MEMOIZATION: By using CoreInfrastructureLayer (which is a module-level reference),
 * we ensure these services are constructed ONCE and shared across:
 * - All AI adapters (OpenAI, Claude, Cursor)
 * - All other domains that need these services
 *
 * Services provided:
 * - ElectronSessionService: Cookie-isolated session management
 * - BrowserAuthService: Browser authentication orchestration
 * - CookieUsagePageAdapter: Usage data extraction from cookies
 * - SecureStoreService: Encrypted credential storage
 * - TierService: Feature gating
 *
 * @see docs/effect_ports_migration_guide.md
 * @see https://effect.website/docs/guides/layer-memoization
 */
export const AiInfrastructureLayer = CoreInfrastructureLayer
