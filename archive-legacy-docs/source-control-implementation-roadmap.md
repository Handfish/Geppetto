# Source Control Implementation Roadmap

## Overview

This roadmap details the step-by-step implementation of the hexagonal architecture for the source control domain, building upon the existing codebase while maintaining backward compatibility.

## Implementation Priorities

### Priority 1: Core Infrastructure (Must Have)
- Repository discovery and management
- Basic git operations (status, log, diff)
- Commit graph visualization
- Integration with existing GitHub provider

### Priority 2: Enhanced Features (Should Have)
- Branch management UI
- Merge/rebase workflows
- Conflict resolution
- Multi-provider support (GitLab)

### Priority 3: Advanced Features (Nice to Have)
- Interactive rebase
- Stash management
- Submodule support
- Bitbucket integration

## Week 1: Domain Foundation & Core Ports

### Day 1-2: Domain Model Setup

**Files to Create:**

```bash
# Domain aggregates
src/main/source-control/domain/aggregates/repository.ts
src/main/source-control/domain/aggregates/commit-graph.ts
src/main/source-control/domain/aggregates/working-tree.ts

# Value objects
src/main/source-control/domain/value-objects/commit-hash.ts
src/main/source-control/domain/value-objects/branch-name.ts
src/main/source-control/domain/value-objects/file-status.ts
src/main/source-control/domain/value-objects/remote-url.ts

# Domain events
src/main/source-control/domain/events/repository-events.ts
```

**Repository Aggregate Example:**

```typescript
// src/main/source-control/domain/aggregates/repository.ts
import { Schema as S } from 'effect'
import { Data } from 'effect'
import { CommitHash } from '../value-objects/commit-hash'
import { BranchName } from '../value-objects/branch-name'

export class RepositoryId extends S.Class<RepositoryId>('RepositoryId')({
  value: S.UUID,
}) {}

export class RepositoryState extends S.Class<RepositoryState>('RepositoryState')({
  head: S.optional(CommitHash),
  branch: S.optional(BranchName),
  isDetached: S.Boolean,
  isMerging: S.Boolean,
  isRebasing: S.Boolean,
  isCherryPicking: S.Boolean,
}) {}

export class Repository extends S.Class<Repository>('Repository')({
  id: RepositoryId,
  path: S.String,
  name: S.String,
  state: RepositoryState,
  remotes: S.Array(Remote),
  branches: S.Array(Branch),
}) {
  // Domain methods
  isDetached(): boolean {
    return this.state.isDetached
  }

  getCurrentBranch(): Branch | undefined {
    if (this.state.branch) {
      return this.branches.find(b => b.name.value === this.state.branch?.value)
    }
    return undefined
  }

  hasConflicts(): boolean {
    return this.state.isMerging || this.state.isRebasing
  }
}

// Domain events
export class RepositoryDiscovered extends Data.TaggedClass('RepositoryDiscovered')<{
  repositoryId: RepositoryId
  path: string
  timestamp: Date
}> {}

export class RepositoryStateChanged extends Data.TaggedClass('RepositoryStateChanged')<{
  repositoryId: RepositoryId
  previousState: RepositoryState
  newState: RepositoryState
  timestamp: Date
}> {}
```

### Day 3-4: Port Definitions

**Files to Create:**

```bash
# Primary ports (UI-facing)
src/main/source-control/ports/primary/repository-management-port.ts
src/main/source-control/ports/primary/commit-operations-port.ts
src/main/source-control/ports/primary/branch-operations-port.ts
src/main/source-control/ports/primary/working-tree-port.ts

# Secondary ports (infrastructure-facing)
src/main/source-control/ports/secondary/git-executor-port.ts
src/main/source-control/ports/secondary/file-system-port.ts
src/main/source-control/ports/secondary/provider-port.ts
```

**Repository Management Port:**

