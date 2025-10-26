# Git Tree Reimplementation - Progress Tracker

> **Important Update**: The Git Tree implementation is now part of a comprehensive source-control domain architecture.
>
> See the new implementation plan:
> - [`source-control-hexagonal-architecture.md`](./source-control-hexagonal-architecture.md) - Complete architecture
> - [`source-control-implementation-roadmap.md`](./source-control-implementation-roadmap.md) - Week-by-week implementation guide
>
> This progress tracker has been updated to reflect the new unified approach.

## Overview
This document tracks the implementation progress of the Git Tree feature for Geppetto, now integrated into the broader source-control domain. The implementation follows a hexagonal architecture pattern with clear separation between domain logic, ports, adapters, and services.

---

## New Implementation Timeline (4 Weeks)

### Week 1: Domain Foundation & Core Ports ✅ IN PROGRESS

#### Day 1-2: Domain Model Setup ✅ COMPLETED
- [x] Create domain aggregates (Repository, CommitGraph, WorkingTree)
- [x] Define value objects (CommitHash, BranchName, FileStatus, RemoteUrl)
- [x] Establish domain events (RepositoryDiscovered, StateChanged, etc.)
- [x] Create entity schemas (Commit, Branch, Remote)

**Files Created:**
- `src/main/source-control/domain/value-objects/commit-hash.ts` - CommitHash value object with validation
- `src/main/source-control/domain/value-objects/branch-name.ts` - BranchName value object with Git ref validation
- `src/main/source-control/domain/value-objects/file-status.ts` - FileStatus enum and FileStatusCode class
- `src/main/source-control/domain/value-objects/remote-url.ts` - RemoteUrl value object with protocol parsing
- `src/main/source-control/domain/entities/commit.ts` - Commit entity with author info and message
- `src/main/source-control/domain/entities/branch.ts` - Branch entity with tracking and state
- `src/main/source-control/domain/entities/remote.ts` - Remote entity with fetch/push URLs
- `src/main/source-control/domain/aggregates/repository.ts` - Repository aggregate root
- `src/main/source-control/domain/aggregates/commit-graph.ts` - CommitGraph aggregate for visualization
- `src/main/source-control/domain/aggregates/working-tree.ts` - WorkingTree aggregate for status tracking
- `src/main/source-control/domain/events/repository-events.ts` - Comprehensive domain events

**Completion Date:** 2025-10-26

#### Day 3-4: Port Definitions ✅ COMPLETED
- [x] Define primary ports (RepositoryManagementPort, CommitOperationsPort, BranchOperationsPort, WorkingTreePort)
- [x] Define secondary ports (FileSystemPort, ProviderPort)
- [x] Existing: GitCommandRunnerPort (already implemented in ports.ts)

**Files Created:**
- `src/main/source-control/ports/secondary/file-system-port.ts` - File system operations port
- `src/main/source-control/ports/secondary/provider-port.ts` - Provider (GitHub/GitLab) integration port
- `src/main/source-control/ports/primary/repository-management-port.ts` - Repository discovery and management
- `src/main/source-control/ports/primary/commit-operations-port.ts` - Commit graph and commit operations
- `src/main/source-control/ports/primary/branch-operations-port.ts` - Branch management and merge/rebase
- `src/main/source-control/ports/primary/working-tree-port.ts` - Working tree status, staging, conflicts

**Note:** GitCommandRunnerPort already exists in `src/main/source-control/ports.ts` as the git executor port.

**Completion Date:** 2025-10-26

#### Day 5: Infrastructure Refactoring
- [ ] Refactor existing NodeGitCommandRunner to implement GitExecutorPort
- [ ] Create adapter wrapper for backward compatibility

### Week 2: Application Services & Basic Features ✅ COMPLETED

#### Day 6-7: Repository Service ✅ COMPLETED
- [x] Implement RepositoryService with discovery and caching
- [x] Add repository state management

**Files Created:**
- `src/main/source-control/services/repository-service.ts` - RepositoryManagementPort implementation with Ref-based caching
- Features: Repository discovery, state management, branch/remote listing, metadata retrieval

