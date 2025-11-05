import { Effect, Stream } from 'effect'
import { Path, FileSystem } from '@effect/platform'
import { NodeFileSystem, NodePath } from '@effect/platform-node'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import { watch } from 'chokidar'
import {
  FileSystemPort,
  type FileEvent,
  FileSystemError,
  FileNotFoundError,
  DirectoryNotFoundError,
} from '../../ports/secondary/file-system-port'

/**
 * NodeFileSystemAdapter - Simplified Node.js implementation of FileSystemPort
 *
 * Uses @effect/platform for standard operations, node:fs for git-specific needs.
 * Only implements methods actually used by RepositoryService.
 */
export class NodeFileSystemAdapter extends Effect.Service<NodeFileSystemAdapter>()(
  'NodeFileSystemAdapter',
  {
    dependencies: [NodePath.layer, NodeFileSystem.layer],
    effect: Effect.gen(function* () {
      const platformFs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const adapter: FileSystemPort = {
        /**
         * Find all Git repositories in the given base path
         *
         * Complex recursive search - kept with node:fs for performance (withFileTypes)
         */
        findGitRepositories: (basePath: string) =>
          Effect.gen(function* () {
            // Check if base path exists
            const baseExists = yield* Effect.tryPromise({
              try: () => fs.access(basePath, fsSync.constants.R_OK).then(() => true),
              catch: (error: unknown) => {
                if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                  return new DirectoryNotFoundError({ path: basePath })
                }
                return new FileSystemError({
                  path: basePath,
                  operation: 'access',
                  reason: 'Failed to access directory',
                  cause: error,
                })
              },
            })

            if (!baseExists) {
              return yield* Effect.fail(new DirectoryNotFoundError({ path: basePath }))
            }

            const repos: string[] = []

            const scanDirectory = (dirPath: string): Effect.Effect<void, FileSystemError> =>
              Effect.gen(function* () {
                const entries = yield* Effect.tryPromise({
                  try: () => fs.readdir(dirPath, { withFileTypes: true }),
                  catch: (error: unknown) => {
                    return new FileSystemError({
                      path: dirPath,
                      operation: 'readdir',
                      reason: (error as NodeJS.ErrnoException)?.code === 'EACCES'
                        ? 'Permission denied'
                        : 'Failed to read directory',
                      cause: error,
                    })
                  },
                }).pipe(
                  Effect.catchAll((error) => {
                    // Skip directories we can't read
                    if (error.reason === 'Permission denied') {
                      return Effect.succeed([] as fsSync.Dirent[])
                    }
                    return Effect.fail(error)
                  })
                )

                for (const entry of entries) {
                  const fullPath = path.join(dirPath, entry.name)

                  if (entry.name === '.git' && entry.isDirectory()) {
                    // Found a repository - add parent directory
                    repos.push(path.dirname(fullPath))
                  } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    // Recursively scan subdirectories (skip hidden dirs)
                    yield* scanDirectory(fullPath)
                  }
                }
              })

            yield* scanDirectory(basePath)
            return repos
          }),

        /**
         * Check if a path is a valid Git repository
         */
        isGitRepository: (repositoryPath: string) =>
          Effect.gen(function* () {
            const gitDir = path.join(repositoryPath, '.git')

            return yield* Effect.tryPromise({
              try: async () => {
                const stat = await fs.stat(gitDir)
                // Valid if .git exists as directory or file (worktree)
                return stat.isDirectory() || stat.isFile()
              },
              catch: () => new FileSystemError({
                path: gitDir,
                operation: 'stat',
                reason: 'Failed to check .git existence',
                cause: 'ENOENT',
              }),
            }).pipe(
              Effect.catchAll(() => Effect.succeed(false))
            )
          }),

        /**
         * Get the .git directory path for a repository
         * Handles both regular repos and worktrees
         */
        getGitDirectory: (repositoryPath: string) =>
          Effect.gen(function* () {
            const gitDir = path.join(repositoryPath, '.git')

            const stat = yield* Effect.tryPromise({
              try: () => fs.stat(gitDir),
              catch: (error: unknown) => {
                if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                  return new FileNotFoundError({ path: gitDir })
                }
                return new FileSystemError({
                  path: gitDir,
                  operation: 'stat',
                  reason: 'Failed to stat .git',
                  cause: error,
                })
              },
            })

            if (stat.isDirectory()) {
              return gitDir
            }

            // .git is a file (worktree) - read the gitdir path
            if (stat.isFile()) {
              const content = yield* Effect.tryPromise({
                try: () => fs.readFile(gitDir, 'utf8'),
                catch: (error: unknown) =>
                  new FileSystemError({
                    path: gitDir,
                    operation: 'readFile',
                    reason: 'Failed to read .git file',
                    cause: error,
                  }),
              })

              // Parse "gitdir: <path>"
              const match = content.match(/^gitdir:\s*(.+)$/m)
              if (match) {
                const gitDirPath = path.resolve(repositoryPath, match[1].trim())
                return gitDirPath
              }
            }

            return gitDir
          }),

        /**
         * Check if file exists - using @effect/platform
         */
        fileExists: (filePath: string) =>
          platformFs.exists(filePath).pipe(
            Effect.flatMap((exists) =>
              exists
                ? platformFs.stat(filePath).pipe(
                    Effect.map((info) => info.type === 'File'),
                    Effect.catchAll(() => Effect.succeed(false))
                  )
                : Effect.succeed(false)
            ),
            Effect.mapError((error) =>
              new FileSystemError({
                path: filePath,
                operation: 'fileExists',
                reason: 'Failed to check if file exists',
                cause: error,
              })
            )
          ),

        /**
         * Get file name from path - using @effect/platform
         */
        basename: (filePath: string) => Effect.succeed(path.basename(filePath)),

        /**
         * Watch a directory for changes
         * Uses chokidar for advanced filtering (kept as-is)
         */
        watchDirectory: (dirPath: string) =>
          Stream.asyncScoped<FileEvent, FileSystemError>((emit) =>
            Effect.gen(function* () {
              const runner = yield* Effect.acquireRelease(
                Effect.sync(() => {
                  const w = watch(dirPath, {
                    ignored: /(^|[/\\])\../, // Ignore dotfiles except the watched dir
                    persistent: true,
                    ignoreInitial: true,
                  })

                  w.on('add', (filePath) => {
                    emit.single({
                      type: 'added',
                      path: filePath,
                      timestamp: new Date(),
                    })
                  })

                  w.on('change', (filePath) => {
                    emit.single({
                      type: 'changed',
                      path: filePath,
                      timestamp: new Date(),
                    })
                  })

                  w.on('unlink', (filePath) => {
                    emit.single({
                      type: 'deleted',
                      path: filePath,
                      timestamp: new Date(),
                    })
                  })

                  w.on('error', (error) => {
                    emit.fail(
                      new FileSystemError({
                        path: dirPath,
                        operation: 'watch',
                        reason: 'File runner error',
                        cause: error,
                      })
                    )
                  })

                  return w
                }),
                (w) => Effect.sync(() => {
                  w.close()
                })
              )

              return Effect.sync(() => {
                runner.close()
              })
            })
          ),

        // Unused methods - removed for simplicity
        // If needed in future, can easily add them back using @effect/platform

        readFile: (filePath: string) =>
          Effect.fail(
            new FileNotFoundError({
              path: filePath,
            })
          ),
        readFileBytes: (filePath: string) =>
          Effect.fail(
            new FileNotFoundError({
              path: filePath,
            })
          ),
        directoryExists: (dirPath: string) =>
          Effect.fail(
            new FileSystemError({
              path: dirPath,
              operation: 'directoryExists',
              reason: 'Not implemented',
            })
          ),
        listDirectory: (dirPath: string) =>
          Effect.fail(
            new DirectoryNotFoundError({
              path: dirPath,
            })
          ),
        stat: (filePath: string) =>
          Effect.fail(
            new FileNotFoundError({
              path: filePath,
            })
          ),
        resolvePath: (...paths: string[]) => Effect.succeed(path.resolve(...paths)),
        dirname: (filePath: string) => Effect.succeed(path.dirname(filePath)),
        joinPath: (...paths: string[]) => Effect.succeed(path.join(...paths)),
      }

      return adapter
    }),
  }
) {}