```typescript
// src/main/source-control/ports/primary/repository-management-port.ts
import { Effect, Stream, Scope } from 'effect'
import { Repository, RepositoryId } from '../../domain/aggregates/repository'
import { RepositoryDiscoveryError, RepositoryNotFoundError } from '../../errors'

export interface RepositoryManagementPort {
  /**
   * Discover all Git repositories in the given paths
   */
  discoverRepositories(
    searchPaths: string[]
  ): Effect.Effect<Repository[], RepositoryDiscoveryError>

  /**
   * Get a specific repository by path
   */
  getRepository(
    path: string
  ): Effect.Effect<Repository, RepositoryNotFoundError>

  /**
   * Get repository state including current branch, HEAD, etc.
   */
  getRepositoryState(
    repositoryId: RepositoryId
  ): Effect.Effect<RepositoryState, RepositoryNotFoundError>

  /**
   * Watch a repository for changes
   */
  watchRepository(
    repositoryId: RepositoryId
  ): Stream.Stream<RepositoryEvent, never, Scope.Scope>

  /**
   * Validate if a path is a valid Git repository
   */
  validateRepository(
    path: string
  ): Effect.Effect<boolean, never>
}
```

**Git Executor Port (Refactored from existing):**

```typescript
// src/main/source-control/ports/secondary/git-executor-port.ts
import { Effect, Stream, Scope } from 'effect'
import { GitCommand, GitCommandResult } from '../../../shared/schemas/source-control'

export interface GitExecutorPort {
  /**
   * Execute a git command and return the result
   */
  executeCommand(
    command: GitCommand
  ): Effect.Effect<GitCommandResult, GitCommandError, Scope.Scope>

  /**
   * Execute a git command and stream the output
   */
  streamCommand(
    command: GitCommand
  ): Stream.Stream<GitCommandEvent, GitCommandError, Scope.Scope>

  /**
   * Parse git output into domain objects
   */
  parseOutput<T>(
    output: string,
    parser: OutputParser<T>
  ): Effect.Effect<T, GitParseError>
}
```

### Day 5: Refactor Existing Infrastructure

**Files to Modify:**

```bash
# Move and refactor existing git command runner
src/main/source-control/node-git-command-runner.ts
  -> src/main/source-control/adapters/git/node-git-executor.ts

# Update to implement GitExecutorPort
src/main/source-control/adapters/git/node-git-executor.ts
```

**Refactored Node Git Executor:**

```typescript
// src/main/source-control/adapters/git/node-git-executor.ts
import { Effect, Stream, Scope } from 'effect'
import { GitExecutorPort } from '../../ports/secondary/git-executor-port'
import { NodeGitCommandRunner } from './legacy/node-git-command-runner' // Keep old implementation temporarily

export class NodeGitExecutor extends Effect.Service<NodeGitExecutor>()('NodeGitExecutor', {
  effect: Effect.gen(function* () {
    // Wrap existing NodeGitCommandRunner to implement GitExecutorPort
    const legacyRunner = yield* NodeGitCommandRunner

    const adapter: GitExecutorPort = {
      executeCommand: (command) =>
        Effect.gen(function* () {
          // Transform command to legacy format
          const request = toLegacyRequest(command)
          const handle = yield* legacyRunner.execute(request)
          return yield* handle.awaitResult
        }),

      streamCommand: (command) =>
        Effect.gen(function* () {
          const request = toLegacyRequest(command)
          const handle = yield* legacyRunner.execute(request)
          return handle.events
        }),

      parseOutput: (output, parser) =>
        parser.parse(output)
    }

    return adapter
  }),
  dependencies: [NodeGitCommandRunner.Default]
}) {}
```

## Week 2: Application Services & Basic Features

### Day 6-7: Repository Service

**Files to Create:**

```bash
src/main/source-control/services/repository-service.ts
src/main/source-control/services/repository-cache.ts
```

**Repository Service Implementation:**

