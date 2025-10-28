import { Layer } from "effect";
import { SecureStoreService } from "./github/store-service";
import { TierService } from "./tier/tier-service";
import { BrowserAuthService } from "./ai/browser/browser-auth-service";
import { CookieUsagePageAdapter } from "./ai/browser/cookie-usage-page-adapter";
import { ElectronSessionService } from "./ai/browser/electron-session-service";
import { PlatformLayer } from "./platform/platform-layer";

/**
 * Core Infrastructure Layer - Shared Services
 *
 * CRITICAL FOR MEMOIZATION:
 * These services are used across multiple domains (AI, VCS, etc.). To ensure they're
 * constructed only ONCE, we create them as shared module-level references.
 *
 * Effect memoizes layers by REFERENCE, not by service tag. Each call to `.Default()`
 * creates a new layer instance, even if it produces the same service.
 *
 * ❌ WRONG - Calling .Default in multiple places:
 * ```typescript
 * const MainLayer = Layer.mergeAll(
 *   BrowserAuthService.Default,  // Instance 1
 *   // ... other services
 * )
 *
 * const AiInfraLayer = Layer.mergeAll(
 *   BrowserAuthService.Default,  // Instance 2 - DUPLICATE!
 * )
 * ```
 * Result: BrowserAuthService constructed TWICE
 *
 * ✅ CORRECT - Store in variable, reference everywhere:
 * ```typescript
 * const CoreInfrastructureLayer = Layer.mergeAll(
 *   BrowserAuthService.Default,  // Instance 1 - the ONLY instance
 * )
 *
 * const MainLayer = Layer.mergeAll(
 *   CoreInfrastructureLayer,  // References same instance
 *   // ...
 * )
 *
 * const AiInfraLayer = Layer.mergeAll(...).pipe(
 *   Layer.provide(CoreInfrastructureLayer)  // References same instance
 * )
 * ```
 * Result: BrowserAuthService constructed ONCE
 *
 * @see docs/effect_ports_migration_guide.md
 * @see https://effect.website/docs/guides/layer-memoization
 */

/**
 * Core infrastructure services shared across all domains.
 * SecureStoreService is separated out to allow other layers to depend on it individually.
 */
export const CoreSecureStoreLayer = SecureStoreService.Default;

/**
 * Core infrastructure services shared across all domains.
 * These are constructed ONCE and shared throughout the application.
 *
 * Services included:
 * - PlatformLayer: Effect Platform services (FileSystem, Path, Command, Terminal)
 * - ElectronSessionService: Manages Electron session partitions for cookie isolation
 * - BrowserAuthService: Browser-based authentication orchestration
 * - CookieUsagePageAdapter: Extracts usage data from browser cookies
 * - SecureStoreService: Encrypted credential storage
 * - TierService: Feature gating and tier limits
 */
export const CoreInfrastructureLayer = Layer.mergeAll(
  PlatformLayer,
  ElectronSessionService.Default,
  BrowserAuthService.Default,
  CookieUsagePageAdapter.Default,
  CoreSecureStoreLayer,
  TierService.Default,
);
