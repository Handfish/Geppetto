# Source Control Hexagonal Architecture

**Date:** 2025-10-26
**Status:** ✅ Implemented
**Pattern:** Hybrid (Single + Multiple Implementation Ports)

---

## Overview

The Source Control domain has been refactored to follow **Hexagonal (Ports & Adapters) Architecture** using a **hybrid pattern** that combines:

1. **Single Implementation Ports** (Infrastructure) - Like AI Watchers
2. **Multiple Implementation Ports** (Providers) - Like AI/VCS Providers

This enables:

✅ **Hot-swappable infrastructure** - Swap Git/FS implementations for testing
✅ **Multi-provider support** - GitHub, GitLab, Bitbucket
✅ **Type-safe contracts** - All adapters implement port interfaces
✅ **Isolated testing** - Each adapter can be tested independently
✅ **Clear boundaries** - Ports define contracts, adapters implement, services consume

---

## Architecture Components

### 1. Dual Port Pattern

Source Control uses TWO distinct port patterns:

#### Infrastructure Ports (Single Implementation)

These ports have ONE active implementation at runtime:

```typescript
// Git execution - ONE implementation
GitCommandRunnerPort → NodeGitCommandRunner
                     (future: LibGit2Runner, JGitRunner)

// File system - ONE implementation
FileSystemPort → NodeFileSystemAdapter
               (future: MemoryFsAdapter, BrowserFsAdapter)
```

**Pattern:** Direct dependency injection, no registry needed

#### Provider Ports (Multiple Implementations)

These ports have MULTIPLE implementations running simultaneously:

```typescript
// Source control providers - MULTIPLE implementations
ProviderPort → GitHubProviderAdapter   // Active
            → GitLabProviderAdapter    // Active (future)
            → BitbucketProviderAdapter // Active (future)
```

**Pattern:** Factory/registry service for dynamic selection

---

## File Structure

```
src/main/source-control/
├── adapters/                          # Infrastructure adapters
│   ├── git/
│   │   └── node-git-command-runner.ts   # Git execution (Node.js child_process)
│   ├── file-system/
│   │   └── node-file-system-adapter.ts  # File system (Node.js fs/promises)
│   └── providers/                       # Provider adapters (multiple)
│       ├── github-provider-adapter.ts   # GitHub implementation
│       ├── provider-factory-service.ts  # Factory/registry
│       └── index.ts
│
├── services/                          # Application services
│   ├── repository-service.ts          # Repository discovery & management
│   ├── commit-graph-service.ts        # Commit graph operations
│   ├── sync-service.ts                # Remote synchronization
│   └── git-command-service.ts         # Git command orchestration
│
├── ports/                             # Port definitions
│   ├── primary/                       # Driving ports (UI → Domain)
│   │   ├── repository-management-port.ts
│   │   ├── commit-operations-port.ts
│   │   ├── branch-operations-port.ts
│   │   └── working-tree-port.ts
│   └── secondary/                     # Driven ports (Domain → Infrastructure)
│       ├── provider-port.ts           # Provider abstraction (MULTIPLE)
│       └── file-system-port.ts        # File system abstraction (SINGLE)
│
├── domain/                            # Domain model (DDD)
│   ├── aggregates/
│   │   ├── repository.ts
│   │   ├── commit-graph.ts
│   │   └── working-tree.ts
│   ├── entities/
│   │   ├── commit.ts
│   │   ├── branch.ts
│   │   └── remote.ts
│   ├── value-objects/
│   │   ├── commit-hash.ts
│   │   ├── branch-name.ts
│   │   ├── file-status.ts
│   │   └── remote-url.ts
│   └── events/
│       └── repository-events.ts
│
├── adapters-layer.ts                  # Layer composition
├── git-command-service.ts             # Legacy (being refactored)
└── index.ts                           # Public exports
```

---

## Infrastructure Adapters (Single Implementation Pattern)

### 1. SourceControlAdaptersLayer Composition

All infrastructure adapters are composed into a single layer:

```typescript
// src/main/source-control/adapters-layer.ts
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
 * Similar to AI Watchers pattern (single implementation per port):
 * - GitCommandRunnerPort → NodeGitCommandRunner
 * - FileSystemPort → NodeFileSystemAdapter
 *
 * Unlike AI/VCS providers (multiple implementations per port):
 * - NO registry service needed for infrastructure adapters
 * - Adapters injected directly via dependencies
 * - Only ONE active implementation per port at runtime
 */
export const SourceControlAdaptersLayer = Layer.mergeAll(
  NodeGitCommandRunner.Default,
  NodeFileSystemAdapter.Default
)
```

### 2. Hot-Swapping for Tests

Infrastructure adapters can be replaced for testing:

```typescript
// Create mock adapters
const MockGitRunner = Layer.succeed(
  NodeGitCommandRunner,
  {
    execute: (request) => Effect.succeed(mockHandle),
  }
)

const MockFileSystem = Layer.succeed(
  NodeFileSystemAdapter,
  {
    readFile: (path) => Effect.succeed('mock content'),
    writeFile: (path, content) => Effect.void,
    findGitRepositories: (basePath) => Effect.succeed(['/test/repo1', '/test/repo2']),
  }
)

// Use in tests
const TestLayer = Layer.mergeAll(
  MockGitRunner,
  MockFileSystem,
  RepositoryService.Default
)

await Effect.runPromise(
  myTest.pipe(Effect.provide(TestLayer))
)
```

---

## Provider Adapters (Multiple Implementation Pattern)

### 1. Provider Port Definition

```typescript
// src/main/source-control/ports/secondary/provider-port.ts
export interface ProviderPort {
  readonly type: ProviderType

  authenticate(accountId: AccountId): Effect.Effect<AuthToken, AuthError>
  getRepositoryMetadata(owner: string, repo: string): Effect.Effect<RepoMetadata, ApiError>
  listRepositories(accountId: AccountId): Effect.Effect<ProviderRepository[], ApiError>
  createPullRequest(data: PullRequestData): Effect.Effect<PullRequest, ApiError>
  getPullRequest(owner: string, repo: string, number: number): Effect.Effect<PullRequest, ApiError>
}
```

### 2. Provider Adapter Implementation (GitHub)

```typescript
// src/main/source-control/adapters/providers/github-provider-adapter.ts
export class GitHubProviderAdapter extends Effect.Service<GitHubProviderAdapter>()(
  'GitHubProviderAdapter',
  {
    effect: Effect.gen(function* () {
      const githubApi = yield* GitHubApiService
      const auth = yield* GitHubAuthService

      const adapter: ProviderPort = {
        type: 'github' as const,

        authenticate: (accountId) =>
          auth.authenticate(accountId),

        getRepositoryMetadata: (owner, repo) =>
          githubApi.getRepository(owner, repo).pipe(
            Effect.map(toRepositoryMetadata)
          ),

        listRepositories: (accountId) =>
          githubApi.getUserRepositories(accountId).pipe(
            Effect.map(repos => repos.map(toProviderRepository))
          ),

        createPullRequest: (data) =>
          githubApi.createPullRequest(data),

        getPullRequest: (owner, repo, number) =>
          githubApi.getPullRequest(owner, repo, number)
      }

      return adapter
    }),
    dependencies: [GitHubApiService.Default, GitHubAuthService.Default]
  }
) {}
```

### 3. Provider Factory Service (Registry)

```typescript
// src/main/source-control/adapters/providers/provider-factory-service.ts
export class ProviderFactoryService extends Effect.Service<ProviderFactoryService>()(
  'ProviderFactoryService',
  {
    effect: Effect.gen(function* () {
      const githubAdapter = yield* GitHubProviderAdapter

      // Map of provider type to adapter instance
      const providers = new Map<ProviderType, ProviderPort>([
        ['github', githubAdapter],
        // Future: ['gitlab', gitlabAdapter],
        // Future: ['bitbucket', bitbucketAdapter],
      ])

      return {
        getProvider: (type: ProviderType) =>
          Effect.gen(function* () {
            const provider = providers.get(type)
            if (!provider) {
              return yield* Effect.fail(
                new ProviderNotSupportedError({ providerType: type })
              )
            }
            return provider
          }),

        getSupportedProviders: () => Array.from(providers.keys()),
      }
    }),
    dependencies: [GitHubProviderAdapter.Default]
  }
) {}
```