```typescript
// src/main/source-control/services/repository-service.ts
import { Effect, Ref, Stream, Scope, Duration } from 'effect'
import { GitExecutorPort } from '../ports/secondary/git-executor-port'
import { FileSystemPort } from '../ports/secondary/file-system-port'
import { Repository } from '../domain/aggregates/repository'

export class RepositoryService extends Effect.Service<RepositoryService>()('RepositoryService', {
  effect: Effect.gen(function* () {
    const gitExecutor = yield* GitExecutorPort
    const fileSystem = yield* FileSystemPort

    // Cache for discovered repositories
    const repositoryCache = yield* Ref.make(new Map<string, Repository>())

    return {
      discoverRepositories: (searchPaths: string[]) =>
        Effect.gen(function* () {
          const repoPaths = yield* Effect.all(
            searchPaths.map(path => fileSystem.findGitRepositories(path))
          )

          const repositories = yield* Effect.all(
            repoPaths.flat().map(path => createRepositoryFromPath(path))
          )

          // Update cache
          yield* Ref.update(repositoryCache, cache => {
            repositories.forEach(repo => cache.set(repo.path, repo))
            return cache
          })

          return repositories
        }),

      getRepository: (path: string) =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(repositoryCache)
          const cached = cache.get(path)

          if (cached) {
            return cached
          }

          // Not in cache, try to load
          const repo = yield* createRepositoryFromPath(path)

          // Add to cache
          yield* Ref.update(repositoryCache, cache => {
            cache.set(path, repo)
            return cache
          })

          return repo
        }),

      watchRepository: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* getRepositoryById(repositoryId)

          // Watch .git directory for changes
          return fileSystem.watchDirectory(repo.path + '/.git').pipe(
            Stream.map(fsEvent => toRepositoryEvent(fsEvent, repositoryId))
          )
        })
    }
  }),
  dependencies: [GitExecutorPort, FileSystemPort]
}) {}
```

### Day 8-9: Commit Graph Service

**Files to Create:**

```bash
src/main/source-control/services/commit-graph-service.ts
src/main/source-control/domain/services/commit-graph-builder.ts
src/main/source-control/domain/services/graph-layout-algorithm.ts
```

**Commit Graph Service:**

```typescript
// src/main/source-control/services/commit-graph-service.ts
import { Effect, Ref, Duration } from 'effect'
import { GitExecutorPort } from '../ports/secondary/git-executor-port'
import { CommitGraph } from '../domain/aggregates/commit-graph'
import { CommitGraphBuilder } from '../domain/services/commit-graph-builder'

export class CommitGraphService extends Effect.Service<CommitGraphService>()('CommitGraphService', {
  effect: Effect.gen(function* () {
    const gitExecutor = yield* GitExecutorPort
    const graphBuilder = yield* CommitGraphBuilder

    // Cache graphs with TTL
    const graphCache = yield* Ref.make(new Map<string, CachedGraph>())

    return {
      buildGraph: (repositoryPath: string, options: GraphOptions) =>
        Effect.gen(function* () {
          // Check cache
          const cache = yield* Ref.get(graphCache)
          const cached = cache.get(repositoryPath)

          if (cached && !isExpired(cached)) {
            return cached.graph
          }

          // Fetch commits from git
          const commits = yield* fetchCommits(repositoryPath, options)

          // Build graph structure
          const graph = yield* graphBuilder.buildGraph(commits, options)

          // Update cache
          yield* Ref.update(graphCache, cache => {
            cache.set(repositoryPath, {
              graph,
              timestamp: Date.now(),
              ttl: Duration.toMillis(Duration.minutes(5))
            })
            return cache
          })

          return graph
        }),

      refreshGraph: (repositoryPath: string, existingGraph: CommitGraph) =>
        Effect.gen(function* () {
          // Fetch only new commits
          const newCommits = yield* fetchCommitsSince(
            repositoryPath,
            existingGraph.latestCommit
          )

          if (newCommits.length === 0) {
            return existingGraph
          }

          // Update graph incrementally
          return yield* graphBuilder.updateGraph(existingGraph, newCommits)
        })
    }
  }),
  dependencies: [GitExecutorPort, CommitGraphBuilder]
}) {}
```

### Day 10: File System Adapter

**Files to Create:**

```bash
src/main/source-control/adapters/file-system/node-file-system.ts
src/main/source-control/adapters/file-system/repository-scanner.ts
```

**Node File System Adapter:**

