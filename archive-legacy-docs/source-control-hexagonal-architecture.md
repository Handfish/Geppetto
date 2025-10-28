# Source Control Domain - Hexagonal Architecture Design

## Executive Summary

This document outlines a comprehensive hexagonal architecture for the source control domain in Geppetto, unifying local Git operations, online repository management (GitHub/GitLab/Bitbucket), and Git visualization features. The design follows ports and adapters pattern with clear separation between domain logic, application services, and infrastructure.

## Current State Analysis

### What Currently Exists

1. **Basic Source Control Infrastructure** (`src/main/source-control/`)
   - `GitCommandRunnerPort` - Port for executing git commands
   - `NodeGitCommandRunner` - Node.js adapter using child_process
   - `GitCommandService` - Basic orchestration service
   - Good foundation but limited scope

2. **Online Provider Support** (`src/main/github/`)
   - GitHub API integration with OAuth
   - Provider-specific services and adapters
   - Account management integration
   - Not yet abstracted for multiple providers

3. **Planned Git Tree Features** (docs/git-tree-plan.md)
   - Commit graph visualization
   - Repository discovery
   - Git operations UI
   - Not yet implemented

### Key Issues to Address

- **Fragmentation**: Git operations split between source-control and provider domains
- **Limited Abstraction**: GitCommandRunner is infrastructure-focused, lacks domain abstraction
- **Missing Features**: No repository discovery, commit graph building, or unified git operations
- **Provider Lock-in**: GitHub-specific implementation not easily extensible
- **Poor DX**: No unified API for git operations across local and remote

## Proposed Hexagonal Architecture

### Core Domain Model

```
┌─────────────────────────────────────────────────────────────┐
│                      DOMAIN CORE                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Aggregates:                                              ││
│  │ • Repository (id, path, state, config)                   ││
│  │ • CommitGraph (nodes, edges, metadata)                   ││
│  │ • WorkingTree (status, staged, unstaged)                 ││
│  │                                                           ││
│  │ Value Objects:                                           ││
│  │ • Commit (hash, author, message, parents)                ││
│  │ • Branch (name, upstream, tracking)                      ││
│  │ • Remote (name, url, fetch/push specs)                   ││
│  │ • FileChange (path, status, diff)                        ││
│  │                                                           ││
│  │ Domain Services:                                          ││
│  │ • CommitGraphBuilder                                      ││
│  │ • MergeConflictResolver                                   ││
│  │ • DiffCalculator                                          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Port Layer (Hexagon Boundaries)

```
┌─────────────────────────────────────────────────────────────┐
│                         PORTS                                │
│                                                               │
│  PRIMARY (Driving) PORTS:                                    │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ RepositoryManagementPort │  │ CommitOperationsPort     ││
│  │ • discoverRepositories   │  │ • getCommitGraph         ││
│  │ • getRepositoryInfo      │  │ • getCommitDetails       ││
│  │ • watchRepository        │  │ • getDiff                ││
│  └──────────────────────────┘  └──────────────────────────┘│
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ BranchOperationsPort     │  │ RemoteOperationsPort     ││
│  │ • listBranches           │  │ • fetch                  ││
│  │ • createBranch           │  │ • pull                   ││
│  │ • switchBranch           │  │ • push                   ││
│  │ • mergeBranch            │  │ • listRemotes            ││
│  └──────────────────────────┘  └──────────────────────────┘│
│                                                               │
│  SECONDARY (Driven) PORTS:                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ GitExecutorPort          │  │ FileSystemPort           ││
│  │ • executeCommand         │  │ • readFile               ││
│  │ • streamCommand          │  │ • watchDirectory         ││
│  │ • parseOutput            │  │ • findRepositories       ││
│  └──────────────────────────┘  └──────────────────────────┘│
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ ProviderPort             │  │ ConfigurationPort        ││
│  │ • authenticate           │  │ • getGitConfig           ││
│  │ • fetchRepoMetadata      │  │ • getUserConfig          ││
│  │ • createPullRequest      │  │ • getGlobalConfig        ││
│  └──────────────────────────┘  └──────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Adapter Layer