**Completion Date:** 2025-10-26

#### Day 8-9: Commit Graph Service ✅ COMPLETED
- [x] Implement CommitGraphService with graph building
- [x] Add graph caching and incremental updates

**Files Created:**
- `src/main/source-control/services/commit-graph-service.ts` - CommitOperationsPort implementation with graph building
- Features: Commit graph building with DAG construction, git log parsing, commit operations, Ref-based graph caching

**Completion Date:** 2025-10-26

#### Day 10: File System Adapter ✅ COMPLETED
- [x] Create NodeFileSystemAdapter for repository discovery
- [x] Implement directory watching for auto-refresh

**Files Created:**
- `src/main/source-control/adapters/file-system/node-file-system-adapter.ts` - FileSystemPort implementation using Node.js fs and chokidar
- Features: Recursive repository discovery, directory watching with chokidar, file operations

**Completion Date:** 2025-10-26

### Week 3: IPC Integration & Provider Abstraction ⏳ IN PROGRESS

#### Day 11-12: IPC Contracts & Handlers ✅ COMPLETED
- [x] Define SourceControlIpcContracts
- [x] Create IPC handlers using registerIpcHandler pattern
- [x] Map source control domain errors to IPC errors

**Files Created:**
- `src/shared/schemas/source-control/repository.ts` - IPC-safe repository schemas
- `src/shared/schemas/source-control/commit-graph.ts` - IPC-safe commit graph schemas
- `src/shared/schemas/source-control/working-tree.ts` - IPC-safe working tree schemas
- `src/shared/schemas/source-control/source-control-schemas.ts` - Schema exports
- `src/shared/schemas/source-control/errors.ts` - Source control error schemas

**Files Modified:**
- `src/shared/ipc-contracts.ts` - Added SourceControlIpcContracts with 19 contract definitions
- `src/main/ipc/error-mapper.ts` - Added source control domain error mapping

**Files Created:**
- `src/main/ipc/source-control-handlers.ts` - Type-safe IPC handlers with automatic validation
- Features: 19 IPC handlers for repository, commit graph, and working tree operations

**Completion Date:** 2025-10-26

#### Day 13-14: Provider Port Abstraction ✅ COMPLETED
- [x] Create ProviderPort interface (already completed in Day 3-4)
- [x] Wrap existing GitHub service as provider adapter
- [x] Create ProviderFactory for multi-provider management

**Files Created:**
- `src/main/source-control/adapters/providers/github-provider-adapter.ts` - GitHub provider adapter wrapping GitHubApiService
- `src/main/source-control/adapters/providers/provider-factory-service.ts` - ProviderFactory implementation for managing providers
- `src/main/source-control/adapters/providers/index.ts` - Provider adapter exports

**Features:**
- GitHub provider adapter implementing ProviderPort interface
- Automatic conversion between GitHub domain types and ProviderPort types
- Error mapping from GitHub errors to ProviderPort errors
- Provider factory with lazy initialization and caching
- Extensible architecture for GitLab, Bitbucket support

**Completion Date:** 2025-10-26

#### Day 15: Sync Service ✅ COMPLETED
- [x] Implement SyncService for remote operations
- [x] Integrate with provider adapters

**Files Created:**
- `src/main/source-control/services/sync-service.ts` - SyncService for remote synchronization operations

**Features:**
- Fetch operations (single remote, all remotes)
- Pull operations (with rebase, fast-forward options)
- Push operations (with force, set-upstream, tags options)
- Provider sync: sync local repository with provider metadata
- Tracking status: check ahead/behind status with remote
- Integration with GitCommandRunnerPort and ProviderFactory
- Comprehensive error handling with typed errors

**Completion Date:** 2025-10-26

### Week 4: UI Integration & Testing ⏳ IN PROGRESS

#### Day 16-17: Renderer Client & Atoms ✅ COMPLETED
- [x] Create SourceControlClient service
- [x] Build reactive atoms for repositories, graphs, and status
- [x] Create custom React hooks

