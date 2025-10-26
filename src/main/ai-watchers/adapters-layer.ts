import { Layer } from 'effect'
import { NodeProcessMonitorAdapter } from './adapters/node-process-monitor-adapter'
import { TmuxSessionManagerAdapter } from './adapters/tmux-session-manager-adapter'

/**
 * AI Watchers Adapters Layer - Hexagonal Architecture Adapter Layer
 *
 * This layer composes all process monitoring and session management adapters.
 *
 * Unlike AI/VCS providers which have MULTIPLE implementations per port
 * (OpenAI/Claude/Cursor for AI, GitHub/GitLab/Bitbucket for VCS),
 * AI Watchers have SINGLE implementations per port:
 * - ProcessMonitorPort → NodeProcessMonitorAdapter (Node.js child_process)
 * - SessionManagerPort → TmuxSessionManagerAdapter (tmux multiplexer)
 *
 * Therefore, we don't need a registry service. Adapters are directly
 * injected into AiWatcherService via dependencies.
 *
 * Benefits of this architecture:
 * - **Hot-swappable**: Can replace adapters for testing (mock process monitor, mock tmux)
 * - **Platform-agnostic**: Can swap NodeProcessMonitor with DockerProcessMonitor
 * - **Multiplexer-agnostic**: Can swap TmuxSessionManager with ScreenSessionManager
 * - **Type-safe**: All adapters implement port contracts
 * - **Isolated testing**: Each adapter can be tested independently
 *
 * Example hot-swapping for tests:
 * ```typescript
 * const MockProcessMonitor = Layer.succeed(
 *   NodeProcessMonitorAdapter,
 *   {
 *     spawn: () => Effect.succeed(mockHandle),
 *     monitor: () => Stream.empty,
 *     // ... mocked methods
 *   }
 * )
 *
 * const TestLayer = WatcherAdaptersLayer.pipe(
 *   Layer.provide(MockProcessMonitor)
 * )
 * ```
 */
export const WatcherAdaptersLayer = Layer.mergeAll(
  NodeProcessMonitorAdapter.Default,
  TmuxSessionManagerAdapter.Default
)