```typescript
// src/main/source-control/adapters/file-system/node-file-system.ts
import { Effect, Stream, Scope } from 'effect'
import * as fs from 'fs/promises'
import * as path from 'path'
import { watch } from 'chokidar'
import { FileSystemPort } from '../../ports/secondary/file-system-port'

export class NodeFileSystemAdapter extends Effect.Service<NodeFileSystemAdapter>()(
  'NodeFileSystemAdapter',
  {
    effect: Effect.sync(() => {
      const adapter: FileSystemPort = {
        findGitRepositories: (basePath: string) =>
          Effect.gen(function* () {
            const repos: string[] = []

            const scan = (dir: string): Effect.Effect<void> =>
              Effect.gen(function* () {
                const entries = yield* Effect.tryPromise(() =>
                  fs.readdir(dir, { withFileTypes: true })
                )

                for (const entry of entries) {
                  const fullPath = path.join(dir, entry.name)

                  if (entry.name === '.git' && entry.isDirectory()) {
                    repos.push(path.dirname(fullPath))
                  } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    yield* scan(fullPath)
                  }
                }
              })

            yield* scan(basePath)
            return repos
          }),

        watchDirectory: (dirPath: string) =>
          Stream.async<FileEvent>((emit) => {
            const watcher = watch(dirPath, {
              ignored: /(^|[\/\\])\../, // ignore dotfiles
              persistent: true
            })

            watcher.on('change', (path) => {
              emit.single({
                type: 'changed',
                path,
                timestamp: new Date()
              })
            })

            watcher.on('add', (path) => {
              emit.single({
                type: 'added',
                path,
                timestamp: new Date()
              })
            })

            watcher.on('unlink', (path) => {
              emit.single({
                type: 'deleted',
                path,
                timestamp: new Date()
              })
            })

            return Effect.sync(() => {
              watcher.close()
            })
          })
      }

      return adapter
    })
  }
) {}
```

## Week 3: IPC Integration & Provider Abstraction

### Day 11-12: IPC Contracts & Handlers

**Files to Create:**

```bash
src/shared/ipc-contracts/source-control-contracts.ts
src/main/ipc/source-control-handlers.ts
```

**IPC Contracts:**

```typescript
// src/shared/ipc-contracts/source-control-contracts.ts
import { Schema as S } from 'effect'
import { Repository, CommitGraph, Branch } from '../schemas/source-control'

export const SourceControlIpcContracts = {
  // Repository management
  discoverRepositories: {
    channel: 'source-control:discover-repositories' as const,
    input: S.Struct({
      searchPaths: S.Array(S.String)
    }),
    output: S.Array(Repository),
    errors: S.Union(RepositoryDiscoveryError)
  },

  getRepository: {
    channel: 'source-control:get-repository' as const,
    input: S.Struct({
      path: S.String
    }),
    output: Repository,
    errors: S.Union(RepositoryNotFoundError)
  },

  // Commit graph
  getCommitGraph: {
    channel: 'source-control:get-commit-graph' as const,
    input: S.Struct({
      repositoryPath: S.String,
      options: GraphOptions
    }),
    output: CommitGraph,
    errors: S.Union(GraphBuildError)
  },

  // Branch operations
  listBranches: {
    channel: 'source-control:list-branches' as const,
    input: S.Struct({
      repositoryPath: S.String
    }),
    output: S.Array(Branch),
    errors: S.Union(GitCommandError)
  },

  createBranch: {
    channel: 'source-control:create-branch' as const,
    input: S.Struct({
      repositoryPath: S.String,
      branchName: S.String,
      startPoint: S.optional(S.String)
    }),
    output: S.Void,
    errors: S.Union(GitCommandError)
  },

  // Working tree
  getStatus: {
    channel: 'source-control:get-status' as const,
    input: S.Struct({
      repositoryPath: S.String
    }),
    output: WorkingTreeStatus,
    errors: S.Union(GitCommandError)
  }
} as const
```

**IPC Handlers:**

```typescript
// src/main/ipc/source-control-handlers.ts
import { Effect } from 'effect'
import { registerIpcHandler } from './ipc-handler-setup'
import { SourceControlIpcContracts } from '../../shared/ipc-contracts/source-control-contracts'
import { RepositoryService } from '../source-control/services/repository-service'
import { CommitGraphService } from '../source-control/services/commit-graph-service'

export const setupSourceControlIpcHandlers = Effect.gen(function* () {
  const repoService = yield* RepositoryService
  const graphService = yield* CommitGraphService

  // Repository management
  registerIpcHandler(
    SourceControlIpcContracts.discoverRepositories,
    (input) => repoService.discoverRepositories(input.searchPaths)
  )

  registerIpcHandler(
    SourceControlIpcContracts.getRepository,
    (input) => repoService.getRepository(input.path)
  )

  // Commit graph
  registerIpcHandler(
    SourceControlIpcContracts.getCommitGraph,
    (input) => graphService.buildGraph(input.repositoryPath, input.options)
  )

  // Add more handlers...
})
```

### Day 13-14: Provider Port Abstraction

**Files to Create:**

