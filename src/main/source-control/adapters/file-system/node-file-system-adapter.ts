import { Effect, Stream, Scope } from 'effect'
import { Path, FileSystem } from '@effect/platform'
import { NodeFileSystem } from '@effect/platform-node'
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
 * Uses @effect/platform for file system and path operations, chokidar for file watching.
 * Provides all file system operations needed by the source control domain.
 */
export class NodeFileSystemAdapter extends Effect.Service<NodeFileSystemAdapter>()(
  'NodeFileSystemAdapter',
  {
    dependencies: [
      Path.layer,
      NodeFileSystem.layer,
    ],
    effect: Effect.gen(function* () {
      // Inject platform services
      const platformFs = yield* FileSystem.FileSystem
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
         * Read a file as text (using @effect/platform/FileSystem)
         */
        readFile: (filePath: string) =>
          platformFs.readFileString(filePath).pipe(
            Effect.mapError((platformError) => {
              // Map platform errors to domain errors
              const errorString = String(platformError)
              if (errorString.includes('ENOENT') || errorString.includes('NotFound')) {
                return new FileNotFoundError({ path: filePath })
              }
              if (errorString.includes('EACCES') || errorString.includes('PermissionDenied')) {
                return new FileSystemError({
                  path: filePath,
                  operation: 'read',
                  reason: 'Permission denied',
                  cause: platformError,
                })
              }
              return new FileSystemError({
                path: filePath,
                operation: 'readFile',
                reason: 'Failed to read file',
                cause: platformError,
              })
            })
          ),

        /**
         * Read a file as binary (using @effect/platform/FileSystem)
         */
        readFileBytes: (filePath: string) =>
          platformFs.readFile(filePath).pipe(
            Effect.mapError((platformError) => {
              const errorString = String(platformError)
              if (errorString.includes('ENOENT') || errorString.includes('NotFound')) {
                return new FileNotFoundError({ path: filePath })
              }
              if (errorString.includes('EACCES') || errorString.includes('PermissionDenied')) {
                return new FileSystemError({
                  path: filePath,
                  operation: 'read',
                  reason: 'Permission denied',
                  cause: platformError,
                })
              }
              return new FileSystemError({
                path: filePath,
                operation: 'readFileBytes',
                reason: 'Failed to read file',
                cause: platformError,
              })
            })
          ),

        /**
         * Check if file exists (using @effect/platform/FileSystem)
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
            )
          ),

        /**
         * Check if directory exists (using @effect/platform/FileSystem)
         */
        directoryExists: (dirPath: string) =>
          platformFs.exists(dirPath).pipe(
            Effect.flatMap((exists) =>
              exists
                ? platformFs.stat(dirPath).pipe(
                    Effect.map((info) => info.type === 'Directory'),
                    Effect.catchAll(() => Effect.succeed(false))
                  )
                : Effect.succeed(false)
            )
          ),

        /**
         * List entries in a directory (using @effect/platform/FileSystem)
         */
        listDirectory: (dirPath: string) =>
          platformFs.readDirectory(dirPath).pipe(
            Effect.flatMap((names) =>
              Effect.all(
                names.map((name) =>
                  Effect.gen(function* () {
                    const entryPath = path.join(dirPath, name)
                    const stat = yield* platformFs.stat(entryPath).pipe(
                      Effect.catchAll(() =>
                        Effect.succeed({ type: 'Unknown' as const })
                      )
                    )
                    return new DirectoryEntry({
                      name,
                      path: entryPath,
                      isDirectory: stat.type === 'Directory',
                      isFile: stat.type === 'File',
                    })
                  })
                )
              )
            ),
            Effect.mapError((platformError) => {
              const errorString = String(platformError)
              if (errorString.includes('ENOENT') || errorString.includes('NotFound')) {
                return new DirectoryNotFoundError({ path: dirPath })
              }
              if (errorString.includes('EACCES') || errorString.includes('PermissionDenied')) {
                return new FileSystemError({
                  path: dirPath,
                  operation: 'read',
                  reason: 'Permission denied',
                  cause: platformError,
                })
              }
              return new FileSystemError({
                path: dirPath,
                operation: 'listDirectory',
                reason: 'Failed to list directory',
                cause: platformError,
              })
            })
          ),

        /**
         * Get file metadata (using @effect/platform/FileSystem)
         */
        stat: (filePath: string) =>
          platformFs.stat(filePath).pipe(
            Effect.map((info) => ({
              size: info.size,
              isFile: info.type === 'File',
              isDirectory: info.type === 'Directory',
              modifiedTime: new Date(info.mtime),
            })),
            Effect.mapError((platformError) => {
              const errorString = String(platformError)
              if (errorString.includes('ENOENT') || errorString.includes('NotFound')) {
                return new FileNotFoundError({ path: filePath })
              }
              return new FileSystemError({
                path: filePath,
                operation: 'stat',
                reason: 'Failed to stat file',
                cause: platformError,
              })
            })
          ),

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
  }
) {}

