import { Effect } from 'effect'
import { AiProviderType } from '../../shared/schemas/ai/provider'
import { AiProviderAdapter, AiProviderRegistryPort } from './ports'
import { AiProviderNotRegisteredError } from './errors'
import { OpenAiProviderAdapter } from './openai/provider-adapter'
import { ClaudeProviderAdapter } from './claude/provider-adapter'

export class AiProviderRegistryService extends Effect.Service<AiProviderRegistryService>()(
  'AiProviderRegistryService',
  {
    dependencies: [OpenAiProviderAdapter.Default, ClaudeProviderAdapter.Default],
    effect: Effect.gen(function* () {
      const openai = yield* OpenAiProviderAdapter
      const claude = yield* ClaudeProviderAdapter

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
