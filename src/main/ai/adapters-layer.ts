import { Layer } from 'effect'
import { OpenAiBrowserProviderAdapter } from './openai/browser-provider-adapter'
import { ClaudeBrowserProviderAdapter } from './claude/browser-provider-adapter'
import { CursorBrowserProviderAdapter } from './cursor/browser-provider-adapter'

/**
 * AiAdaptersLayer - Hexagonal Architecture Adapter Layer
 *
 * This layer composes all AI provider adapters (OpenAI, Claude, Cursor, etc.)
 * following the Effectful Ports pattern from docs/effect_ports_migration_guide.md
 *
 * Benefits of this architecture:
 * - **Hot-swappable**: Can replace any adapter at runtime for testing/mocking
 * - **Multi-instance**: Multiple providers can coexist (both Claude and OpenAI usage bars)
 * - **Isolated**: Each adapter is independent and can be tested in isolation
 * - **Type-safe**: All adapters implement the same AiProviderPort contract
 *
 * Example hot-swapping for tests:
 * ```typescript
 * const MockOpenAiAdapter = Layer.succeed(
 *   AiProviderTags.getOrCreate('openai'),
 *   {
 *     provider: 'openai',
 *     supportsUsage: true,
 *     signIn: () => Effect.succeed(mockSignInResult),
 *     // ... other mocked methods
 *   }
 * )
 *
 * const TestLayer = AiAdaptersLayer.pipe(
 *   Layer.provide(MockOpenAiAdapter) // Override just OpenAI
 * )
 * ```
 *
 * Example accessing both providers simultaneously:
 * ```typescript
 * Effect.gen(function* () {
 *   const openai = yield* AiProviderTags.get('openai')
 *   const claude = yield* AiProviderTags.get('claude')
 *
 *   // Fetch usage for both providers concurrently
 *   const [openaiUsage, claudeUsage] = yield* Effect.all([
 *     openai.getUsage(openaiAccountId),
 *     claude.getUsage(claudeAccountId)
 *   ], { concurrency: 'unbounded' })
 *
 *   // Now you have both usage bars!
 *   return { openaiUsage, claudeUsage }
 * }).pipe(Effect.provide(AiAdaptersLayer))
 * ```
 */
export const AiAdaptersLayer = Layer.mergeAll(
  OpenAiBrowserProviderAdapter,
  ClaudeBrowserProviderAdapter,
  CursorBrowserProviderAdapter
)
