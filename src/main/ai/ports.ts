/**
 * @deprecated Use AiProviderPort from './provider-port' instead
 *
 * This file is kept for backward compatibility during migration.
 * All new code should import from './provider-port'.
 */

// Re-export the new types for backward compatibility
export type { AiProviderPort as AiProviderAdapter } from './provider-port'
export type { AiProviderRegistryPort } from './registry'
