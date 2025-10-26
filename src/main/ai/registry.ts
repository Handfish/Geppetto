import { Effect } from 'effect'
import type { AiProviderType } from '../../shared/schemas/ai/provider'
import type { AiProviderPort } from './provider-port'
import { AiProviderTags } from './provider-port'
import { AiProviderNotRegisteredError } from './errors'

/**
 * AiProviderRegistryPort - Registry interface for AI providers
 *
 * This port defines the contract for retrieving AI provider adapters.
 * Uses the tag-based system for hot-swappable providers.
 *
 * Note: Adapters are captured at service construction time, so methods
 * don't require adapters in context at call time.
 */
export interface AiProviderRegistryPort {
  getAdapter(
    provider: AiProviderType
  ): Effect.Effect<AiProviderPort, AiProviderNotRegisteredError, never>
  listAdapters(): Effect.Effect<ReadonlyArray<AiProviderPort>, never, never>
}

/**
 * AiProviderRegistryService - Registry Service for AI Providers
 *
 * HEXAGONAL ARCHITECTURE: This service retrieves provider adapters by their tag.
 * The adapters themselves are provided by AiAdaptersLayer, making them hot-swappable.
 *
 * The adapters are captured at construction time (when the service is created with adapters
 * in context), so methods don't require adapters in context at call time.
 */
export class AiProviderRegistryService extends Effect.Service<AiProviderRegistryService>()(
  'AiProviderRegistryService',
  {
    effect: Effect.gen(function* () {
      // Capture adapters from context at construction time
      const tags = AiProviderTags.all()
      const adaptersMap = new Map<AiProviderType, AiProviderPort>()

      for (const tag of tags) {
        // Try to get each adapter from context
        const adapter = yield* Effect.orElse(tag, () =>
          Effect.succeed(null as AiProviderPort | null)
        )
        if (adapter) {
          adaptersMap.set(adapter.provider, adapter)
        }
      }

      return {
        getAdapter: (provider: AiProviderType) =>
          Effect.gen(function* () {
            const adapter = adaptersMap.get(provider)
            if (!adapter) {
              return yield* Effect.fail(
                new AiProviderNotRegisteredError({ provider })
              )
            }
            return adapter
          }),

        listAdapters: () =>
          Effect.succeed(Array.from(adaptersMap.values())),
      } satisfies AiProviderRegistryPort
    }),
  }
) {}
