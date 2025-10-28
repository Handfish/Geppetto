import { Effect, Stream, Scope } from 'effect'
import { Path } from '@effect/platform'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import { watch, type FSWatcher } from 'chokidar'
import {
  FileSystemPort,
  type FileEvent,
  DirectoryEntry,
  FileSystemError,
  FileNotFoundError,
  DirectoryNotFoundError,
} from '../../ports/secondary/file-system-port'

/**
 * NodeFileSystemAdapter - Node.js implementation of FileSystemPort
 *
 * Uses @effect/platform for path operations and chokidar for file watching.
 * Provides all file system operations needed by the source control domain.
 */
export class NodeFileSystemAdapter extends Effect.Service<NodeFileSystemAdapter>()(
  'NodeFileSystemAdapter',
  {
    effect: Effect.gen(function* () {
      // Inject Path service from @effect/platform
      const path = yield* Path.Path

      const adapter: FileSystemPort = {
        /**
         * Find all Git repositories in the given base path
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
                if ((error as NodeJS.ErrnoException)?.code === 'EACCES') {
                  return new FileSystemError({
                    path: basePath,
                    operation: 'read',
                    reason: 'Permission denied',
                    cause: error,
                  })
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
                // Read directory entries
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
                    // Skip directories we can't read (permission errors)
                    if (error.reason === 'Permission denied') {
                      return Effect.succeed([] as fsSync.Dirent[])
                    }
                    return Effect.fail(error)
                  })
                )

                for (const entry of entries) {
                  const fullPath = path.join(dirPath, entry.name)

                  // Check if this is a .git directory
                  if (entry.name === '.git' && entry.isDirectory()) {
                    // Found a repository - add parent directory
                    repos.push(path.dirname(fullPath))
                  } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    // Recursively scan subdirectories (skip hidden dirs)
                    yield* scanDirectory(fullPath)
                  }
                }
              })

            // Start scanning
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
              catch: (error: unknown) => new FileSystemError({
                path: gitDir,
                operation: 'stat',
                reason: 'Failed to check .git existence',
                cause: error,
              }),
            }).pipe(
              Effect.catchAll(() => Effect.succeed(false))
            )
          }),

        /**
         * Get the .git directory path for a repository
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
         * Watch a directory for changes
         */
        watchDirectory: (dirPath: string) =>
          Stream.asyncScoped<FileEvent, FileSystemError>((emit) =>
            Effect.gen(function* () {
              const watcher = yield* Effect.acquireRelease(
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
                        reason: 'File watcher error',
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
                watcher.close()
              })
            })
          ),

        /**
         * Read a file as text
         */
        readFile: (filePath: string) =>
          Effect.tryPromise({
            try: () => fs.readFile(filePath, 'utf8'),
            catch: (error: unknown) => {
              if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                return new FileNotFoundError({ path: filePath })
              }
              if ((error as NodeJS.ErrnoException)?.code === 'EACCES') {
                return new FileSystemError({
                  path: filePath,
                  operation: 'read',
                  reason: 'Permission denied',
                  cause: error,
                })
              }
              return new FileSystemError({
                path: filePath,
                operation: 'readFile',
                reason: 'Failed to read file',
                cause: error,
              })
            },
          }),

        /**
         * Read a file as binary
         */
        readFileBytes: (filePath: string) =>
          Effect.tryPromise({
            try: () => fs.readFile(filePath),
            catch: (error: unknown) => {
              if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                return new FileNotFoundError({ path: filePath })
              }
              if ((error as NodeJS.ErrnoException)?.code === 'EACCES') {
                return new FileSystemError({
                  path: filePath,
                  operation: 'read',
                  reason: 'Permission denied',
                  cause: error,
                })
              }
              return new FileSystemError({
                path: filePath,
                operation: 'readFileBytes',
                reason: 'Failed to read file',
                cause: error,
              })
            },
          }),

        /**
         * Check if file exists
         */
        fileExists: (filePath: string) =>
          Effect.tryPromise({
            try: async () => {
              try {
                const stat = await fs.stat(filePath)
                return stat.isFile()
              } catch {
                return false
              }
            },
            catch: (error: unknown) =>
              new FileSystemError({
                path: filePath,
                operation: 'fileExists',
                reason: 'Failed to check file existence',
                cause: error,
              }),
          }),

        /**
         * Check if directory exists
         */
        directoryExists: (dirPath: string) =>
          Effect.tryPromise({
            try: async () => {
              try {
                const stat = await fs.stat(dirPath)
                return stat.isDirectory()
              } catch {
                return false
              }
            },
            catch: (error: unknown) =>
              new FileSystemError({
                path: dirPath,
                operation: 'directoryExists',
                reason: 'Failed to check directory existence',
                cause: error,
              }),
          }),

        /**
         * List entries in a directory
         */
        listDirectory: (dirPath: string) =>
          Effect.gen(function* () {
            const entries = yield* Effect.tryPromise({
              try: () => fs.readdir(dirPath, { withFileTypes: true }),
              catch: (error: unknown) => {
                if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                  return new DirectoryNotFoundError({ path: dirPath })
                }
                if ((error as NodeJS.ErrnoException)?.code === 'EACCES') {
                  return new FileSystemError({
                    path: dirPath,
                    operation: 'read',
                    reason: 'Permission denied',
                    cause: error,
                  })
                }
                return new FileSystemError({
                  path: dirPath,
                  operation: 'listDirectory',
                  reason: 'Failed to list directory',
                  cause: error,
                })
              },
            })

            return entries.map(
              (entry) =>
                new DirectoryEntry({
                  name: entry.name,
                  path: path.join(dirPath, entry.name),
                  isDirectory: entry.isDirectory(),
                  isFile: entry.isFile(),
                })
            )
          }),

        /**
         * Get file metadata
         */
        stat: (filePath: string) =>
          Effect.gen(function* () {
            const stat = yield* Effect.tryPromise({
              try: () => fs.stat(filePath),
              catch: (error: unknown) => {
                if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                  return new FileNotFoundError({ path: filePath })
                }
                return new FileSystemError({
                  path: filePath,
                  operation: 'stat',
                  reason: 'Failed to stat file',
                  cause: error,
                })
              },
            })

            return {
              size: stat.size,
              isFile: stat.isFile(),
              isDirectory: stat.isDirectory(),
              modifiedTime: stat.mtime,
            }
          }),

        /**
         * Resolve absolute path (using @effect/platform/Path)
         */
        resolvePath: (filePath: string) => path.resolve(filePath),

        /**
         * Get parent directory path (using @effect/platform/Path)
         */
        dirname: (filePath: string) => Effect.succeed(path.dirname(filePath)),

        /**
         * Get file name from path (using @effect/platform/Path)
         */
        basename: (filePath: string) => Effect.succeed(path.basename(filePath)),

        /**
         * Join path components (using @effect/platform/Path)
         */
        joinPath: (...components: string[]) => Effect.succeed(path.join(...components)),
      }

      return adapter
    }),
    dependencies: [Path.layer],
  }
) {}

