import { Effect } from 'effect'
import type { ProviderType } from '../../shared/schemas/account-context'
import type { VcsProviderPort, VcsProviderRegistryPort } from './provider-port'
import { VcsProviderTags } from './provider-port'
import { ProviderNotRegisteredError } from './errors'

/**
 * ProviderRegistryService - Registry Service for VCS Providers
 *
 * HEXAGONAL ARCHITECTURE: This service retrieves provider adapters by their tag.
 * The adapters themselves are provided by VcsAdaptersLayer, making them hot-swappable.
 *
 * The adapters are captured at construction time (when the service is created with adapters
 * in context), so methods don't require adapters in context at call time.
 *
 * This follows the same pattern as AiProviderRegistryService.
 */
export class ProviderRegistryService extends Effect.Service<ProviderRegistryService>()(
  'ProviderRegistryService',
  {
    effect: Effect.gen(function* () {
      // Capture ALL adapters from context at construction time
      const tags = VcsProviderTags.all()
      const adaptersMap = new Map<ProviderType, VcsProviderPort>()

      for (const tag of tags) {
        // Try to get each adapter from context
        const adapter = yield* Effect.orElse(tag, () =>
          Effect.succeed(null as VcsProviderPort | null)
        )
        if (adapter) {
          adaptersMap.set(adapter.provider, adapter)
        }
      }

      // Methods access the Map (no context needed at call time)
      return {
        getAdapter: (provider: ProviderType) =>
          Effect.gen(function* () {
            const adapter = adaptersMap.get(provider)
            if (!adapter) {
              return yield* Effect.fail(
                new ProviderNotRegisteredError({ provider })
              )
            }
            return adapter
          }),

        listAdapters: () => Effect.succeed(Array.from(adaptersMap.values())),
      } satisfies VcsProviderRegistryPort
    }),
  }
) {}