**Files Created:**
- `src/renderer/lib/source-control-client.ts` - Type-safe renderer client for source control IPC operations
- `src/renderer/atoms/source-control-atoms.ts` - Reactive state atoms for source control data
- `src/renderer/hooks/useSourceControl.ts` - Custom React hooks for source control operations

**Features:**
- **SourceControlClient**: 19 type-safe methods wrapping IPC contracts
  - Repository management (discover, get, refresh, validate, metadata, forget)
  - Commit graph operations (build, statistics, get commit, history)
  - Working tree operations (status, stage, unstage, discard, diff, stash)
- **Atoms**: 20+ reactive atoms with automatic caching and invalidation
  - Repository atoms (all, by path, by ID, metadata)
  - Commit graph atoms (graph, statistics, commits, history)
  - Working tree atoms (status, summary, stashes)
  - Mutation atoms (refresh, stage, unstage, discard, stash operations)
  - Reactivity keys for cache invalidation
  - TTL-based caching (5s-10min depending on data type)
- **Custom Hooks**: 20+ React hooks following Result.builder pattern
  - All hooks return full Results for exhaustive error handling
  - Convenience properties for common use cases
  - Computed loading states
  - Refresh functions for manual cache invalidation

**Completion Date:** 2025-10-26

#### Day 18-19: UI Components
- [ ] Build RepositoryExplorer component
- [ ] Create CommitGraph visualization (Canvas-based)
- [ ] Implement BranchList and StatusBar

#### Day 20: Testing Setup
- [ ] Unit tests for services with mock ports
- [ ] Integration tests for adapters
- [ ] Contract tests for IPC

---

## Legacy Phase Structure (For Reference)

### 1.1 Core Ports (Hexagonal Architecture) ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/ports/git-operations-port.ts` - Port for Git command execution
- `src/main/git-tree/ports/git-repository-port.ts` - Port for repository-level operations
- `src/main/git-tree/ports/graph-builder-port.ts` - Port for commit graph construction

**Planned Implementation:**
- Define port interfaces for all external Git interactions
- Separate command execution from business logic
- Enable testability via port mocking

### 1.2 Domain Schemas ⏳
**Status:** Not Started

**Planned Files:**
- `src/shared/schemas/git-tree/commit.ts` - Commit, CommitDetails, CommitGraph schemas
- `src/shared/schemas/git-tree/branch.ts` - Branch, BranchRef schemas
- `src/shared/schemas/git-tree/repository.ts` - Repository, RepoConfig, RepoState schemas
- `src/shared/schemas/git-tree/reference.ts` - Tag, Remote, RefLabel schemas
- `src/shared/schemas/git-tree/errors.ts` - IPC-safe error schemas

**Planned Implementation:**
- Effect Schema-based validation for all domain types
- Parse, don't validate pattern throughout
- Type-safe serialization across IPC boundary

### 1.3 Domain Errors ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/errors.ts` - Domain-specific error classes

**Planned Implementation:**
- `Data.TaggedError` pattern for all errors
- Git-specific error types: GitCommandError, GitNotFoundError, GitParseError
- Repository-specific errors: RepoNotFoundError, InvalidRepoError
- Graph-specific errors: GraphBuildError, CommitNotFoundError

---

## Phase 2: Git Adapter Layer ⏳ NOT STARTED

### 2.1 Git Command Executor (Adapter) ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/adapters/git-command-executor.ts` - Executes Git commands via child_process
- `src/main/git-tree/adapters/git-parser.ts` - Parses Git command output

**Planned Implementation:**
- Effect-based command execution (no try/catch)
- Stream-based output handling for large repos
- Timeout and cancellation support
- Parse Git output into domain schemas

### 2.2 Repository Adapter ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/adapters/repository-adapter.ts` - Implements GitRepositoryPort

**Planned Implementation:**
- Repository discovery and validation
- Multi-repository management
- File watching for repository changes

---

## Phase 3: Service Layer (Business Logic) ⏳ NOT STARTED

### 3.1 Commit Graph Service ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/services/commit-graph-service.ts` - Builds and manages commit graphs

**Planned Implementation:**
- Graph construction algorithm with Effect.gen
- Parent-child relationship tracking
- Branch/tag/remote annotation
- Uncommitted changes detection
- Incremental graph updates