**Why Factory Instead of Tags?**

Unlike AI adapters which use Context.Tag for dynamic lookup, provider adapters use a simpler factory pattern because:

1. **Fewer providers** - Only 3-4 providers vs 10+ AI models
2. **Static registration** - Providers known at compile time
3. **Simpler API** - `getProvider(type)` more intuitive than tag lookups
4. **No hot-swapping needed** - Providers don't need runtime replacement like AI adapters

---

## Application Services

Services orchestrate domain logic using ports:

### Example: Repository Service

```typescript
// src/main/source-control/services/repository-service.ts
export class RepositoryService extends Effect.Service<RepositoryService>()(
  'RepositoryService',
  {
    effect: Effect.gen(function* () {
      const gitRunner = yield* NodeGitCommandRunner
      const fileSystem = yield* NodeFileSystemAdapter

      return {
        discoverRepositories: (searchPaths: string[]) =>
          Effect.gen(function* () {
            // Use file system adapter to find .git directories
            const repoPaths = yield* Effect.all(
              searchPaths.map(path => fileSystem.findGitRepositories(path))
            )

            // Use git runner to get repository details
            const repositories = yield* Effect.all(
              repoPaths.flat().map(path => createRepositoryFromPath(path))
            )

            return repositories
          }),

        getRepository: (path: string) =>
          Effect.gen(function* () {
            // Check if valid git repository
            const isValid = yield* fileSystem.isGitRepository(path)
            if (!isValid) {
              return yield* Effect.fail(new NotAGitRepositoryError({ path }))
            }

            // Load repository state
            const handle = yield* gitRunner.execute({
              args: ['status', '--porcelain'],
              worktree: { repositoryPath: path }
            })

            const result = yield* handle.awaitResult
            return parseRepositoryFromGitStatus(path, result)
          }),
      }
    }),
    dependencies: [NodeGitCommandRunner.Default, NodeFileSystemAdapter.Default]
  }
) {}
```

---

## Layer Composition

### MainLayer Integration

```typescript
// src/main/index.ts
const MainLayer = Layer.mergeAll(
  // Infrastructure adapters (single implementation)
  SourceControlAdaptersLayer,  // NodeGitCommandRunner + NodeFileSystemAdapter

  // Provider adapters (via factory - NOT in adapters layer)
  GitHubProviderAdapter.Default,
  ProviderFactoryService.Default,

  // Application services
  GitCommandService.Default,
  RepositoryService.Default,
  CommitGraphService.Default,
  SyncService.Default,

  // ... other layers
)
```

**CRITICAL: Why ProviderFactoryService not in SourceControlAdaptersLayer?**

Provider adapters are handled differently:

1. **SourceControlAdaptersLayer** contains ONLY infrastructure adapters (Git, FileSystem)
2. **Provider adapters** (GitHub, GitLab) are composed separately via `ProviderFactoryService`
3. This separation matches the AI/VCS pattern where adapters are in their own layer
4. Future: Create `SourceControlProvidersAdaptersLayer` for consistency

---

## Comparison with Other Domains

### Pattern Matrix

