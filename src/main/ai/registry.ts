import { Effect } from 'effect'
import { AiProviderType } from '../../shared/schemas/ai/provider'
import { AiProviderAdapter, AiProviderRegistryPort } from './ports'
import { AiProviderNotRegisteredError } from './errors'
import { OpenAiBrowserProviderAdapter } from './openai/browser-provider-adapter'
import { ClaudeBrowserProviderAdapter } from './claude/browser-provider-adapter'

export class AiProviderRegistryService extends Effect.Service<AiProviderRegistryService>()(
  'AiProviderRegistryService',
  {
    dependencies: [OpenAiBrowserProviderAdapter.Default, ClaudeBrowserProviderAdapter.Default],
    effect: Effect.gen(function* () {
      const openai = yield* OpenAiBrowserProviderAdapter
      const claude = yield* ClaudeBrowserProviderAdapter

      const map = new Map<AiProviderType, AiProviderAdapter>([
        [openai.provider, openai],
        [claude.provider, claude],
      ])

      return {
        getAdapter: (provider: AiProviderType) =>
          Effect.gen(function* () {
            const adapter = map.get(provider)
            if (!adapter) {
              yield* Effect.fail(new AiProviderNotRegisteredError({ provider }))
            }
            return adapter!
          }),
        listAdapters: () => Array.from(map.values()),
      } satisfies AiProviderRegistryPort
    }),
  }
) {}