### 3.2 Repository Service ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/services/repository-service.ts` - High-level repository operations

**Planned Implementation:**
- Repository info aggregation
- Branch/tag/remote management
- Config retrieval
- Stash management

### 3.3 Git Operations Service ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/services/git-operations-service.ts` - Git commands (checkout, merge, etc.)

**Planned Implementation:**
- Branch operations (create, delete, checkout, rename)
- Merge/rebase operations
- Commit operations (cherry-pick, revert, reset)
- Tag operations
- Remote operations (fetch, pull, push)

---

## Phase 4: IPC Integration ⏳ NOT STARTED

### 4.1 IPC Contracts ⏳
**Status:** Not Started

**Planned Files:**
- Update `src/shared/ipc-contracts.ts` with GitTreeIpcContracts

**Planned Contracts:**
- Repository operations: `listRepositories`, `getRepoInfo`, `getRepoConfig`
- Commit operations: `getCommits`, `getCommitDetails`, `getCommitFiles`
- Branch operations: `getBranches`, `createBranch`, `deleteBranch`, `checkoutBranch`
- Graph operations: `getCommitGraph`, `getGraphMetadata`
- Git operations: `merge`, `rebase`, `cherryPick`, `revert`, `reset`

### 4.2 IPC Handlers ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/ipc/git-tree-handlers.ts` - Type-safe IPC handlers

**Planned Implementation:**
- Use `registerIpcHandler` utility pattern
- Automatic error mapping via `mapDomainErrorToIpcError`
- Full end-to-end type safety

### 4.3 Error Mapper Extension ⏳
**Status:** Not Started

**Planned Files:**
- Update `src/main/ipc/error-mapper.ts` with Git Tree error mapping

**Planned Implementation:**
- Map GitCommandError → IPC errors
- Map RepoNotFoundError → NotFoundError
- Map GraphBuildError → ProcessError
- Type-safe error transformation

---

## Phase 5: Renderer Integration ⏳ NOT STARTED

### 5.1 IPC Client ⏳
**Status:** Not Started

**Planned Files:**
- Update `src/renderer/lib/ipc-client.ts` with GitTreeClient service

**Planned Implementation:**
- Effect.Service pattern for Git Tree operations
- Type-safe wrapper for all IPC calls
- Depends on ElectronIpcClient

### 5.2 Atoms (Reactive State) ⏳
**Status:** Not Started

**Planned Files:**
- `src/renderer/atoms/git-tree-atoms.ts` - Git Tree reactive state atoms

**Planned Atoms:**
- **Data Atoms:**
  - `repositoriesAtom` - List of repositories
  - `repoInfoAtom` - Repository info by path (family)
  - `commitGraphAtom` - Commit graph by repo (family)
  - `commitDetailsAtom` - Commit details by hash (family)
  - `branchesAtom` - Branches by repo (family)
- **Action Atoms:**
  - `createBranchAtom` - Create branch mutation
  - `checkoutBranchAtom` - Checkout branch mutation
  - `mergeAtom` - Merge mutation
  - `cherryPickAtom` - Cherry-pick mutation

### 5.3 Custom Hooks ⏳
**Status:** Not Started

**Planned Files:**
- `src/renderer/hooks/useGitTree.ts` - Custom React hooks

**Planned Hooks:**
- `useRepositories()` - Repository list management
- `useRepository(path)` - Single repository details
- `useCommitGraph(repoPath)` - Commit graph with refresh
- `useCommitDetails(repoPath, hash)` - Commit details
- `useBranches(repoPath)` - Branch list with actions

---

## Phase 6: Graph Visualization (UI) ⏳ NOT STARTED

### 6.1 Graph Renderer ⏳
**Status:** Not Started

**Planned Files:**
- `src/renderer/components/git-tree/GraphCanvas.tsx` - Canvas-based graph renderer
- `src/renderer/components/git-tree/GraphNode.tsx` - Commit node component
- `src/renderer/components/git-tree/GraphEdge.tsx` - Commit edge component