```bash
src/main/source-control/ports/secondary/provider-port.ts
src/main/source-control/adapters/providers/github/github-provider-adapter.ts
src/main/source-control/adapters/providers/provider-factory.ts
```

**Provider Port:**

```typescript
// src/main/source-control/ports/secondary/provider-port.ts
import { Effect } from 'effect'
import { AccountId, ProviderType } from '../../../shared/schemas/account-context'

export interface ProviderPort {
  /**
   * Get provider type
   */
  readonly type: ProviderType

  /**
   * Authenticate with the provider
   */
  authenticate(
    accountId: AccountId
  ): Effect.Effect<AuthToken, AuthenticationError>

  /**
   * Get repository metadata from provider
   */
  getRepositoryMetadata(
    owner: string,
    repo: string
  ): Effect.Effect<RepositoryMetadata, ApiError>

  /**
   * List user's repositories
   */
  listRepositories(
    accountId: AccountId
  ): Effect.Effect<ProviderRepository[], ApiError>

  /**
   * Create a pull request
   */
  createPullRequest(
    data: PullRequestData
  ): Effect.Effect<PullRequest, ApiError>

  /**
   * Get pull request details
   */
  getPullRequest(
    owner: string,
    repo: string,
    number: number
  ): Effect.Effect<PullRequest, ApiError>
}
```

**GitHub Provider Adapter (wrapping existing):**

```typescript
// src/main/source-control/adapters/providers/github/github-provider-adapter.ts
import { Effect } from 'effect'
import { ProviderPort } from '../../../ports/secondary/provider-port'
import { GitHubApiService } from '../../../../github/api-service'

export class GitHubProviderAdapter extends Effect.Service<GitHubProviderAdapter>()(
  'GitHubProviderAdapter',
  {
    effect: Effect.gen(function* () {
      const githubApi = yield* GitHubApiService

      const adapter: ProviderPort = {
        type: 'github' as const,

        authenticate: (accountId) =>
          // Delegate to existing GitHub auth service
          githubApi.authenticate(accountId),

        getRepositoryMetadata: (owner, repo) =>
          githubApi.getRepository(owner, repo).pipe(
            Effect.map(toRepositoryMetadata)
          ),

        listRepositories: (accountId) =>
          githubApi.getUserRepositories(accountId).pipe(
            Effect.map(repos => repos.map(toProviderRepository))
          ),

        createPullRequest: (data) =>
          githubApi.createPullRequest(
            data.owner,
            data.repo,
            data.title,
            data.body,
            data.head,
            data.base
          ),

        getPullRequest: (owner, repo, number) =>
          githubApi.getPullRequest(owner, repo, number)
      }

      return adapter
    }),
    dependencies: [GitHubApiService.Default]
  }
) {}
```

### Day 15: Sync Service

**Files to Create:**

```bash
src/main/source-control/services/sync-service.ts
```

**Sync Service:**

```typescript
// src/main/source-control/services/sync-service.ts
import { Effect } from 'effect'
import { GitExecutorPort } from '../ports/secondary/git-executor-port'
import { ProviderPort } from '../ports/secondary/provider-port'

export class SyncService extends Effect.Service<SyncService>()('SyncService', {
  effect: Effect.gen(function* () {
    const gitExecutor = yield* GitExecutorPort
    const providerFactory = yield* ProviderFactory

    return {
      fetch: (repositoryPath: string, remote: string = 'origin') =>
        gitExecutor.executeCommand({
          args: ['fetch', remote],
          workingDirectory: repositoryPath
        }),

      pull: (repositoryPath: string, remote: string = 'origin', branch?: string) =>
        Effect.gen(function* () {
          const args = ['pull', remote]
          if (branch) args.push(branch)

          return yield* gitExecutor.executeCommand({
            args,
            workingDirectory: repositoryPath
          })
        }),

      push: (repositoryPath: string, remote: string = 'origin', branch?: string) =>
        Effect.gen(function* () {
          const args = ['push', remote]
          if (branch) args.push(branch)

          return yield* gitExecutor.executeCommand({
            args,
            workingDirectory: repositoryPath
          })
        }),

      syncWithProvider: (repositoryPath: string, provider: ProviderType) =>
        Effect.gen(function* () {
          const providerAdapter = yield* providerFactory.getProvider(provider)

          // Get remote URL from repository
          const remoteUrl = yield* getRemoteUrl(repositoryPath)
          const { owner, repo } = parseGitUrl(remoteUrl)

          // Get latest metadata from provider
          const metadata = yield* providerAdapter.getRepositoryMetadata(owner, repo)

          // Sync local with remote
          yield* fetch(repositoryPath)

          return metadata
        })
    }
  }),
  dependencies: [GitExecutorPort, ProviderFactory]
}) {}
```

