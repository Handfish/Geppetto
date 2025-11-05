import { Layer } from 'effect'
import { NodeProcessMonitorAdapter } from './process-monitor'
import { TmuxSessionManagerAdapter } from './tmux-session-manager'

/**
 * Process Runners Adapters Layer - Hexagonal Architecture Adapter Layer
 *
 * This layer composes all process monitoring and session management adapters.
 *
 * Unlike AI/VCS providers which have MULTIPLE implementations per port
 * (OpenAI/Claude/Cursor for AI, GitHub/GitLab/Bitbucket for VCS),
 * Process Runners have SINGLE implementations per port:
 * - ProcessMonitorPort → NodeProcessMonitorAdapter (Node.js child_process)
 * - SessionManagerPort → TmuxSessionManagerAdapter (tmux multiplexer)
 *
 * Therefore, we don't need a registry service. Adapters are directly
 * injected into ProcessRunnerService via dependencies.
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
 * const TestLayer = RunnerAdaptersLayer.pipe(
 *   Layer.provide(MockProcessMonitor)
 * )
 * ```
 */
export const RunnerAdaptersLayer = Layer.mergeAll(
  NodeProcessMonitorAdapter.Default,
  TmuxSessionManagerAdapter.Default
)