**Planned Implementation:**
- HTML Canvas or SVG-based rendering
- Virtual scrolling for large repos
- Interactive node selection
- Branch/tag label rendering
- Zoom and pan support

### 6.2 Commit Details Panel ⏳
**Status:** Not Started

**Planned Files:**
- `src/renderer/components/git-tree/CommitDetailsPanel.tsx` - Commit details view
- `src/renderer/components/git-tree/CommitFileList.tsx` - File changes list
- `src/renderer/components/git-tree/CommitDiff.tsx` - File diff viewer

**Planned Implementation:**
- Result.builder pattern for error handling
- File tree view with collapse/expand
- Inline diff viewer
- Copy commit hash/message

### 6.3 Repository Browser ⏳
**Status:** Not Started

**Planned Files:**
- `src/renderer/components/git-tree/RepositoryBrowser.tsx` - Main Git Tree view
- `src/renderer/components/git-tree/BranchList.tsx` - Branch sidebar
- `src/renderer/components/git-tree/ControlBar.tsx` - Toolbar with actions

**Planned Implementation:**
- Split-pane layout (graph + details)
- Branch filter and search
- Action buttons (merge, rebase, etc.)
- Repository dropdown for multi-repo

---

## Phase 7: Advanced Features ⏳ NOT STARTED

### 7.1 File Watching ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/services/repo-file-watcher.ts` - Watch .git directory for changes

**Planned Implementation:**
- Use Node's fs.watch with Effect
- Debounced change notifications
- Automatic graph refresh on Git operations

### 7.2 Diff Provider ⏳
**Status:** Not Started

**Planned Files:**
- `src/main/git-tree/services/diff-provider-service.ts` - Provides file content at revisions

**Planned Implementation:**
- Custom URI scheme for diffs
- TextDocumentContentProvider pattern
- Integration with VS Code diff view

### 7.3 Performance Optimizations ⏳
**Status:** Not Started

**Planned Optimizations:**
- Streaming commit parsing with Effect Stream
- Incremental graph updates (not full rebuild)
- Web worker for graph layout computation
- Virtual scrolling for large commit lists
- Memoization of graph layout

---

## Phase 8: Testing ⏳ NOT STARTED

### 8.1 Unit Tests ⏳
**Status:** Not Started

**Planned Tests:**
- Git parser tests with sample Git output
- Graph builder tests with mock commits
- Service layer tests with mock ports
- Error handling tests

### 8.2 Integration Tests ⏳
**Status:** Not Started

**Planned Tests:**
- Full IPC flow tests (main → renderer)
- Git command execution tests (real Git repos)
- Multi-repository tests
- File watcher tests

---

## Current Status Summary

**Overall Progress:** 80% (16/20 days completed across Week 1-4)

**Week 1-3 Complete! ✅**

**Completed:**
- ✅ Week 1, Day 1-2: Domain Model Setup (All value objects, entities, aggregates, and events)
- ✅ Week 1, Day 3-4: Port Definitions (All primary and secondary ports)
- ✅ Week 2, Day 6-7: Repository Service (RepositoryManagementPort implementation with caching)
- ✅ Week 2, Day 8-9: Commit Graph Service (CommitOperationsPort with DAG graph building)
- ✅ Week 2, Day 10: File System Adapter (NodeFileSystemAdapter with directory watching)
- ✅ Week 3, Day 11-12: IPC Contracts & Handlers (SourceControlIpcContracts + 19 handlers + error mapping)
- ✅ Week 3, Day 13-14: Provider Port Abstraction (GitHub adapter + ProviderFactory)
- ✅ Week 3, Day 15: Sync Service (Remote operations + provider sync)
- ✅ Week 4, Day 16-17: Renderer Client & Atoms (Client, atoms, hooks)

**In Progress:**
- ⏳ Week 4, Day 18-19: UI Components (Next up)

**Not Started:**
- Week 1, Day 5: Infrastructure Refactoring (NodeGitCommandRunner wrapper - optional, can be skipped)
- Week 4, Day 20: Testing Setup

**Blocked:** None

**Notes:**
- Week 1, 2, and 3 core implementation complete
- Backend services and IPC layer fully functional
- Frontend integration in progress (Client, atoms, hooks complete)
- Ready for UI components implementation

