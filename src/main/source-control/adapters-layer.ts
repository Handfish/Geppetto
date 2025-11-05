import { Layer } from 'effect'
import { NodeGitCommandRunner } from './adapters/git/node-git-command-runner'
import { NodeFileSystemAdapter } from './adapters/file-system/node-file-system-adapter'

/**
 * Source Control Adapters Layer - Hexagonal Architecture Adapter Layer
 *
 * This layer composes all source control infrastructure adapters:
 * - Git execution adapter (Node.js child_process implementation)
 * - File system adapter (Node.js fs/promises implementation)
 * - Provider adapters (GitHub, GitLab, etc.) are in adapters/providers/
 *
 * Similar to AI Runners pattern (single implementation per port):
 * - GitCommandRunnerPort → NodeGitCommandRunner (can swap with LibGit2Adapter, JGitAdapter)
 * - FileSystemPort → NodeFileSystemAdapter (can swap with MemoryFsAdapter, VirtualFsAdapter)
 *
 * Unlike AI/VCS providers (multiple implementations per port):
 * - NO registry service needed
 * - Adapters injected directly via dependencies
 * - Only ONE active implementation per port at runtime
 *
 * Benefits of this architecture:
 * - **Hot-swappable**: Replace adapters for testing (MemoryFs, MockGit)
 * - **Platform-agnostic**: Swap Node.js fs with browser-compatible implementation
 * - **Git-agnostic**: Swap child_process with libgit2, JGit, or pure JS implementation
 * - **Type-safe**: All adapters implement port contracts
 * - **Isolated testing**: Each adapter can be tested independently
 *
 * Example hot-swapping for tests:
 * ```typescript
 * const MockGitRunner = Layer.succeed(
 *   NodeGitCommandRunner,
 *   {
 *     execute: (request) => Effect.succeed(mockHandle),
 *   }
 * )
 *
 * const MockFileSystem = Layer.succeed(
 *   NodeFileSystemAdapter,
 *   {
 *     readFile: (path) => Effect.succeed('mock content'),
 *     writeFile: (path, content) => Effect.void,
 *     // ... other mocked methods
 *   }
 * )
 *
 * const TestLayer = SourceControlAdaptersLayer.pipe(
 *   Layer.provide(Layer.mergeAll(MockGitRunner, MockFileSystem))
 * )
 * ```
 */
export const SourceControlAdaptersLayer = Layer.mergeAll(
  NodeGitCommandRunner.Default,
  NodeFileSystemAdapter.Default
)
