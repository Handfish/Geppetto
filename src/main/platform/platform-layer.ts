import { NodeContext, NodeFileSystem, NodePath } from '@effect/platform-node'
import { Layer } from 'effect'

/**
 * Provides Effect Platform services for cross-platform system operations.
 *
 * Services provided:
 * - FileSystem: File and directory operations with Effect error handling (NodeFileSystem.layer)
 * - Path: Cross-platform path manipulation (NodePath.layer)
 * - CommandExecutor: Shell command execution with streaming support (NodeContext)
 * - Terminal: Terminal operations (NodeContext)
 *
 * This layer is integrated into CoreInfrastructureLayer to make platform
 * services available throughout the application.
 *
 * @example
 * ```typescript
 * import { FileSystem, Path, Command } from "@effect/platform"
 *
 * Effect.gen(function* () {
 *   const fs = yield* FileSystem.FileSystem
 *   const path = yield* Path.Path
 *
 *   const configPath = path.join(process.cwd(), 'config.json')
 *   const config = yield* fs.readFileString(configPath)
 * })
 * ```
 */
export const PlatformLayer = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  NodeContext.layer
)