| Domain | Infrastructure | Providers | Registry/Factory | Layer Composition |
|--------|---------------|-----------|------------------|-------------------|
| **AI** | Shared (CoreInfrastructureLayer) | Multiple (OpenAI, Claude) | ✅ AiProviderRegistryService (tags) | AiAdaptersLayer |
| **VCS** | Shared (CoreInfrastructureLayer) | Multiple (GitHub, GitLab) | ✅ VcsProviderRegistryService (tags) | VcsAdaptersLayer |
| **AI Watchers** | Single (ProcessMonitor, Tmux) | N/A | ❌ No registry | WatcherAdaptersLayer |
| **Source Control** | Single (Git, FileSystem) | Multiple (GitHub, GitLab) | ✅ ProviderFactoryService (map) | SourceControlAdaptersLayer |

### Key Differences

**Source Control is HYBRID:**
- Infrastructure adapters: Single implementation (like AI Watchers)
- Provider adapters: Multiple implementations (like AI/VCS)
- Factory pattern instead of tags (simpler for fewer providers)

---

## Usage Examples

### Example 1: Discovering Repositories

```typescript
Effect.gen(function* () {
  const repoService = yield* RepositoryService

  const repos = yield* repoService.discoverRepositories([
    '/home/user/workspace'
  ])

  console.log(`Found ${repos.length} repositories`)
}).pipe(Effect.provide(MainLayer))
```

### Example 2: Working with Multiple Providers

```typescript
Effect.gen(function* () {
  const factory = yield* ProviderFactoryService
  const syncService = yield* SyncService

  // Get GitHub provider
  const github = yield* factory.getProvider('github')
  const githubRepos = yield* github.listRepositories(githubAccountId)

  // Future: Get GitLab provider
  // const gitlab = yield* factory.getProvider('gitlab')
  // const gitlabRepos = yield* gitlab.listRepositories(gitlabAccountId)

  // Sync with provider
  yield* syncService.syncWithProvider('/path/to/repo', 'github')
}).pipe(Effect.provide(MainLayer))
```

### Example 3: Hot-Swapping Infrastructure for Tests

```typescript
// Create a mock git runner that returns predetermined results
const MockGitRunner = Layer.succeed(
  NodeGitCommandRunner,
  {
    execute: (request) => Effect.gen(function* () {
      return {
        request,
        events: Stream.empty,
        awaitResult: Effect.succeed({
          commandId: request.id,
          exitCode: 0,
          status: 'success',
          stdout: 'mock output',
        }),
        terminate: Effect.void
      }
    })
  }
)

// Use in test
const TestLayer = Layer.mergeAll(
  MockGitRunner,
  NodeFileSystemAdapter.Default,  // Use real file system
  RepositoryService.Default
)

test('repository service discovers repos', async () => {
  const program = Effect.gen(function* () {
    const service = yield* RepositoryService
    const repos = yield* service.discoverRepositories(['/test'])
    expect(repos).toHaveLength(2)
  })

  await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
})
```

---

## Benefits Achieved

### 1. Hot-Swappable Infrastructure

Git and FileSystem implementations can be replaced:
- **Testing**: Use in-memory implementations
- **Platform**: Swap Node.js for browser-compatible alternatives
- **Performance**: Use libgit2 instead of child_process

### 2. Multi-Provider Support

Multiple source control providers can operate simultaneously:
- GitHub + GitLab + Bitbucket
- Each with independent authentication
- Factory pattern for clean provider selection

### 3. Clear Separation of Concerns

```
┌─────────────────┐
│  ProviderPort   │  ← Contract (what)
└─────────────────┘
        ↑
        │ implements
        │
┌─────────────────┐
│  GitHub/GitLab  │  ← Implementation (how)
│    Adapters     │
└─────────────────┘
        ↑
        │ uses
        │
┌─────────────────┐
│   SyncService   │  ← Business Logic (why)
└─────────────────┘
```

### 4. Type Safety

All operations are fully typed:
- Input/output types enforced by Effect Schema
- Error types tracked in Effect's error channel
- Context requirements explicit in type signatures

### 5. Testability

Each layer can be tested in isolation:
- **Unit tests**: Mock individual adapter methods
- **Integration tests**: Replace entire adapter layer
- **E2E tests**: Use real adapters with test repos

---

## Migration History

### Before (Monolithic)

