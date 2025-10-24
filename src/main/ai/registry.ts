import { Effect } from 'effect'
import type { AiProviderType } from '../../shared/schemas/ai/provider'
import type { AiProviderAdapter, AiProviderRegistryPort } from './ports'
import { AiProviderNotRegisteredError } from './errors'
import { OpenAiBrowserProviderAdapter } from './openai/browser-provider-adapter'
import { ClaudeBrowserProviderAdapter } from './claude/browser-provider-adapter'
import { CursorBrowserProviderAdapter } from './cursor/browser-provider-adapter'

export class AiProviderRegistryService extends Effect.Service<AiProviderRegistryService>()(
  'AiProviderRegistryService',
  {
    dependencies: [
      OpenAiBrowserProviderAdapter.Default,
      ClaudeBrowserProviderAdapter.Default,
      CursorBrowserProviderAdapter.Default,
    ],
    effect: Effect.gen(function* () {
      const openai = yield* OpenAiBrowserProviderAdapter
      const claude = yield* ClaudeBrowserProviderAdapter
      const cursor = yield* CursorBrowserProviderAdapter

      const map = new Map<AiProviderType, AiProviderAdapter>([
        [openai.provider, openai],
        [claude.provider, claude],
        [cursor.provider, cursor],
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