## Week 4: UI Integration & Testing

### Day 16-17: Renderer Client & Atoms

**Files to Create:**

```bash
src/renderer/lib/source-control-client.ts
src/renderer/atoms/source-control-atoms.ts
src/renderer/hooks/useSourceControl.ts
```

**Source Control Client:**

```typescript
// src/renderer/lib/source-control-client.ts
import { Effect } from 'effect'
import { ElectronIpcClient } from './ipc-client'
import { SourceControlIpcContracts } from '../../shared/ipc-contracts/source-control-contracts'

export class SourceControlClient extends Effect.Service<SourceControlClient>()(
  'SourceControlClient',
  {
    effect: Effect.gen(function* () {
      const ipcClient = yield* ElectronIpcClient

      return {
        discoverRepositories: (searchPaths: string[]) =>
          ipcClient.invoke(
            SourceControlIpcContracts.discoverRepositories,
            { searchPaths }
          ),

        getRepository: (path: string) =>
          ipcClient.invoke(
            SourceControlIpcContracts.getRepository,
            { path }
          ),

        getCommitGraph: (repositoryPath: string, options: GraphOptions) =>
          ipcClient.invoke(
            SourceControlIpcContracts.getCommitGraph,
            { repositoryPath, options }
          ),

        // Add more client methods...
      }
    }),
    dependencies: [ElectronIpcClient]
  }
) {}
```

**Atoms:**

```typescript
// src/renderer/atoms/source-control-atoms.ts
import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { SourceControlClient } from '../lib/source-control-client'

// Repositories atom
export const repositoriesAtom = Atom.make(
  Effect.gen(function* () {
    const client = yield* SourceControlClient
    const workspacePaths = [process.cwd()] // Get from workspace
    return yield* client.discoverRepositories(workspacePaths)
  })
)
  .pipe(Atom.setIdleTTL(Duration.seconds(30)))
  .pipe(Atom.withReactivityKeys([['source-control:repositories']]))

// Commit graph atom (parameterized)
export const commitGraphAtom = Atom.family(
  (params: { repositoryPath: string; options: GraphOptions }) =>
    Atom.make(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.getCommitGraph(params.repositoryPath, params.options)
      })
    )
      .pipe(Atom.setIdleTTL(Duration.seconds(10)))
      .pipe(Atom.withReactivityKeys([
        ['source-control:commit-graph', params.repositoryPath]
      ]))
)

// Repository status atom
export const repositoryStatusAtom = Atom.family((repositoryPath: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.getStatus(repositoryPath)
    })
  )
    .pipe(Atom.setIdleTTL(Duration.seconds(5)))
    .pipe(Atom.withReactivityKeys([
      ['source-control:status', repositoryPath]
    ]))
)
```

### Day 18-19: UI Components

**Files to Create:**

```bash
src/renderer/components/source-control/RepositoryExplorer.tsx
src/renderer/components/source-control/CommitGraph.tsx
src/renderer/components/source-control/BranchList.tsx
src/renderer/components/source-control/StatusBar.tsx
```

**Repository Explorer Component:**

```typescript
// src/renderer/components/source-control/RepositoryExplorer.tsx
import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useRepositories } from '../../hooks/useSourceControl'

export function RepositoryExplorer() {
  const { repositoriesResult } = useRepositories()

  return Result.builder(repositoriesResult)
    .onInitial(() => (
      <div className="loading">Discovering repositories...</div>
    ))
    .onErrorTag('RepositoryDiscoveryError', (error) => (
      <div className="error">
        Failed to discover repositories: {error.message}
      </div>
    ))
    .onDefect((defect) => (
      <div className="error">Unexpected error: {String(defect)}</div>
    ))
    .onSuccess((data) => {
      const repos = data.value

      if (repos.length === 0) {
        return <div className="empty">No repositories found</div>
      }

      return (
        <div className="repository-list">
          {repos.map(repo => (
            <RepositoryItem key={repo.id.value} repository={repo} />
          ))}
        </div>
      )
    })
    .render()
}
```