```typescript
// Everything in one service
export class GitCommandService {
  // Directly calls child_process
  executeGitCommand(args: string[]) {
    return spawn('git', args)
  }

  // Directly calls fs
  findRepositories(path: string) {
    return fs.readdir(path)
  }

  // Tightly coupled to GitHub
  syncWithGitHub(repo: string) {
    return githubApi.sync(repo)
  }
}
```

**Problems:**
- ❌ Can't swap implementations
- ❌ Can't test in isolation
- ❌ Hard to add new providers
- ❌ Mixed concerns (git, fs, providers)

### After (Hexagonal)

```typescript
// Infrastructure adapters
export const SourceControlAdaptersLayer = Layer.mergeAll(
  NodeGitCommandRunner.Default,    // Swappable
  NodeFileSystemAdapter.Default    // Swappable
)

// Provider adapters
export class GitHubProviderAdapter implements ProviderPort {
  // Provider-specific logic
}

export class GitLabProviderAdapter implements ProviderPort {
  // Provider-specific logic
}

// Application service
export class RepositoryService {
  constructor(
    gitRunner: NodeGitCommandRunner,      // Port dependency
    fileSystem: NodeFileSystemAdapter,    // Port dependency
    factory: ProviderFactoryService       // Port dependency
  ) {
    // Orchestrate using ports
  }
}
```

**Benefits:**
- ✅ Hot-swappable adapters
- ✅ Isolated testing
- ✅ Easy provider addition
- ✅ Clear separation of concerns

---

## Future Enhancements

### 1. Complete Provider Abstraction

Create a dedicated layer for provider adapters:

```typescript
// src/main/source-control/providers-adapters-layer.ts
export const SourceControlProvidersAdaptersLayer = Layer.mergeAll(
  GitHubProviderAdapter.Default,
  GitLabProviderAdapter.Default,
  BitbucketProviderAdapter.Default
)
```

### 2. Migrate to Tag-Based Registry

For consistency with AI/VCS, migrate to tag-based provider lookup:

```typescript
const ProviderTags = {
  github: Context.Tag<ProviderPort>('SourceControlProvider:github'),
  gitlab: Context.Tag<ProviderPort>('SourceControlProvider:gitlab'),
  bitbucket: Context.Tag<ProviderPort>('SourceControlProvider:bitbucket'),
}
```

### 3. Add More Infrastructure Adapters

```typescript
// Alternative Git implementations
export const LibGit2Runner = Layer.effect(...)  // Native bindings
export const JGitRunner = Layer.effect(...)     // Pure JS

// Alternative FileSystem implementations
export const MemoryFsAdapter = Layer.effect(...) // Testing
export const BrowserFsAdapter = Layer.effect(...) // Browser compatibility
```

### 4. Complete Domain Model

Fully implement DDD patterns:
- Aggregates with business logic
- Domain events for state changes
- Value objects for type safety
- Domain services for complex operations

---

## Key Learnings

1. **Hybrid Pattern Works**: Single implementation for infrastructure, multiple for providers
2. **Factory is Simpler**: For fewer providers, factory pattern beats tag registry
3. **Layer Separation is Critical**: Infrastructure adapters separate from providers
4. **Effect Services Enable Hot-Swapping**: Service injection enables runtime flexibility
5. **Ports Define Contracts**: Clear boundaries prevent coupling
6. **Testing Becomes Trivial**: Mock entire layers without touching production code

---

## Related Documentation

- [AI Adapters Hexagonal Architecture](./AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md) - Multiple implementation pattern with tags
- [AI Watchers Lifecycle](./AI_WATCHERS_LIFECYCLE.md) - Single implementation pattern
- [VCS Provider Lifecycle](./VCS_PROVIDER_LIFECYCLE.md) - Multiple implementation pattern with tags
- [Effect Ports Migration Guide](./effect_ports_migration_guide.md) - General ports pattern guide

---

**Author:** AI Assistant
**Reviewer:** Ken Udovic
**Date:** 2025-10-26