```
┌─────────────────────────────────────────────────────────────┐
│                        ADAPTERS                              │
│                                                               │
│  Infrastructure Adapters (Secondary):                        │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ NodeGitExecutor          │  │ NodeFileSystemAdapter    ││
│  │ • Uses child_process     │  │ • Uses fs/chokidar       ││
│  │ • Parses git output      │  │ • Watches .git dirs      ││
│  └──────────────────────────┘  └──────────────────────────┘│
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ GitHubProviderAdapter    │  │ GitLabProviderAdapter    ││
│  │ • REST/GraphQL API       │  │ • GitLab API v4          ││
│  │ • OAuth integration      │  │ • OAuth integration      ││
│  └──────────────────────────┘  └──────────────────────────┘│
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ LibGit2Executor          │  │ BitbucketProviderAdapter ││
│  │ • Future: native bindings│  │ • Bitbucket API          ││
│  └──────────────────────────┘  └──────────────────────────┘│
│                                                               │
│  UI Adapters (Primary):                                      │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ IpcHandlers              │  │ RestApiController        ││
│  │ • Electron IPC           │  │ • Future: HTTP API       ││
│  └──────────────────────────┘  └──────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Application Services Layer

```
┌─────────────────────────────────────────────────────────────┐
│                  APPLICATION SERVICES                        │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ RepositoryService                                      │  │
│  │ • Orchestrates repository discovery and management     │  │
│  │ • Coordinates between GitExecutor and FileSystem       │  │
│  │ • Manages repository state and caching                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ CommitGraphService                                     │  │
│  │ • Builds and caches commit graphs                      │  │
│  │ • Handles incremental updates                          │  │
│  │ • Manages graph layout algorithms                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ GitWorkflowService                                     │  │
│  │ • High-level git operations (merge, rebase, etc.)      │  │
│  │ • Conflict resolution workflows                        │  │
│  │ • Stash management                                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ SyncService                                            │  │
│  │ • Synchronizes local and remote repositories           │  │
│  │ • Manages authentication per provider                  │  │
│  │ • Handles push/pull/fetch operations                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Detailed File Structure

### Core Domain (`src/main/source-control/domain/`)

```typescript
domain/
├── aggregates/
│   ├── repository.ts          // Repository aggregate root
│   ├── commit-graph.ts        // CommitGraph aggregate
│   └── working-tree.ts        // WorkingTree aggregate
│
├── entities/
│   ├── commit.ts              // Commit entity
│   ├── branch.ts              // Branch entity
│   └── remote.ts              // Remote entity
│
├── value-objects/
│   ├── commit-hash.ts         // Branded CommitHash type
│   ├── branch-name.ts         // Validated BranchName
│   ├── file-status.ts         // FileStatus enum
│   └── diff-hunk.ts           // DiffHunk value object
│
├── services/
│   ├── commit-graph-builder.ts   // Domain service for graph construction
│   ├── merge-strategy.ts         // Merge algorithm implementations
│   └── diff-calculator.ts        // Diff computation logic
│
└── events/
    ├── repository-events.ts      // RepositoryDiscovered, RepositoryChanged
    └── commit-events.ts          // CommitCreated, BranchMerged
```

### Ports (`src/main/source-control/ports/`)

```typescript
ports/
├── primary/                      // Driving ports (called by UI/API)
│   ├── repository-management-port.ts
│   ├── commit-operations-port.ts
│   ├── branch-operations-port.ts
│   ├── remote-operations-port.ts
│   └── working-tree-port.ts
│
└── secondary/                    // Driven ports (implemented by adapters)
    ├── git-executor-port.ts      // Git command execution
    ├── file-system-port.ts       // File system operations
    ├── provider-port.ts          // Online provider integration
    ├── configuration-port.ts    // Git config access
    └── cache-port.ts             // Caching abstraction
```

### Adapters (`src/main/source-control/adapters/`)

