import { Effect, Stream, Scope } from 'effect'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import {
  FileSystemPort,
  type FileEvent,
  DirectoryEntry,
  FileSystemError,
  FileNotFoundError,
  DirectoryNotFoundError,
  PermissionDeniedError,
} from '../../ports/secondary/file-system-port'

/**
 * NodeFileSystemAdapter - Node.js implementation of FileSystemPort
 *
 * Uses Node.js fs module and chokidar for file watching.
 * Provides all file system operations needed by the source control domain.
 */
export class NodeFileSystemAdapter extends Effect.Service<NodeFileSystemAdapter>()(
  'NodeFileSystemAdapter',
  {
    effect: Effect.sync(() => {
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
                  return new PermissionDeniedError({ path: basePath, operation: 'read' })
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
                    // Skip directories we can't read
                    if ((error as NodeJS.ErrnoException)?.code === 'EACCES') {
                      return [] as any[] // Return empty array to skip
                    }
                    return new FileSystemError({
                      path: dirPath,
                      operation: 'readdir',
                      reason: 'Failed to read directory',
                      cause: error,
                    })
                  },
                })

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
              catch: () => false, // If .git doesn't exist, not a repo
            })
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
              let watcher: FSWatcher | undefined

              const cleanup = Effect.sync(() => {
                if (watcher) {
                  watcher.close()
                  watcher = undefined
                }
              })

              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  watcher = watch(dirPath, {
                    ignored: /(^|[/\\])\../, // Ignore dotfiles except the watched dir
                    persistent: true,
                    ignoreInitial: true,
                  })

                  watcher.on('add', (filePath) => {
                    emit.single({
                      type: 'added',
                      path: filePath,
                      timestamp: new Date(),
                    })
                  })

                  watcher.on('change', (filePath) => {
                    emit.single({
                      type: 'changed',
                      path: filePath,
                      timestamp: new Date(),
                    })
                  })

                  watcher.on('unlink', (filePath) => {
                    emit.single({
                      type: 'deleted',
                      path: filePath,
                      timestamp: new Date(),
                    })
                  })

                  watcher.on('error', (error) => {
                    emit.fail(
                      new FileSystemError({
                        path: dirPath,
                        operation: 'watch',
                        reason: 'File watcher error',
                        cause: error,
                      })
                    )
                  })

                  return watcher
                }),
                cleanup
              )

              return cleanup
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
                return new PermissionDeniedError({ path: filePath, operation: 'read' })
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
                return new PermissionDeniedError({ path: filePath, operation: 'read' })
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
                  return new PermissionDeniedError({ path: dirPath, operation: 'read' })
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
         * Resolve absolute path
         */
        resolvePath: (filePath: string) => Effect.succeed(path.resolve(filePath)),

        /**
         * Get parent directory path
         */
        dirname: (filePath: string) => Effect.succeed(path.dirname(filePath)),

        /**
         * Get file name from path
         */
        basename: (filePath: string) => Effect.succeed(path.basename(filePath)),

        /**
         * Join path components
         */
        joinPath: (...components: string[]) => Effect.succeed(path.join(...components)),
      }

      return adapter
    }),
  }
) {}

/**
 * Default layer for NodeFileSystemAdapter
 */
export const NodeFileSystemAdapterLive = NodeFileSystemAdapter.Default.pipe(
  Effect.map((adapter) => adapter as FileSystemPort)
)