### Day 20: Testing Setup

**Files to Create:**

```bash
src/main/source-control/__tests__/repository-service.test.ts
src/main/source-control/__tests__/mocks/mock-git-executor.ts
src/main/source-control/__tests__/mocks/mock-file-system.ts
```

**Repository Service Test:**

```typescript
// src/main/source-control/__tests__/repository-service.test.ts
import { Effect, Layer } from 'effect'
import { describe, test, expect } from 'vitest'
import { RepositoryService } from '../services/repository-service'
import { MockGitExecutor } from './mocks/mock-git-executor'
import { MockFileSystem } from './mocks/mock-file-system'

describe('RepositoryService', () => {
  const TestLayer = Layer.mergeAll(
    MockGitExecutor.Default,
    MockFileSystem.Default,
    RepositoryService.Default
  )

  test('discovers repositories in workspace', async () => {
    const program = Effect.gen(function* () {
      const service = yield* RepositoryService
      const repos = yield* service.discoverRepositories(['/test/workspace'])

      expect(repos).toHaveLength(2)
      expect(repos[0].name).toBe('project-a')
      expect(repos[1].name).toBe('project-b')
    })

    await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
  })

  test('caches discovered repositories', async () => {
    const program = Effect.gen(function* () {
      const service = yield* RepositoryService

      // First call
      const repos1 = yield* service.discoverRepositories(['/test/workspace'])

      // Second call should use cache
      const repos2 = yield* service.discoverRepositories(['/test/workspace'])

      expect(repos1).toBe(repos2) // Same reference
    })

    await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
  })
})
```

## Migration Checklist

### Phase 1: Non-Breaking Setup ✅
- [ ] Create domain model alongside existing code
- [ ] Define port interfaces
- [ ] Wrap existing GitCommandRunner as GitExecutorPort
- [ ] Create FileSystemPort implementation

### Phase 2: Service Layer ⏳
- [ ] Implement RepositoryService
- [ ] Implement CommitGraphService
- [ ] Implement SyncService
- [ ] Add caching layer

### Phase 3: Provider Abstraction ⏳
- [ ] Create ProviderPort interface
- [ ] Wrap existing GitHub service
- [ ] Add provider factory
- [ ] Prepare for GitLab addition

### Phase 4: UI Integration ⏳
- [ ] Create IPC contracts
- [ ] Add IPC handlers
- [ ] Create renderer client
- [ ] Build atoms
- [ ] Update components

### Phase 5: Testing & Documentation ⏳
- [ ] Unit tests for services
- [ ] Integration tests for adapters
- [ ] Contract tests for IPC
- [ ] Update documentation

### Phase 6: Deprecation ⏳
- [ ] Mark old implementations as deprecated
- [ ] Update all consumers to new API
- [ ] Remove old code
- [ ] Final testing

## Risk Mitigation

### 1. Backward Compatibility
- Keep old implementations working during migration
- Use adapter pattern to wrap existing code
- Gradual migration with feature flags

### 2. Performance Regression
- Benchmark critical paths before/after
- Keep caching layer from day 1
- Profile memory usage with large repos

### 3. Type Safety
- No `any` types in new code
- Use Effect Schema for all boundaries
- Strict TypeScript configuration

### 4. Testing Coverage
- Minimum 80% coverage for new code
- Integration tests for critical paths
- E2E tests for UI workflows

## Success Criteria

### Week 1 Success
- Domain model defined and tested
- Ports clearly specified
- Existing code wrapped successfully

### Week 2 Success
- Repository discovery working
- Commit graphs rendering
- Basic git operations functional

### Week 3 Success
- IPC integration complete
- Provider abstraction working
- GitHub integration maintained

### Week 4 Success
- UI components migrated
- Tests passing
- Documentation complete

## Next Steps

1. **Immediate**: Start with domain model (Day 1-2 tasks)
2. **This Week**: Complete Week 1 implementation
3. **Review**: Architecture review after Week 1
4. **Iterate**: Adjust plan based on learnings

## Resources

- [Effect Documentation](https://effect.website)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Git Internals](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
- [Domain-Driven Design](https://www.domainlanguage.com/ddd/)

---

This roadmap provides a clear, actionable path to implementing the hexagonal architecture while maintaining system stability and backward compatibility.