```typescript
adapters/
├── git/
│   ├── node-git-executor.ts     // Existing NodeGitCommandRunner refactored
│   ├── git-output-parser.ts     // Parse git command outputs
│   ├── git-command-builder.ts   // Build git commands
│   └── libgit2-executor.ts      // Future: native git implementation
│
├── file-system/
│   ├── node-file-system.ts      // Node.js fs implementation
│   ├── repository-watcher.ts    // Watch .git directories
│   └── repository-scanner.ts    // Scan for repositories
│
├── providers/
│   ├── github/
│   │   ├── github-adapter.ts    // GitHub API implementation
│   │   └── github-auth.ts       // GitHub OAuth
│   ├── gitlab/
│   │   ├── gitlab-adapter.ts    // GitLab API implementation
│   │   └── gitlab-auth.ts       // GitLab OAuth
│   └── bitbucket/
│       ├── bitbucket-adapter.ts // Bitbucket API implementation
│       └── bitbucket-auth.ts    // Bitbucket OAuth
│
└── cache/
    ├── memory-cache.ts           // In-memory caching
    └── disk-cache.ts             // Persistent cache
```

### Application Services (`src/main/source-control/services/`)

```typescript
services/
├── repository-service.ts         // Repository discovery and management
├── commit-graph-service.ts       // Graph building and caching
├── git-workflow-service.ts       // High-level git operations
├── sync-service.ts               // Remote synchronization
├── diff-service.ts               // Diff generation and parsing
└── conflict-resolution-service.ts // Merge conflict handling
```

### Shared Schemas (`src/shared/schemas/source-control/`)

```typescript
schemas/
├── domain/
│   ├── repository.ts             // Repository schema
│   ├── commit.ts                 // Commit schema
│   ├── branch.ts                 // Branch schema
│   ├── remote.ts                 // Remote schema
│   └── graph.ts                  // CommitGraph schema
│
├── commands/                     // Command schemas (existing)
│   ├── git-command.ts
│   └── git-command-result.ts
│
├── events/                       // Event schemas
│   ├── repository-events.ts
│   └── git-events.ts
│
└── errors.ts                     // Error types (existing + new)
```

## Implementation Phases

### Phase 1: Core Domain & Ports (Week 1)

**Goal**: Establish domain model and port interfaces

1. **Create Domain Model**
   ```typescript
   // src/main/source-control/domain/aggregates/repository.ts
   export class Repository extends S.Class<Repository>('Repository')({
     id: RepositoryId,
     path: S.String,
     name: S.String,
     state: RepositoryState,
     remotes: S.Array(Remote),
     branches: S.Array(Branch),
     head: S.optional(CommitHash),
   }) {
     // Domain methods
     public isDetached(): boolean
     public getCurrentBranch(): Branch | undefined
     public hasUncommittedChanges(): boolean
   }
   ```

2. **Define Port Interfaces**
   ```typescript
   // src/main/source-control/ports/primary/repository-management-port.ts
   export interface RepositoryManagementPort {
     discoverRepositories(
       paths: string[]
     ): Effect.Effect<Repository[], RepositoryDiscoveryError>

     getRepository(
       path: string
     ): Effect.Effect<Repository, RepositoryNotFoundError>

     watchRepository(
       path: string
     ): Stream.Stream<RepositoryEvent, never, Scope.Scope>
   }
   ```

3. **Establish Error Hierarchy**
   ```typescript
   // Domain errors using Data.TaggedError
   export class GitOperationError extends Data.TaggedError('GitOperationError')<{
     operation: string
     repository: string
     cause?: unknown
   }> {}
   ```

### Phase 2: Refactor Existing Adapters (Week 1-2)

**Goal**: Align existing code with hexagonal architecture

1. **Refactor NodeGitCommandRunner**
   - Extract as implementation of `GitExecutorPort`
   - Separate parsing logic into `GitOutputParser`
   - Add command building abstraction

2. **Create FileSystem Adapter**
   ```typescript
   export class NodeFileSystemAdapter implements FileSystemPort {
     findRepositories(basePath: string): Effect.Effect<string[], Error>
     watchDirectory(path: string): Stream.Stream<FileEvent, never, Scope.Scope>
   }
   ```

3. **Abstract Provider Adapters**
   - Create `ProviderPort` interface
   - Refactor existing GitHub code to implement port
   - Prepare for GitLab/Bitbucket additions

### Phase 3: Application Services (Week 2)

**Goal**: Implement orchestration layer