---

## Success Metrics (from plan)

- [ ] **Repository Discovery:** Automatically discover all Git repositories in workspace
- [ ] **Graph Rendering:** Display commit graph with branches/tags for repos with 1000+ commits
- [ ] **Performance:** Graph updates complete in <500ms for typical repos
- [ ] **Type Safety:** Zero `any` types, full Effect pattern usage
- [ ] **Error Handling:** <5% defect rate, all errors typed and handled
- [ ] **Git Operations:** All basic operations work (checkout, merge, rebase, cherry-pick)
- [ ] **Multi-Repo:** Support multiple repositories simultaneously
- [ ] **Real-time Updates:** Graph updates automatically on Git operations

---

## Next Steps

1. **Phase 1.1:** Define core ports (GitOperationsPort, GitRepositoryPort, GraphBuilderPort)
2. **Phase 1.2:** Create domain schemas with Effect Schema
3. **Phase 1.3:** Implement domain error classes
4. **Phase 2:** Build Git adapter layer (command executor, parser)
5. **Phase 3:** Implement service layer business logic
6. **Phase 4:** IPC integration with type-safe contracts
7. **Phase 5:** Renderer integration with atoms and hooks
8. **Phase 6:** UI implementation with graph visualization

---

## Implementation Notes

### Hexagonal Architecture Principles
- **Ports** define interfaces for external interactions (Git, file system, IPC)
- **Adapters** implement ports (GitCommandExecutor, RepositoryAdapter)
- **Domain** contains pure business logic (CommitGraph, Repository aggregates)
- **Services** orchestrate domain logic using ports

### Effect Patterns to Follow
- ✅ Use `Effect.gen` for all async flows
- ✅ Use `Effect.Service` pattern for dependency injection
- ✅ Use `Stream` for large data processing (commit parsing)
- ✅ Use `Ref` for mutable state within services
- ✅ Use `Scope` and `Effect.forkScoped` for resource management
- ✅ Use Effect Schema for parsing (not validation)
- ✅ Never use `try/catch`, always Effect error channels

### Structured Concurrency
- ✅ Use `Effect.forkScoped` not `Effect.forkDaemon`
- ✅ Tie all background work to scopes
- ✅ Use `Scope.close` for automatic cleanup
- ✅ Use `Stream.unwrapScoped` for scoped streams

### Type Safety
- ❌ NO `any` types anywhere
- ❌ NO `unknown` except at IPC boundaries
- ✅ Use `S.Schema.Type<typeof Schema>` to extract types
- ✅ Use proper double assertion when TypeScript can't infer
- ✅ All IPC contracts validated with Effect Schema

---

## Architecture Decisions

**Why Hexagonal Architecture?**
- Clear separation between domain logic and Git implementation
- Easy to test domain logic without real Git
- Can swap Git implementation (e.g., use libgit2 in future)
- Ports make external dependencies explicit

**Why Effect Streams for Git Output?**
- Git log output can be huge (10k+ commits)
- Streaming allows incremental processing
- Backpressure prevents memory issues
- Composable with other Effect operators

**Why Canvas for Graph Rendering?**
- Better performance than DOM for large graphs
- Smooth zooming and panning
- Custom rendering logic for complex layouts
- Can render 1000+ commits smoothly

**Why Atoms Instead of React Query?**
- Consistent with existing Geppetto architecture
- Better integration with Effect runtime
- Fine-grained reactivity
- TTL caching built-in

---

## Key Challenges

1. **Graph Layout Algorithm** - Determining x/y positions for commits is complex
2. **Performance** - Large repos (10k+ commits) need optimization
3. **Git Command Parsing** - Git output format varies by version
4. **Concurrency** - Multiple Git operations must not conflict
5. **UI Responsiveness** - Graph rendering must not block UI thread

---

## References

- Git Graph Extension (original): https://github.com/mhutchie/vscode-git-graph
- Effect Documentation: https://effect.website
- Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/
- Git Log Format: https://git-scm.com/docs/git-log
- Effect Schema: https://effect.website/docs/schema/introduction
