import { NodeContext } from '@effect/platform-node'
import { Layer } from 'effect'

/**
 * Provides Effect Platform services for cross-platform system operations.
 *
 * Services provided:
 * - FileSystem: File and directory operations with Effect error handling
 * - Path: Cross-platform path manipulation
 * - CommandExecutor: Shell command execution with streaming support
 * - Terminal: Terminal operations (colors, prompts)
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
export const PlatformLayer: Layer.Layer<never> = NodeContext.layer