1. **Repository Service**
   ```typescript
   export class RepositoryService extends Effect.Service<RepositoryService>()(
     'RepositoryService',
     {
       dependencies: [GitExecutorPort, FileSystemPort, CachePort],
       effect: Effect.gen(function* () {
         const executor = yield* GitExecutorPort
         const fs = yield* FileSystemPort
         const cache = yield* CachePort

         return {
           discoverRepositories: (paths: string[]) =>
             Effect.gen(function* () {
               // Orchestrate discovery using fs and git
             }),
           // ... other methods
         }
       })
     }
   ) {}
   ```

2. **CommitGraph Service**
   - Build graphs from git log output
   - Cache graphs with TTL
   - Support incremental updates

3. **GitWorkflow Service**
   - High-level operations (merge, rebase, cherry-pick)
   - Conflict detection and resolution
   - Stash management

### Phase 4: IPC & UI Integration (Week 3)

**Goal**: Connect to renderer process

1. **IPC Contracts**
   ```typescript
   export const SourceControlIpcContracts = {
     discoverRepositories: {
       channel: 'source-control:discover-repositories',
       input: S.Struct({ paths: S.Array(S.String) }),
       output: S.Array(Repository),
       errors: S.Union(RepositoryDiscoveryError),
     },
     // ... other contracts
   }
   ```

2. **IPC Handlers**
   - Use centralized `registerIpcHandler` pattern
   - Map domain errors to IPC errors

3. **Renderer Atoms**
   ```typescript
   export const repositoriesAtom = Atom.make(
     Effect.gen(function* () {
       const client = yield* SourceControlClient
       return yield* client.discoverRepositories()
     })
   ).pipe(
     Atom.setIdleTTL(Duration.seconds(30))
   )
   ```

### Phase 5: Git Tree Visualization (Week 4)

**Goal**: Implement commit graph visualization

1. **Graph Layout Algorithm**
   - Implement Sugiyama algorithm for DAG layout
   - Support branch coloring
   - Handle merge commits

2. **Canvas Renderer**
   - High-performance canvas rendering
   - Virtual scrolling for large graphs
   - Interactive node selection

3. **UI Components**
   - Repository browser
   - Commit details panel
   - Branch management UI

## Key Design Decisions

### 1. Port-Based Abstraction

**Why**: Enables testing, swapping implementations, and clear boundaries

- All external dependencies go through ports
- Domain logic never directly calls infrastructure
- Ports are Effect-based for consistency

### 2. Separate Local and Remote Operations

**Why**: Different concerns, different error handling

- Local operations use `GitExecutorPort`
- Remote operations use `ProviderPort`
- `SyncService` coordinates between them

### 3. Domain Events for State Changes

**Why**: Reactive updates, audit trail, extensibility

```typescript
export type RepositoryEvent =
  | RepositoryDiscovered
  | BranchCreated
  | CommitCreated
  | FileChanged
```

### 4. Caching at Service Layer

**Why**: Performance, especially for expensive operations

- Commit graphs cached with TTL
- Repository state cached and invalidated on changes
- Provider data cached to reduce API calls

### 5. Provider Abstraction

**Why**: Support multiple providers without code duplication

```typescript
export interface ProviderPort {
  authenticate(accountId: AccountId): Effect.Effect<Token, AuthError>
  getRepositoryMetadata(repo: string): Effect.Effect<RepoMetadata, ApiError>
  createPullRequest(pr: PullRequestData): Effect.Effect<PullRequest, ApiError>
}
```

## Migration Strategy

### Step 1: Parallel Implementation

- Build new architecture alongside existing code
- No breaking changes initially
- Gradually move features to new structure

### Step 2: Adapter Wrapping

- Wrap existing `NodeGitCommandRunner` as `GitExecutorPort`
- Wrap existing GitHub service as `ProviderPort`
- Maintain backward compatibility

### Step 3: Service Migration

- Move logic from existing services to new application services
- Update IPC handlers to use new services
- Deprecate old implementations

### Step 4: UI Migration

- Update atoms to use new IPC contracts
- Migrate components to new data structures
- Remove old UI code

## Testing Strategy

### Unit Tests

```typescript
// Test ports with mock implementations
class MockGitExecutor implements GitExecutorPort {
  executeCommand(cmd: GitCommand): Effect.Effect<GitCommandResult> {
    // Return canned responses
  }
}

// Test services with mock ports
test('RepositoryService discovers repositories', async () => {
  const service = RepositoryService.make({
    gitExecutor: new MockGitExecutor(),
    fileSystem: new MockFileSystem(),
  })

  const repos = await Effect.runPromise(
    service.discoverRepositories(['/test/path'])
  )
  expect(repos).toHaveLength(2)
})
```

### Integration Tests

```typescript
// Test with real git repositories
test('CommitGraphService builds graph from real repo', async () => {
  const testRepo = await createTestRepository()
  const graph = await buildCommitGraph(testRepo.path)
  expect(graph.nodes).toHaveLength(10)
})
```

### Contract Tests

```typescript
// Test IPC contracts
test('IPC contract for discoverRepositories', async () => {
  const input = { paths: ['/workspace'] }
  const result = await invokeIpc('source-control:discover-repositories', input)
  expect(S.is(S.Array(Repository))(result)).toBe(true)
})
```

## Performance Considerations

### 1. Streaming for Large Operations

```typescript
// Stream commit parsing for repos with 10k+ commits
streamCommits(repoPath: string): Stream.Stream<Commit> {
  return gitExecutor.streamCommand(
    new GitLogCommand({ format: '%H|%P|%an|%s' })
  ).pipe(
    Stream.map(parseCommitLine),
    Stream.buffer(100) // Buffer for performance
  )
}
```

### 2. Incremental Updates

```typescript
// Only fetch new commits since last update
refreshGraph(graph: CommitGraph): Effect.Effect<CommitGraph> {
  const newCommits = yield* fetchCommitsSince(graph.latestCommit)
  return updateGraphIncremental(graph, newCommits)
}
```

### 3. Lazy Loading

```typescript
// Load commit details on demand
const commitDetailsAtom = Atom.family((hash: string) =>
  Atom.make(Effect.suspend(() => loadCommitDetails(hash)))
)
```

### 4. Background Processing

```typescript
// Watch repositories in background
Effect.forkScoped(
  watchAllRepositories().pipe(
    Stream.tap(event => updateCache(event)),
    Stream.runDrain
  )
)
```

## Security Considerations

### 1. Command Injection Prevention

```typescript
// Validate and escape all user inputs
const sanitizedBranchName = validateBranchName(userInput)
const command = GitCommand.create(['checkout', '-b', sanitizedBranchName])
```

### 2. Token Security

```typescript
// Use Redacted type for sensitive data
type GitHubToken = Redacted<string>

// Tokens never logged or exposed
const token = yield* SecureStore.getToken(accountId)
const unredacted = Redacted.value(token) // Explicit unwrap
```

### 3. Path Traversal Prevention

```typescript
// Validate repository paths
const validateRepoPath = (path: string): Effect.Effect<string> =>
  isInsideWorkspace(path)
    ? Effect.succeed(path)
    : Effect.fail(new InvalidPathError())
```

## Success Metrics

1. **Architecture Quality**
   - Zero coupling between layers
   - 100% port coverage for external dependencies
   - All domain logic testable without infrastructure

2. **Performance**
   - Graph rendering < 100ms for 1000 commits
   - Repository discovery < 500ms for typical workspace
   - Incremental updates < 50ms

3. **Developer Experience**
   - Single API for all git operations
   - Consistent error handling across providers
   - Type-safe from domain to UI

4. **Extensibility**
   - New provider addition < 1 day
   - New git operation addition < 2 hours
   - New UI feature addition without backend changes

## Conclusion

This hexagonal architecture provides:

1. **Clear Separation of Concerns**: Domain logic isolated from infrastructure
2. **Testability**: All components testable in isolation
3. **Extensibility**: Easy to add new providers, storage, or UI
4. **Performance**: Optimized for large repositories
5. **Type Safety**: End-to-end type safety with Effect

The architecture unifies local git operations, online provider integration, and visualization features into a cohesive, maintainable system that follows functional programming principles and Effect patterns throughout.