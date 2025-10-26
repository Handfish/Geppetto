# Git Tree Reimplementation Plan

> **Note**: This plan has been superseded by a more comprehensive source-control domain architecture. See:
> - [`source-control-hexagonal-architecture.md`](./source-control-hexagonal-architecture.md) for the complete architectural design
> - [`source-control-implementation-roadmap.md`](./source-control-implementation-roadmap.md) for the implementation timeline
>
> The Git Tree visualization features described in this document are now integrated as part of the broader source-control domain, specifically in the **CommitGraphService** and UI components.

## Executive Summary

This plan outlines the reimplementation of Git Tree (based on vscode-git-graph) as a native feature in Geppetto, following **hexagonal architecture** (ports & adapters), Effect-TS patterns, and structured concurrency principles. The implementation will provide a visual Git commit graph with full Git operations support, multi-repository management, and seamless integration with Geppetto's existing architecture.

**Update**: Git Tree is now part of the unified source-control domain architecture that includes:
- Local git operations via `GitExecutorPort`
- Online provider integration via `ProviderPort`
- Repository discovery and management via `RepositoryService`
- Commit graph visualization via `CommitGraphService`

## Architecture Overview

### Migration to Unified Source Control Architecture

The Git Tree components from this plan now map to the unified architecture as follows:

| Original Git Tree Component | New Source Control Location |
|---------------------------|---------------------------|
| `git-tree/ports/git-operations-port.ts` | `source-control/ports/secondary/git-executor-port.ts` |
| `git-tree/ports/git-repository-port.ts` | `source-control/ports/secondary/file-system-port.ts` |
| `git-tree/ports/graph-builder-port.ts` | `source-control/domain/services/commit-graph-builder.ts` |
| `git-tree/services/commit-graph-service.ts` | `source-control/services/commit-graph-service.ts` |
| `git-tree/services/repository-service.ts` | `source-control/services/repository-service.ts` |
| `git-tree/services/git-operations-service.ts` | `source-control/services/git-workflow-service.ts` |
| `git-tree/adapters/git-command-executor.ts` | `source-control/adapters/git/node-git-executor.ts` |
| Git Tree UI Components | `renderer/components/source-control/CommitGraph.tsx` |

### Hexagonal Architecture (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────┐
│                         Renderer (UI)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  React Components (Graph, CommitDetails, BranchList)   │ │
│  │  Atoms (repositoriesAtom, commitGraphAtom, etc.)       │ │
│  │  Hooks (useRepositories, useCommitGraph, etc.)         │ │
│  └─────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ IPC (Type-safe contracts)
┌────────────────────────┼────────────────────────────────────┐
│                  Main Process (Services)                     │
│  ┌─────────────────────┴──────────────────────────────────┐ │
│  │            Service Layer (Business Logic)               │ │
│  │  • CommitGraphService (graph building)                  │ │
│  │  • RepositoryService (repo operations)                  │ │
│  │  • GitOperationsService (git commands)                  │ │
│  └──────────────┬──────────────────────┬──────────────────┘ │
│                 │ Ports (Interfaces)   │                     │
│  ┌──────────────┴──────────┐  ┌───────┴─────────────────┐  │
│  │  GitOperationsPort       │  │  GitRepositoryPort      │  │
│  │  (executeCommand)        │  │  (discoverRepos)        │  │
│  └──────────────┬───────────┘  └───────┬─────────────────┘  │
│                 │ Adapters             │                     │
│  ┌──────────────┴──────────┐  ┌───────┴─────────────────┐  │
│  │  GitCommandExecutor      │  │  RepositoryAdapter      │  │
│  │  (child_process + parse) │  │  (fs watching)          │  │
│  └──────────────────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │   Git Executable  │
              │   (git CLI)       │
              └──────────────────┘
```

### Core Concepts

**Ports** - Define interfaces for external interactions:
- `GitOperationsPort` - Executes Git commands
- `GitRepositoryPort` - Repository discovery and watching
- `GraphBuilderPort` - Commit graph construction

**Adapters** - Implement ports:
- `GitCommandExecutor` - Executes Git CLI commands via `child_process`
- `RepositoryAdapter` - Discovers repos and watches for changes
- `GitParser` - Parses Git command output into domain schemas

**Domain** - Pure business logic:
- `CommitGraph` aggregate - Represents commit DAG
- `Repository` aggregate - Repository state and config
- Domain events for state changes

**Services** - Orchestrate domain logic using ports:
- `CommitGraphService` - Builds and manages graphs
- `RepositoryService` - High-level repo operations
- `GitOperationsService` - Git commands (merge, rebase, etc.)

---

## Phase 1: Foundation - Git Domain Layer

### 1.1 Core Ports (Hexagonal Architecture)

**Files to create:**
```
src/main/git-tree/
├── ports/
│   ├── git-operations-port.ts      # Port for Git command execution
│   ├── git-repository-port.ts      # Port for repository operations
│   └── graph-builder-port.ts       # Port for graph construction
```

**Port definitions:**

**File: src/main/git-tree/ports/git-operations-port.ts**
```typescript
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { GitCommand, GitCommandOutput } from '../schemas'

/**
 * Port for executing Git commands.
 * This abstracts the actual Git execution mechanism.
 */
export interface GitOperationsPort {
  /**
   * Execute a Git command and return its output.
   * @param repoPath The path to the repository
   * @param command The Git command to execute
   * @returns Effect with parsed output or GitCommandError
   */
  executeCommand<T>(
    repoPath: string,
    command: GitCommand,
    outputSchema: S.Schema<T>
  ): Effect.Effect<T, GitCommandError>

  /**
   * Execute a Git command and stream its output line by line.
   * Useful for large outputs (e.g., git log with 10k commits).
   * @param repoPath The path to the repository
   * @param command The Git command to execute
   * @returns Stream of parsed output lines
   */
  streamCommand<T>(
    repoPath: string,
    command: GitCommand,
    lineSchema: S.Schema<T>
  ): Stream.Stream<T, GitCommandError>
}
```

**File: src/main/git-tree/ports/git-repository-port.ts**
```typescript
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { Repository, RepositoryEvent } from '../schemas'

/**
 * Port for repository-level operations.
 */
export interface GitRepositoryPort {
  /**
   * Discover all Git repositories in the workspace.
   * @returns Effect with array of discovered repositories
   */
  discoverRepositories(): Effect.Effect<Repository[], RepositoryDiscoveryError>

  /**
   * Validate that a path is a valid Git repository.
   * @param path The path to validate
   * @returns Effect with validated Repository or error
   */
  validateRepository(path: string): Effect.Effect<Repository, InvalidRepositoryError>

  /**
   * Watch a repository for changes (.git directory).
   * @param repoPath The repository to watch
   * @returns Stream of repository events (file changes, ref updates)
   */
  watchRepository(repoPath: string): Stream.Stream<RepositoryEvent, RepositoryWatchError>
}
```

**File: src/main/git-tree/ports/graph-builder-port.ts**
```typescript
import * as Effect from 'effect/Effect'
import { Commit, CommitGraph, GraphConfig } from '../schemas'

/**
 * Port for building commit graphs.
 * This allows different graph algorithms or optimizations.
 */
export interface GraphBuilderPort {
  /**
   * Build a commit graph from an array of commits.
   * @param commits The commits to build graph from
   * @param config Graph building configuration
   * @returns Effect with built CommitGraph or error
   */
  buildGraph(
    commits: Commit[],
    config: GraphConfig
  ): Effect.Effect<CommitGraph, GraphBuildError>

  /**
   * Update an existing graph with new commits (incremental).
   * @param graph The existing graph
   * @param newCommits New commits to add
   * @returns Effect with updated graph
   */
  updateGraph(
    graph: CommitGraph,
    newCommits: Commit[]
  ): Effect.Effect<CommitGraph, GraphBuildError>
}
```

### 1.2 Domain Schemas (Parse, Don't Validate)

**Files to create:**
```
src/shared/schemas/git-tree/
├── commit.ts           # Commit, CommitDetails, CommitParent
├── branch.ts           # Branch, BranchRef, BranchConfig
├── repository.ts       # Repository, RepoConfig, RepoState
├── reference.ts        # Tag, Remote, RefLabel, Stash
├── graph.ts            # CommitGraph, GraphNode, GraphEdge
├── errors.ts           # IPC-safe error schemas
└── index.ts            # Re-exports
```

**File: src/shared/schemas/git-tree/commit.ts**
```typescript
import * as S from '@effect/schema/Schema'

/**
 * Represents a Git commit in the graph.
 * Uses Schema.Class for automatic validation and encoding.
 */
export class Commit extends S.Class<Commit>('Commit')({
  hash: S.String.pipe(S.pattern(/^[0-9a-f]{40}$/)), // Full SHA-1
  parents: S.Array(S.String), // Parent commit hashes
  author: S.String,
  authorEmail: S.String,
  authorDate: S.Number, // Unix timestamp
  committer: S.String,
  committerEmail: S.String,
  committerDate: S.Number,
  message: S.String,
  subject: S.String, // First line of message
}) {}

/**
 * Detailed commit information (fetched separately).
 */
export class CommitDetails extends S.Class<CommitDetails>('CommitDetails')({
  commit: Commit,
  files: S.Array(CommitFile),
  stats: CommitStats,
  signature: S.optional(GitSignature),
}) {}

export class CommitFile extends S.Class<CommitFile>('CommitFile')({
  path: S.String,
  oldPath: S.optional(S.String), // For renames
  status: S.Literal('A', 'M', 'D', 'R', 'C', 'U'), // Added, Modified, Deleted, Renamed, Copied, Unmerged
  additions: S.Number,
  deletions: S.Number,
}) {}

export class CommitStats extends S.Class<CommitStats>('CommitStats')({
  filesChanged: S.Number,
  insertions: S.Number,
  deletions: S.Number,
}) {}

export class GitSignature extends S.Class<GitSignature>('GitSignature')({
  status: S.Literal('G', 'B', 'U', 'X', 'Y', 'R', 'E'), // Good, Bad, Unknown, Expired, Expired key, Revoked, Error
  signer: S.optional(S.String),
  key: S.optional(S.String),
}) {}

/**
 * Represents uncommitted changes as a special commit.
 */
export const UNCOMMITTED_HASH = '*UNCOMMITTED*'

export class UncommittedChanges extends S.Class<UncommittedChanges>('UncommittedChanges')({
  hash: S.Literal(UNCOMMITTED_HASH),
  parent: S.String, // HEAD commit hash
  filesChanged: S.Number,
  insertions: S.Number,
  deletions: S.Number,
}) {}
```

**File: src/shared/schemas/git-tree/branch.ts**
```typescript
import * as S from '@effect/schema/Schema'

export class Branch extends S.Class<Branch>('Branch')({
  name: S.String,
  commitHash: S.String,
  isLocal: S.Boolean,
  isRemote: S.Boolean,
  upstream: S.optional(S.String), // Tracking branch
  ahead: S.optional(S.Number),
  behind: S.optional(S.Number),
}) {}

export class BranchRef extends S.Class<BranchRef>('BranchRef')({
  name: S.String,
  hash: S.String,
}) {}

export class BranchConfig extends S.Class<BranchConfig>('BranchConfig')({
  remote: S.optional(S.String),
  merge: S.optional(S.String),
  pushRemote: S.optional(S.String),
}) {}
```

**File: src/shared/schemas/git-tree/repository.ts**
```typescript
import * as S from '@effect/schema/Schema'

export class Repository extends S.Class<Repository>('Repository')({
  id: S.String, // Unique ID (hash of path)
  path: S.String, // Absolute path to .git directory
  workingDirectory: S.String, // Absolute path to working tree
  name: S.String, // Repository name (last path component)
  state: RepositoryState,
  config: S.optional(RepositoryConfig),
}) {}

export class RepositoryState extends S.Class<RepositoryState>('RepositoryState')({
  head: S.optional(S.String), // Current HEAD commit hash
  branch: S.optional(S.String), // Current branch name
  detached: S.Boolean,
  merging: S.Boolean,
  rebasing: S.Boolean,
  cherryPicking: S.Boolean,
}) {}

export class RepositoryConfig extends S.Class<RepositoryConfig>('RepositoryConfig')({
  user: S.optional(GitUser),
  remotes: S.Array(Remote),
  branches: S.Record(S.String, BranchConfig), // branch name → config
  diffTool: S.optional(S.String),
  mergeTool: S.optional(S.String),
}) {}

export class GitUser extends S.Class<GitUser>('GitUser')({
  name: S.String,
  email: S.String,
}) {}

export class Remote extends S.Class<Remote>('Remote')({
  name: S.String,
  url: S.String,
  fetch: S.String,
  push: S.optional(S.String),
}) {}
```

**File: src/shared/schemas/git-tree/reference.ts**
```typescript
import * as S from '@effect/schema/Schema'

export class Tag extends S.Class<Tag>('Tag')({
  name: S.String,
  commitHash: S.String,
  annotated: S.Boolean,
  message: S.optional(S.String),
  tagger: S.optional(S.String),
  taggerEmail: S.optional(S.String),
  taggerDate: S.optional(S.Number),
}) {}

export class RemoteRef extends S.Class<RemoteRef>('RemoteRef')({
  name: S.String, // e.g., "origin/main"
  remote: S.String, // e.g., "origin"
  branch: S.String, // e.g., "main"
  commitHash: S.String,
}) {}

export class Stash extends S.Class<Stash>('Stash')({
  index: S.Number,
  hash: S.String,
  message: S.String,
  date: S.Number,
  author: S.String,
}) {}

/**
 * Represents a label on the commit graph (branch, tag, or remote).
 */
export class RefLabel extends S.Class<RefLabel>('RefLabel')({
  type: S.Literal('branch', 'tag', 'remote', 'head'),
  name: S.String,
  commitHash: S.String,
}) {}
```

**File: src/shared/schemas/git-tree/graph.ts**
```typescript
import * as S from '@effect/schema/Schema'
import { Commit, RefLabel } from './index'

/**
 * Represents the complete commit graph.
 */
export class CommitGraph extends S.Class<CommitGraph>('CommitGraph')({
  nodes: S.Array(GraphNode),
  edges: S.Array(GraphEdge),
  head: S.optional(S.String), // Current HEAD commit
  metadata: GraphMetadata,
}) {}

export class GraphNode extends S.Class<GraphNode>('GraphNode')({
  commit: Commit,
  refs: S.Array(RefLabel), // Branches, tags, remotes pointing to this commit
  x: S.Number, // Column position in graph
  y: S.Number, // Row position in graph
  color: S.String, // Branch color for rendering
}) {}

export class GraphEdge extends S.Class<GraphEdge>('GraphEdge')({
  from: S.String, // Parent commit hash
  to: S.String, // Child commit hash
  color: S.String, // Branch color
  type: S.Literal('normal', 'merge', 'octopus'), // Edge type
}) {}

export class GraphMetadata extends S.Class<GraphMetadata>('GraphMetadata')({
  totalCommits: S.Number,
  branches: S.Number,
  tags: S.Number,
  remotes: S.Number,
  maxColumn: S.Number, // Width of graph
  buildTime: S.Number, // Time taken to build (ms)
}) {}

export class GraphConfig extends S.Class<GraphConfig>('GraphConfig')({
  maxCommits: S.Number,
  showTags: S.Boolean,
  showRemotes: S.Boolean,
  showStashes: S.Boolean,
  showUncommitted: S.Boolean,
  branchOrder: S.Literal('date', 'alphabetical'),
}) {}
```

**File: src/shared/schemas/git-tree/errors.ts**
```typescript
import * as S from '@effect/schema/Schema'

/**
 * IPC-safe error schemas (serializable across process boundary).
 */

export class GitCommandError extends S.Class<GitCommandError>('GitCommandError')({
  _tag: S.Literal('GitCommandError'),
  message: S.String,
  command: S.String,
  exitCode: S.optional(S.Number),
  stderr: S.optional(S.String),
}) {}

export class GitParseError extends S.Class<GitParseError>('GitParseError')({
  _tag: S.Literal('GitParseError'),
  message: S.String,
  output: S.String, // The output that failed to parse
}) {}

export class RepositoryNotFoundError extends S.Class<RepositoryNotFoundError>('RepositoryNotFoundError')({
  _tag: S.Literal('RepositoryNotFoundError'),
  message: S.String,
  path: S.String,
}) {}

export class InvalidRepositoryError extends S.Class<InvalidRepositoryError>('InvalidRepositoryError')({
  _tag: S.Literal('InvalidRepositoryError'),
  message: S.String,
  path: S.String,
  reason: S.String,
}) {}

export class GraphBuildError extends S.Class<GraphBuildError>('GraphBuildError')({
  _tag: S.Literal('GraphBuildError'),
  message: S.String,
  reason: S.String,
}) {}

export class CommitNotFoundError extends S.Class<CommitNotFoundError>('CommitNotFoundError')({
  _tag: S.Literal('CommitNotFoundError'),
  message: S.String,
  commitHash: S.String,
  repoPath: S.String,
}) {}
```

### 1.3 Domain Errors (Main Process)

**File: src/main/git-tree/errors.ts**
```typescript
import { Data } from 'effect'

/**
 * Domain-specific errors using Data.TaggedError.
 * These are transformed to IPC errors via error-mapper.ts.
 */

export class GitCommandExecutionError extends Data.TaggedError('GitCommandExecutionError')<{
  message: string
  command: string[]
  cwd: string
  exitCode?: number
  stderr?: string
  stdout?: string
}> {}

export class GitOutputParseError extends Data.TaggedError('GitOutputParseError')<{
  message: string
  command: string[]
  output: string
  parseError: unknown
}> {}

export class RepositoryDiscoveryError extends Data.TaggedError('RepositoryDiscoveryError')<{
  message: string
  workspacePath: string
  cause?: unknown
}> {}

export class RepositoryValidationError extends Data.TaggedError('RepositoryValidationError')<{
  message: string
  path: string
  reason: string
}> {}

export class GraphConstructionError extends Data.TaggedError('GraphConstructionError')<{
  message: string
  repoPath: string
  reason: string
  cause?: unknown
}> {}

export class CommitLookupError extends Data.TaggedError('CommitLookupError')<{
  message: string
  commitHash: string
  repoPath: string
}> {}

export class GitOperationError extends Data.TaggedError('GitOperationError')<{
  message: string
  operation: string
  repoPath: string
  stderr?: string
}> {}
```

---

## Phase 2: Git Adapter Layer (Ports Implementation)

### 2.1 Git Command Executor (Adapter)

**Files to create:**
```
src/main/git-tree/adapters/
├── git-command-executor.ts       # Implements GitOperationsPort
├── git-parser.ts                 # Parses Git command output
└── git-command-builder.ts        # Builds Git command arguments
```

**File: src/main/git-tree/adapters/git-command-executor.ts**
```typescript
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as S from '@effect/schema/Schema'
import { exec } from 'child_process'
import { promisify } from 'util'
import { GitOperationsPort } from '../ports/git-operations-port'
import { GitCommandExecutionError, GitOutputParseError } from '../errors'

const execAsync = promisify(exec)

/**
 * Adapter that executes Git commands via child_process.
 * Implements GitOperationsPort.
 */
export class GitCommandExecutor extends Effect.Service<GitCommandExecutor>()('GitCommandExecutor', {
  effect: Effect.gen(function* () {
    const implementation: GitOperationsPort = {
      executeCommand: <T>(repoPath: string, command: GitCommand, outputSchema: S.Schema<T>) =>
        Effect.gen(function* () {
          // Build command args
          const args = buildCommandArgs(command)
          const fullCommand = ['git', ...args].join(' ')

          // Execute command
          const result = yield* Effect.tryPromise({
            try: () => execAsync(fullCommand, { cwd: repoPath, maxBuffer: 50 * 1024 * 1024 }), // 50MB buffer
            catch: (error) => new GitCommandExecutionError({
              message: `Git command failed: ${fullCommand}`,
              command: ['git', ...args],
              cwd: repoPath,
              exitCode: (error as any).code,
              stderr: (error as any).stderr,
              stdout: (error as any).stdout,
            }),
          })

          // Parse output using schema
          const parsed = yield* S.decodeUnknown(outputSchema)(result.stdout).pipe(
            Effect.mapError((parseError) => new GitOutputParseError({
              message: `Failed to parse Git output`,
              command: ['git', ...args],
              output: result.stdout,
              parseError,
            }))
          )

          return parsed
        }),

      streamCommand: <T>(repoPath: string, command: GitCommand, lineSchema: S.Schema<T>) =>
        Stream.async<T, GitCommandExecutionError | GitOutputParseError>((emit) => {
          const args = buildCommandArgs(command)
          const child = spawn('git', args, { cwd: repoPath })

          let buffer = ''

          child.stdout?.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            lines.forEach((line) => {
              if (line.trim() === '') return

              // Parse line with schema
              Effect.runPromise(
                S.decodeUnknown(lineSchema)(line).pipe(
                  Effect.mapError((parseError) => new GitOutputParseError({
                    message: 'Failed to parse Git output line',
                    command: ['git', ...args],
                    output: line,
                    parseError,
                  }))
                )
              ).then(
                (parsed) => emit.single(parsed),
                (error) => emit.fail(error)
              )
            })
          })

          child.stderr?.on('data', (chunk: Buffer) => {
            // Log stderr but don't fail (Git uses stderr for progress)
            console.warn('Git stderr:', chunk.toString())
          })

          child.on('error', (error) => {
            emit.fail(new GitCommandExecutionError({
              message: 'Git command process error',
              command: ['git', ...args],
              cwd: repoPath,
              stderr: error.message,
            }))
          })

          child.on('exit', (code) => {
            if (code !== 0) {
              emit.fail(new GitCommandExecutionError({
                message: `Git command exited with code ${code}`,
                command: ['git', ...args],
                cwd: repoPath,
                exitCode: code,
              }))
            } else {
              emit.end()
            }
          })

          return Effect.sync(() => {
            child.kill()
          })
        }),
    }

    return implementation
  }),
  dependencies: [],
}) {}

/**
 * Build Git command arguments from a GitCommand.
 */
function buildCommandArgs(command: GitCommand): string[] {
  // Command-specific argument building
  // e.g., { type: 'log', maxCount: 100 } => ['log', '--max-count=100']
  // Implementation depends on GitCommand schema
  return [] // TODO: Implement
}
```

**File: src/main/git-tree/adapters/git-parser.ts**
```typescript
import * as S from '@effect/schema/Schema'
import { Commit, Branch, Tag, Remote } from '../../../shared/schemas/git-tree'

/**
 * Git log separator for parsing structured output.
 */
export const GIT_LOG_SEPARATOR = '\x1E' // ASCII record separator

/**
 * Schema for parsing a single Git log line.
 */
export const GitLogLine = S.Struct({
  hash: S.String,
  parents: S.String.pipe(S.transform(S.Array(S.String), {
    decode: (s) => s.split(' ').filter(Boolean),
    encode: (a) => a.join(' '),
  })),
  author: S.String,
  authorEmail: S.String,
  authorDate: S.NumberFromString,
  subject: S.String,
})

/**
 * Parse `git log` output into Commit array.
 */
export const parseGitLog = (output: string): Effect.Effect<Commit[], GitOutputParseError> =>
  Effect.gen(function* () {
    const lines = output.split('\n').filter(Boolean)
    const commits = yield* Effect.all(
      lines.map((line) =>
        S.decodeUnknown(GitLogLine)(parseLogLine(line)).pipe(
          Effect.map((parsed) => new Commit({
            hash: parsed.hash,
            parents: parsed.parents,
            author: parsed.author,
            authorEmail: parsed.authorEmail,
            authorDate: parsed.authorDate,
            committer: parsed.author, // Same as author for log
            committerEmail: parsed.authorEmail,
            committerDate: parsed.authorDate,
            message: parsed.subject,
            subject: parsed.subject,
          }))
        )
      )
    )

    return commits
  })

/**
 * Parse a single log line by splitting on separator.
 */
function parseLogLine(line: string): Record<string, string> {
  const parts = line.split(GIT_LOG_SEPARATOR)
  return {
    hash: parts[0],
    parents: parts[1],
    author: parts[2],
    authorEmail: parts[3],
    authorDate: parts[4],
    subject: parts[5],
  }
}

/**
 * Parse `git branch` output into Branch array.
 */
export const parseGitBranch = (output: string): Effect.Effect<Branch[], GitOutputParseError> =>
  Effect.gen(function* () {
    // Parse output like:
    // * main               abc1234 Commit message
    //   feature/something  def5678 Another commit
    //   remotes/origin/main ghi9012 Remote commit

    const lines = output.split('\n').filter(Boolean)
    const branches = lines.map((line) => {
      const match = line.match(/^([* ])\s+(remotes\/)?([\w\/\-]+)\s+([a-f0-9]+)\s+(.*)$/)
      if (!match) return null

      const [, current, remotePrefix, name, hash, message] = match
      const isRemote = Boolean(remotePrefix)

      return new Branch({
        name: name,
        commitHash: hash,
        isLocal: !isRemote,
        isRemote: isRemote,
        upstream: undefined,
        ahead: undefined,
        behind: undefined,
      })
    }).filter(Boolean) as Branch[]

    return branches
  })

// Additional parsers for tags, remotes, config, etc.
```

### 2.2 Repository Adapter

**File: src/main/git-tree/adapters/repository-adapter.ts**
```typescript
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as fs from 'fs/promises'
import * as path from 'path'
import { watch } from 'fs'
import { GitRepositoryPort } from '../ports/git-repository-port'
import { Repository, RepositoryEvent } from '../../../shared/schemas/git-tree'
import { RepositoryDiscoveryError, RepositoryValidationError } from '../errors'

/**
 * Adapter for repository operations (discovery, validation, watching).
 * Implements GitRepositoryPort.
 */
export class RepositoryAdapter extends Effect.Service<RepositoryAdapter>()('RepositoryAdapter', {
  effect: Effect.gen(function* () {
    const implementation: GitRepositoryPort = {
      discoverRepositories: () =>
        Effect.gen(function* () {
          // Get workspace folders from vscode.workspace.workspaceFolders
          // For now, hardcode or accept as parameter
          const workspacePaths: string[] = [] // TODO: Get from context

          const repos = yield* Effect.all(
            workspacePaths.map((workspacePath) =>
              findGitRepositories(workspacePath).pipe(
                Effect.catchAll(() => Effect.succeed([]))
              )
            )
          )

          return repos.flat()
        }),

      validateRepository: (path: string) =>
        Effect.gen(function* () {
          // Check if .git directory exists
          const gitPath = yield* Effect.tryPromise({
            try: () => fs.stat(path),
            catch: () => new RepositoryValidationError({
              message: 'Path does not exist',
              path,
              reason: 'Path not found',
            }),
          })

          if (!gitPath.isDirectory()) {
            return yield* Effect.fail(new RepositoryValidationError({
              message: 'Path is not a directory',
              path,
              reason: 'Not a directory',
            }))
          }

          // Check for .git subdirectory
          const dotGitPath = yield* Effect.tryPromise({
            try: () => fs.stat(path + '/.git'),
            catch: () => new RepositoryValidationError({
              message: 'Not a Git repository',
              path,
              reason: 'Missing .git directory',
            }),
          })

          // Create Repository object
          return new Repository({
            id: hashString(path), // Generate ID from path
            path: path + '/.git',
            workingDirectory: path,
            name: path.split('/').pop() || 'repository',
            state: new RepositoryState({
              head: undefined,
              branch: undefined,
              detached: false,
              merging: false,
              rebasing: false,
              cherryPicking: false,
            }),
            config: undefined,
          })
        }),

      watchRepository: (repoPath: string) =>
        Stream.async<RepositoryEvent, RepositoryWatchError>((emit) => {
          const gitPath = repoPath + '/.git'
          const watcher = watch(gitPath, { recursive: true }, (eventType, filename) => {
            if (!filename) return

            // Emit events for ref changes, index changes, etc.
            if (filename.startsWith('refs/') || filename === 'HEAD' || filename === 'index') {
              emit.single(new RepositoryEvent({
                type: 'ref-change',
                path: filename,
                timestamp: Date.now(),
              }))
            }
          })

          return Effect.sync(() => {
            watcher.close()
          })
        }),
    }

    return implementation
  }),
  dependencies: [],
}) {}

/**
 * Recursively find all Git repositories in a directory.
 */
function findGitRepositories(basePath: string): Effect.Effect<Repository[], RepositoryDiscoveryError> {
  return Effect.gen(function* () {
    const repos: Repository[] = []

    const search = (dir: string): Effect.Effect<void, RepositoryDiscoveryError> =>
      Effect.gen(function* () {
        const entries = yield* Effect.tryPromise({
          try: () => fs.readdir(dir, { withFileTypes: true }),
          catch: (error) => new RepositoryDiscoveryError({
            message: 'Failed to read directory',
            workspacePath: dir,
            cause: error,
          }),
        })

        for (const entry of entries) {
          if (entry.name === '.git' && entry.isDirectory()) {
            // Found a repository
            const repo = yield* Effect.succeed(new Repository({
              id: hashString(dir),
              path: path.join(dir, '.git'),
              workingDirectory: dir,
              name: path.basename(dir),
              state: new RepositoryState({
                head: undefined,
                branch: undefined,
                detached: false,
                merging: false,
                rebasing: false,
                cherryPicking: false,
              }),
              config: undefined,
            }))
            repos.push(repo)
          } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
            // Recurse into subdirectories (skip hidden dirs)
            yield* search(path.join(dir, entry.name))
          }
        }
      })

    yield* search(basePath)
    return repos
  })
}

function hashString(str: string): string {
  // Simple hash function (use crypto for production)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash.toString(16)
}
```

---

## Phase 3: Service Layer (Business Logic)

### 3.1 Commit Graph Service

**File: src/main/git-tree/services/commit-graph-service.ts**
```typescript
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import { GitOperationsPort } from '../ports/git-operations-port'
import { GraphBuilderPort } from '../ports/graph-builder-port'
import { CommitGraph, GraphConfig, Commit } from '../../../shared/schemas/git-tree'
import { GraphConstructionError } from '../errors'

/**
 * Service for building and managing commit graphs.
 * Core business logic for graph visualization.
 */
export class CommitGraphService extends Effect.Service<CommitGraphService>()('CommitGraphService', {
  effect: Effect.gen(function* () {
    const gitOps = yield* GitOperationsPort
    const graphBuilder = yield* GraphBuilderPort

    // Cache of built graphs (repoPath → graph)
    const graphCache = yield* Ref.make(new Map<string, CommitGraph>())

    return {
      /**
       * Build a complete commit graph for a repository.
       * @param repoPath The repository path
       * @param config Graph configuration
       * @returns Effect with built CommitGraph
       */
      buildGraph: (repoPath: string, config: GraphConfig) =>
        Effect.gen(function* () {
          // Fetch commits via git log
          const commits = yield* fetchCommits(repoPath, config).pipe(
            Effect.mapError((error) => new GraphConstructionError({
              message: 'Failed to fetch commits',
              repoPath,
              reason: error.message,
              cause: error,
            }))
          )

          // Build graph structure
          const graph = yield* graphBuilder.buildGraph(commits, config)

          // Cache the graph
          yield* Ref.update(graphCache, (cache) => {
            cache.set(repoPath, graph)
            return cache
          })

          return graph
        }),

      /**
       * Get a cached graph or build if not cached.
       * @param repoPath The repository path
       * @param config Graph configuration
       * @returns Effect with CommitGraph
       */
      getGraph: (repoPath: string, config: GraphConfig) =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(graphCache)
          const cached = cache.get(repoPath)

          if (cached) {
            return cached
          }

          return yield* buildGraph(repoPath, config)
        }),

      /**
       * Refresh a graph with new commits (incremental update).
       * @param repoPath The repository path
       * @param config Graph configuration
       * @returns Effect with updated CommitGraph
       */
      refreshGraph: (repoPath: string, config: GraphConfig) =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(graphCache)
          const existingGraph = cache.get(repoPath)

          if (!existingGraph) {
            // No cached graph, build from scratch
            return yield* buildGraph(repoPath, config)
          }

          // Fetch only new commits (since last HEAD)
          const newCommits = yield* fetchNewCommits(repoPath, existingGraph.head)

          if (newCommits.length === 0) {
            // No new commits
            return existingGraph
          }

          // Update graph incrementally
          const updatedGraph = yield* graphBuilder.updateGraph(existingGraph, newCommits)

          // Update cache
          yield* Ref.update(graphCache, (cache) => {
            cache.set(repoPath, updatedGraph)
            return cache
          })

          return updatedGraph
        }),

      /**
       * Clear the graph cache for a repository.
       */
      clearCache: (repoPath: string) =>
        Ref.update(graphCache, (cache) => {
          cache.delete(repoPath)
          return cache
        }),
    }
  }),
  dependencies: [GitOperationsPort, GraphBuilderPort],
}) {}

/**
 * Fetch commits from Git.
 */
function fetchCommits(repoPath: string, config: GraphConfig): Effect.Effect<Commit[], GitCommandExecutionError> {
  return Effect.gen(function* () {
    const gitOps = yield* GitOperationsPort

    // Build git log command
    const command = new GitCommand({
      type: 'log',
      maxCount: config.maxCommits,
      all: true, // All branches
      showTags: config.showTags,
      format: '%H%x1E%P%x1E%an%x1E%ae%x1E%at%x1E%s', // Hash, parents, author, email, date, subject
    })

    // Execute and parse
    const commits = yield* gitOps.executeCommand(repoPath, command, S.Array(Commit))

    return commits
  })
}

/**
 * Fetch only new commits since a given commit.
 */
function fetchNewCommits(repoPath: string, sinceCommit: string | undefined): Effect.Effect<Commit[], GitCommandExecutionError> {
  // Similar to fetchCommits but with `--since` or commit range
  return Effect.succeed([]) // TODO: Implement
}
```

### 3.2 Repository Service

**File: src/main/git-tree/services/repository-service.ts**
```typescript
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import * as Stream from 'effect/Stream'
import { GitRepositoryPort } from '../ports/git-repository-port'
import { GitOperationsPort } from '../ports/git-operations-port'
import { Repository, RepositoryState, Branch, Tag, Remote } from '../../../shared/schemas/git-tree'

/**
 * Service for high-level repository operations.
 */
export class RepositoryService extends Effect.Service<RepositoryService>()('RepositoryService', {
  effect: Effect.gen(function* () {
    const repoPort = yield* GitRepositoryPort
    const gitOps = yield* GitOperationsPort

    // Registry of discovered repositories
    const repositories = yield* Ref.make<Repository[]>([])

    return {
      /**
       * Discover all repositories in the workspace.
       */
      discoverRepositories: () =>
        Effect.gen(function* () {
          const discovered = yield* repoPort.discoverRepositories()
          yield* Ref.set(repositories, discovered)
          return discovered
        }),

      /**
       * Get all discovered repositories.
       */
      getRepositories: () => Ref.get(repositories),

      /**
       * Get a repository by path.
       */
      getRepository: (path: string) =>
        Effect.gen(function* () {
          const repos = yield* Ref.get(repositories)
          const repo = repos.find((r) => r.workingDirectory === path)

          if (!repo) {
            return yield* Effect.fail(new RepositoryNotFoundError({
              message: 'Repository not found',
              path,
            }))
          }

          return repo
        }),

      /**
       * Get repository info (branches, tags, remotes, state).
       */
      getRepositoryInfo: (repoPath: string) =>
        Effect.gen(function* () {
          // Parallel fetch of branches, tags, remotes, and state
          const [branches, tags, remotes, state] = yield* Effect.all([
            getBranches(repoPath),
            getTags(repoPath),
            getRemotes(repoPath),
            getRepositoryState(repoPath),
          ])

          return {
            branches,
            tags,
            remotes,
            state,
          }
        }),

      /**
       * Watch a repository for changes.
       */
      watchRepository: (repoPath: string) =>
        repoPort.watchRepository(repoPath),
    }
  }),
  dependencies: [GitRepositoryPort, GitOperationsPort],
}) {}

function getBranches(repoPath: string): Effect.Effect<Branch[], GitCommandExecutionError> {
  return Effect.gen(function* () {
    const gitOps = yield* GitOperationsPort
    const command = new GitCommand({ type: 'branch', all: true })
    return yield* gitOps.executeCommand(repoPath, command, S.Array(Branch))
  })
}

function getTags(repoPath: string): Effect.Effect<Tag[], GitCommandExecutionError> {
  // Similar to getBranches
  return Effect.succeed([]) // TODO: Implement
}

function getRemotes(repoPath: string): Effect.Effect<Remote[], GitCommandExecutionError> {
  // Similar to getBranches
  return Effect.succeed([]) // TODO: Implement
}

function getRepositoryState(repoPath: string): Effect.Effect<RepositoryState, GitCommandExecutionError> {
  // Check HEAD, check for merge/rebase state, etc.
  return Effect.succeed(new RepositoryState({
    head: undefined,
    branch: undefined,
    detached: false,
    merging: false,
    rebasing: false,
    cherryPicking: false,
  })) // TODO: Implement
}
```

### 3.3 Git Operations Service

**File: src/main/git-tree/services/git-operations-service.ts**
```typescript
import * as Effect from 'effect/Effect'
import { GitOperationsPort } from '../ports/git-operations-port'
import { GitOperationError } from '../errors'

/**
 * Service for executing Git operations (checkout, merge, rebase, etc.).
 */
export class GitOperationsService extends Effect.Service<GitOperationsService>()('GitOperationsService', {
  effect: Effect.gen(function* () {
    const gitOps = yield* GitOperationsPort

    return {
      /**
       * Create a new branch.
       */
      createBranch: (repoPath: string, branchName: string, startPoint?: string) =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'branch',
            create: branchName,
            startPoint,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void).pipe(
            Effect.mapError((error) => new GitOperationError({
              message: 'Failed to create branch',
              operation: 'create-branch',
              repoPath,
              stderr: error.stderr,
            }))
          )
        }),

      /**
       * Delete a branch.
       */
      deleteBranch: (repoPath: string, branchName: string, force: boolean = false) =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'branch',
            delete: branchName,
            force,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void)
        }),

      /**
       * Checkout a branch or commit.
       */
      checkout: (repoPath: string, ref: string) =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'checkout',
            ref,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void)
        }),

      /**
       * Merge a branch into current branch.
       */
      merge: (repoPath: string, branch: string, noFastForward: boolean = false) =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'merge',
            branch,
            noFastForward,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void)
        }),

      /**
       * Rebase current branch onto another branch.
       */
      rebase: (repoPath: string, onto: string, interactive: boolean = false) =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'rebase',
            onto,
            interactive,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void)
        }),

      /**
       * Cherry-pick a commit.
       */
      cherryPick: (repoPath: string, commitHash: string) =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'cherry-pick',
            commit: commitHash,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void)
        }),

      /**
       * Revert a commit.
       */
      revert: (repoPath: string, commitHash: string) =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'revert',
            commit: commitHash,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void)
        }),

      /**
       * Reset to a commit (soft, mixed, or hard).
       */
      reset: (repoPath: string, commitHash: string, mode: 'soft' | 'mixed' | 'hard') =>
        Effect.gen(function* () {
          const command = new GitCommand({
            type: 'reset',
            commit: commitHash,
            mode,
          })

          yield* gitOps.executeCommand(repoPath, command, S.Void)
        }),

      // Additional operations: fetch, pull, push, tag, stash, etc.
    }
  }),
  dependencies: [GitOperationsPort],
}) {}
```

---

## Phase 4: IPC Integration

### 4.1 IPC Contracts

**Update: src/shared/ipc-contracts.ts**
```typescript
export const GitTreeIpcContracts = {
  // Repository operations
  listRepositories: {
    channel: 'git-tree:list-repositories' as const,
    input: S.Void,
    output: S.Array(Repository),
    errors: S.Union(RepositoryDiscoveryError),
  },

  getRepoInfo: {
    channel: 'git-tree:get-repo-info' as const,
    input: S.Struct({ repoPath: S.String }),
    output: S.Struct({
      branches: S.Array(Branch),
      tags: S.Array(Tag),
      remotes: S.Array(Remote),
      state: RepositoryState,
    }),
    errors: S.Union(RepositoryNotFoundError, GitCommandError),
  },

  // Commit graph operations
  getCommitGraph: {
    channel: 'git-tree:get-commit-graph' as const,
    input: S.Struct({
      repoPath: S.String,
      config: GraphConfig,
    }),
    output: CommitGraph,
    errors: S.Union(RepositoryNotFoundError, GraphBuildError, GitCommandError),
  },

  getCommitDetails: {
    channel: 'git-tree:get-commit-details' as const,
    input: S.Struct({
      repoPath: S.String,
      commitHash: S.String,
    }),
    output: CommitDetails,
    errors: S.Union(CommitNotFoundError, GitCommandError),
  },

  // Branch operations
  createBranch: {
    channel: 'git-tree:create-branch' as const,
    input: S.Struct({
      repoPath: S.String,
      branchName: S.String,
      startPoint: S.optional(S.String),
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, GitCommandError),
  },

  deleteBranch: {
    channel: 'git-tree:delete-branch' as const,
    input: S.Struct({
      repoPath: S.String,
      branchName: S.String,
      force: S.Boolean,
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, GitCommandError),
  },

  checkoutBranch: {
    channel: 'git-tree:checkout-branch' as const,
    input: S.Struct({
      repoPath: S.String,
      ref: S.String,
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, GitCommandError),
  },

  // Git operations
  merge: {
    channel: 'git-tree:merge' as const,
    input: S.Struct({
      repoPath: S.String,
      branch: S.String,
      noFastForward: S.Boolean,
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, GitCommandError),
  },

  rebase: {
    channel: 'git-tree:rebase' as const,
    input: S.Struct({
      repoPath: S.String,
      onto: S.String,
      interactive: S.Boolean,
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, GitCommandError),
  },

  cherryPick: {
    channel: 'git-tree:cherry-pick' as const,
    input: S.Struct({
      repoPath: S.String,
      commitHash: S.String,
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, CommitNotFoundError, GitCommandError),
  },

  revert: {
    channel: 'git-tree:revert' as const,
    input: S.Struct({
      repoPath: S.String,
      commitHash: S.String,
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, CommitNotFoundError, GitCommandError),
  },

  reset: {
    channel: 'git-tree:reset' as const,
    input: S.Struct({
      repoPath: S.String,
      commitHash: S.String,
      mode: S.Literal('soft', 'mixed', 'hard'),
    }),
    output: S.Void,
    errors: S.Union(RepositoryNotFoundError, CommitNotFoundError, GitCommandError),
  },
} as const

// Combine with existing contracts
export const IpcContracts = {
  ...AccountIpcContracts,
  ...GitHubIpcContracts,
  ...AiWatcherIpcContracts,
  ...GitTreeIpcContracts,
} as const
```

### 4.2 IPC Handlers

**File: src/main/ipc/git-tree-handlers.ts**
```typescript
import * as Effect from 'effect/Effect'
import { registerIpcHandler } from './ipc-handler-setup'
import { GitTreeIpcContracts } from '../../shared/ipc-contracts'
import { RepositoryService } from '../git-tree/services/repository-service'
import { CommitGraphService } from '../git-tree/services/commit-graph-service'
import { GitOperationsService } from '../git-tree/services/git-operations-service'

/**
 * Setup all Git Tree IPC handlers.
 * Uses the centralized registerIpcHandler utility.
 */
export const setupGitTreeIpcHandlers = Effect.gen(function* () {
  const repoService = yield* RepositoryService
  const graphService = yield* CommitGraphService
  const gitOpsService = yield* GitOperationsService

  // Repository operations
  registerIpcHandler(
    GitTreeIpcContracts.listRepositories,
    () => repoService.discoverRepositories()
  )

  registerIpcHandler(
    GitTreeIpcContracts.getRepoInfo,
    (input) => repoService.getRepositoryInfo(input.repoPath)
  )

  // Commit graph operations
  registerIpcHandler(
    GitTreeIpcContracts.getCommitGraph,
    (input) => graphService.buildGraph(input.repoPath, input.config)
  )

  registerIpcHandler(
    GitTreeIpcContracts.getCommitDetails,
    (input) => getCommitDetails(input.repoPath, input.commitHash)
  )

  // Branch operations
  registerIpcHandler(
    GitTreeIpcContracts.createBranch,
    (input) => gitOpsService.createBranch(input.repoPath, input.branchName, input.startPoint)
  )

  registerIpcHandler(
    GitTreeIpcContracts.deleteBranch,
    (input) => gitOpsService.deleteBranch(input.repoPath, input.branchName, input.force)
  )

  registerIpcHandler(
    GitTreeIpcContracts.checkoutBranch,
    (input) => gitOpsService.checkout(input.repoPath, input.ref)
  )

  // Git operations
  registerIpcHandler(
    GitTreeIpcContracts.merge,
    (input) => gitOpsService.merge(input.repoPath, input.branch, input.noFastForward)
  )

  registerIpcHandler(
    GitTreeIpcContracts.rebase,
    (input) => gitOpsService.rebase(input.repoPath, input.onto, input.interactive)
  )

  registerIpcHandler(
    GitTreeIpcContracts.cherryPick,
    (input) => gitOpsService.cherryPick(input.repoPath, input.commitHash)
  )

  registerIpcHandler(
    GitTreeIpcContracts.revert,
    (input) => gitOpsService.revert(input.repoPath, input.commitHash)
  )

  registerIpcHandler(
    GitTreeIpcContracts.reset,
    (input) => gitOpsService.reset(input.repoPath, input.commitHash, input.mode)
  )
})

// Helper functions...
function getCommitDetails(repoPath: string, commitHash: string): Effect.Effect<CommitDetails, ...> {
  // Implementation
  return Effect.succeed({} as CommitDetails) // TODO
}
```

### 4.3 Error Mapper Extension

**Update: src/main/ipc/error-mapper.ts**
```typescript
import {
  GitCommandExecutionError,
  GitOutputParseError,
  RepositoryDiscoveryError,
  RepositoryValidationError,
  GraphConstructionError,
  CommitLookupError,
  GitOperationError,
} from '../git-tree/errors'

// Add to existing error types
type GitTreeDomainError =
  | GitCommandExecutionError
  | GitOutputParseError
  | RepositoryDiscoveryError
  | RepositoryValidationError
  | GraphConstructionError
  | CommitLookupError
  | GitOperationError

const isGitTreeDomainError = (error: unknown): error is GitTreeDomainError => {
  return (
    error instanceof GitCommandExecutionError ||
    error instanceof GitOutputParseError ||
    error instanceof RepositoryDiscoveryError ||
    error instanceof RepositoryValidationError ||
    error instanceof GraphConstructionError ||
    error instanceof CommitLookupError ||
    error instanceof GitOperationError
  )
}

export const mapDomainErrorToIpcError = (error: unknown): Effect.Effect<IpcErrorResult> => {
  // Add Git Tree error handling
  if (isGitTreeDomainError(error)) {
    if (error instanceof GitCommandExecutionError || error instanceof GitOperationError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GitCommandError({
          _tag: 'GitCommandError',
          message: error.message,
          command: Array.isArray(error.command) ? error.command.join(' ') : error.operation,
          exitCode: 'exitCode' in error ? error.exitCode : undefined,
          stderr: error.stderr,
        }),
      })
    }

    if (error instanceof GitOutputParseError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GitParseError({
          _tag: 'GitParseError',
          message: error.message,
          output: error.output,
        }),
      })
    }

    if (error instanceof RepositoryValidationError || error instanceof CommitLookupError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new RepositoryNotFoundError({
          _tag: 'RepositoryNotFoundError',
          message: error.message,
          path: 'path' in error ? error.path : 'repoPath' in error ? error.repoPath : '',
        }),
      })
    }

    if (error instanceof GraphConstructionError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GraphBuildError({
          _tag: 'GraphBuildError',
          message: error.message,
          reason: error.reason,
        }),
      })
    }
  }

  // Existing error handling for GitHub, AI watchers, tier, etc.
  if (isGitHubDomainError(error)) { ... }
  if (isAiWatcherDomainError(error)) { ... }
  if (isTierDomainError(error)) { ... }

  // Fallback for unknown errors
  return Effect.succeed({
    _tag: 'Defect' as const,
    defect: error,
  })
}
```

---

## Phase 5: Renderer Integration

### 5.1 IPC Client

**Update: src/renderer/lib/ipc-client.ts**
```typescript
/**
 * GitTreeClient service for renderer process.
 */
export class GitTreeClient extends Effect.Service<GitTreeClient>()('GitTreeClient', {
  effect: Effect.gen(function* () {
    const ipcClient = yield* ElectronIpcClient

    return {
      listRepositories: () =>
        ipcClient.invoke(GitTreeIpcContracts.listRepositories, undefined),

      getRepoInfo: (repoPath: string) =>
        ipcClient.invoke(GitTreeIpcContracts.getRepoInfo, { repoPath }),

      getCommitGraph: (repoPath: string, config: GraphConfig) =>
        ipcClient.invoke(GitTreeIpcContracts.getCommitGraph, { repoPath, config }),

      getCommitDetails: (repoPath: string, commitHash: string) =>
        ipcClient.invoke(GitTreeIpcContracts.getCommitDetails, { repoPath, commitHash }),

      createBranch: (repoPath: string, branchName: string, startPoint?: string) =>
        ipcClient.invoke(GitTreeIpcContracts.createBranch, { repoPath, branchName, startPoint }),

      deleteBranch: (repoPath: string, branchName: string, force: boolean) =>
        ipcClient.invoke(GitTreeIpcContracts.deleteBranch, { repoPath, branchName, force }),

      checkoutBranch: (repoPath: string, ref: string) =>
        ipcClient.invoke(GitTreeIpcContracts.checkoutBranch, { repoPath, ref }),

      merge: (repoPath: string, branch: string, noFastForward: boolean) =>
        ipcClient.invoke(GitTreeIpcContracts.merge, { repoPath, branch, noFastForward }),

      rebase: (repoPath: string, onto: string, interactive: boolean) =>
        ipcClient.invoke(GitTreeIpcContracts.rebase, { repoPath, onto, interactive }),

      cherryPick: (repoPath: string, commitHash: string) =>
        ipcClient.invoke(GitTreeIpcContracts.cherryPick, { repoPath, commitHash }),

      revert: (repoPath: string, commitHash: string) =>
        ipcClient.invoke(GitTreeIpcContracts.revert, { repoPath, commitHash }),

      reset: (repoPath: string, commitHash: string, mode: 'soft' | 'mixed' | 'hard') =>
        ipcClient.invoke(GitTreeIpcContracts.reset, { repoPath, commitHash, mode }),
    }
  }),
  dependencies: [ElectronIpcClient],
}) {}

// Add to ClientLayer
export const ClientLayer = Layer.mergeAll(
  ElectronIpcClient.Default,
  ProviderClient.Default,
  AiProviderClient.Default,
  AiWatcherClient.Default,
  GitTreeClient.Default, // Add here
)
```

### 5.2 Atoms (Reactive State)

**File: src/renderer/atoms/git-tree-atoms.ts**
```typescript
import { Atom } from '@effect-atom/atom-react'
import * as Effect from 'effect/Effect'
import * as Duration from 'effect/Duration'
import { GitTreeClient } from '../lib/ipc-client'
import { Repository, CommitGraph, CommitDetails, GraphConfig } from '../../shared/schemas/git-tree'

/**
 * Runtime for Git Tree atoms with GitTreeClient.
 */
const gitTreeRuntime = Atom.runtime(GitTreeClient.Default)

/**
 * Atom for the list of repositories.
 * TTL: 30 seconds (repositories don't change frequently).
 */
export const repositoriesAtom = Atom.make(
  Effect.gen(function* () {
    const client = yield* GitTreeClient
    return yield* client.listRepositories()
  })
)
  .pipe(Atom.runtime(gitTreeRuntime))
  .pipe(Atom.setIdleTTL(Duration.seconds(30)))
  .pipe(Atom.withReactivityKeys([['git-tree:repositories']]))

/**
 * Atom for repository info (branches, tags, remotes, state).
 * TTL: 10 seconds.
 * Reactivity: Invalidates on repo changes.
 */
export const repoInfoAtom = Atom.family((repoPath: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* GitTreeClient
      return yield* client.getRepoInfo(repoPath)
    })
  )
    .pipe(Atom.runtime(gitTreeRuntime))
    .pipe(Atom.setIdleTTL(Duration.seconds(10)))
    .pipe(Atom.withReactivityKeys([
      ['git-tree:repo-info', repoPath],
      ['git-tree:repo-changed', repoPath],
    ]))
)

/**
 * Atom for commit graph.
 * TTL: 5 seconds (graphs are expensive to rebuild).
 * Reactivity: Invalidates on repo changes, config changes.
 */
export const commitGraphAtom = Atom.family((params: { repoPath: string; config: GraphConfig }) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* GitTreeClient
      return yield* client.getCommitGraph(params.repoPath, params.config)
    })
  )
    .pipe(Atom.runtime(gitTreeRuntime))
    .pipe(Atom.setIdleTTL(Duration.seconds(5)))
    .pipe(Atom.withReactivityKeys([
      ['git-tree:commit-graph', params.repoPath],
      ['git-tree:repo-changed', params.repoPath],
    ]))
)

/**
 * Atom for commit details.
 * TTL: 60 seconds (commit details are immutable).
 */
export const commitDetailsAtom = Atom.family((params: { repoPath: string; commitHash: string }) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* GitTreeClient
      return yield* client.getCommitDetails(params.repoPath, params.commitHash)
    })
  )
    .pipe(Atom.runtime(gitTreeRuntime))
    .pipe(Atom.setIdleTTL(Duration.minutes(1)))
    .pipe(Atom.withReactivityKeys([
      ['git-tree:commit-details', params.repoPath, params.commitHash],
    ]))
)

/**
 * Action atom for creating a branch.
 */
export const createBranchAtom = Atom.make(
  (params: { repoPath: string; branchName: string; startPoint?: string }) =>
    Effect.gen(function* () {
      const client = yield* GitTreeClient
      yield* client.createBranch(params.repoPath, params.branchName, params.startPoint)

      // Invalidate relevant atoms
      yield* Atom.invalidate([
        ['git-tree:repo-info', params.repoPath],
        ['git-tree:commit-graph', params.repoPath],
        ['git-tree:repo-changed', params.repoPath],
      ])
    })
).pipe(Atom.runtime(gitTreeRuntime))

/**
 * Action atom for deleting a branch.
 */
export const deleteBranchAtom = Atom.make(
  (params: { repoPath: string; branchName: string; force: boolean }) =>
    Effect.gen(function* () {
      const client = yield* GitTreeClient
      yield* client.deleteBranch(params.repoPath, params.branchName, params.force)

      yield* Atom.invalidate([
        ['git-tree:repo-info', params.repoPath],
        ['git-tree:commit-graph', params.repoPath],
        ['git-tree:repo-changed', params.repoPath],
      ])
    })
).pipe(Atom.runtime(gitTreeRuntime))

/**
 * Action atom for checking out a branch/commit.
 */
export const checkoutAtom = Atom.make(
  (params: { repoPath: string; ref: string }) =>
    Effect.gen(function* () {
      const client = yield* GitTreeClient
      yield* client.checkoutBranch(params.repoPath, params.ref)

      yield* Atom.invalidate([
        ['git-tree:repo-info', params.repoPath],
        ['git-tree:repo-changed', params.repoPath],
      ])
    })
).pipe(Atom.runtime(gitTreeRuntime))

// Additional action atoms for merge, rebase, cherry-pick, revert, reset...
```

### 5.3 Custom Hooks

**File: src/renderer/hooks/useGitTree.ts**
```typescript
import { useAtomValue, useSetAtom } from '@effect-atom/atom-react'
import {
  repositoriesAtom,
  repoInfoAtom,
  commitGraphAtom,
  commitDetailsAtom,
  createBranchAtom,
  deleteBranchAtom,
  checkoutAtom,
} from '../atoms/git-tree-atoms'
import { GraphConfig } from '../../shared/schemas/git-tree'

/**
 * Hook for repository list management.
 */
export function useRepositories() {
  const repositoriesResult = useAtomValue(repositoriesAtom)

  return {
    repositoriesResult,
    repositories: Result.getOrElse(repositoriesResult, () => []),
    isLoading: repositoriesResult._tag === 'Initial' && repositoriesResult.waiting,
    error: repositoriesResult._tag === 'Failure' ? repositoriesResult.error : null,
  }
}

/**
 * Hook for single repository details.
 */
export function useRepository(repoPath: string) {
  const repoInfoResult = useAtomValue(repoInfoAtom(repoPath))

  return {
    repoInfoResult,
    repoInfo: Result.match(repoInfoResult, {
      onSuccess: (data) => data.value,
      onFailure: () => null,
      onInitial: () => null,
    }),
    isLoading: repoInfoResult._tag === 'Initial' && repoInfoResult.waiting,
  }
}

/**
 * Hook for commit graph with refresh and config.
 */
export function useCommitGraph(repoPath: string, config: GraphConfig) {
  const commitGraphResult = useAtomValue(commitGraphAtom({ repoPath, config }))

  return {
    commitGraphResult,
    graph: Result.match(commitGraphResult, {
      onSuccess: (data) => data.value,
      onFailure: () => null,
      onInitial: () => null,
    }),
    isLoading: commitGraphResult._tag === 'Initial' && commitGraphResult.waiting,
    isRefreshing: commitGraphResult._tag === 'Success' && commitGraphResult.waiting,
  }
}

/**
 * Hook for commit details.
 */
export function useCommitDetails(repoPath: string, commitHash: string) {
  const commitDetailsResult = useAtomValue(commitDetailsAtom({ repoPath, commitHash }))

  return {
    commitDetailsResult,
    details: Result.match(commitDetailsResult, {
      onSuccess: (data) => data.value,
      onFailure: () => null,
      onInitial: () => null,
    }),
    isLoading: commitDetailsResult._tag === 'Initial' && commitDetailsResult.waiting,
  }
}

/**
 * Hook for branch operations.
 */
export function useBranchOperations(repoPath: string) {
  const createBranch = useSetAtom(createBranchAtom)
  const deleteBranch = useSetAtom(deleteBranchAtom)
  const checkout = useSetAtom(checkoutAtom)

  return {
    createBranch: (branchName: string, startPoint?: string) =>
      createBranch({ repoPath, branchName, startPoint }),
    deleteBranch: (branchName: string, force: boolean = false) =>
      deleteBranch({ repoPath, branchName, force }),
    checkout: (ref: string) =>
      checkout({ repoPath, ref }),
  }
}
```

---

## Phase 6: Graph Visualization (UI)

### 6.1 Graph Renderer

**File: src/renderer/components/git-tree/GraphCanvas.tsx**
```typescript
import React, { useEffect, useRef } from 'react'
import { CommitGraph, GraphNode, GraphEdge } from '../../../shared/schemas/git-tree'

interface GraphCanvasProps {
  graph: CommitGraph
  onNodeClick?: (commitHash: string) => void
  selectedCommit?: string
}

/**
 * Canvas-based commit graph renderer.
 * Uses HTML Canvas for performance with large graphs.
 */
export function GraphCanvas({ graph, onNodeClick, selectedCommit }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Render edges
    graph.edges.forEach((edge) => {
      renderEdge(ctx, edge, graph.nodes)
    })

    // Render nodes
    graph.nodes.forEach((node) => {
      renderNode(ctx, node, node.commit.hash === selectedCommit)
    })
  }, [graph, selectedCommit])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onNodeClick) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Find clicked node
    const clickedNode = graph.nodes.find((node) => {
      const nodeX = node.x * 50 + 25 // Column * spacing + offset
      const nodeY = node.y * 40 + 25 // Row * spacing + offset
      const distance = Math.sqrt((x - nodeX) ** 2 + (y - nodeY) ** 2)
      return distance < 10 // Node radius
    })

    if (clickedNode) {
      onNodeClick(clickedNode.commit.hash)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={graph.metadata.maxColumn * 50 + 50}
      height={graph.nodes.length * 40 + 50}
      onClick={handleCanvasClick}
      className="git-graph-canvas"
    />
  )
}

function renderNode(ctx: CanvasRenderingContext2D, node: GraphNode, selected: boolean) {
  const x = node.x * 50 + 25
  const y = node.y * 40 + 25

  // Draw commit circle
  ctx.beginPath()
  ctx.arc(x, y, 8, 0, 2 * Math.PI)
  ctx.fillStyle = selected ? '#0066ff' : node.color
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = selected ? 2 : 1
  ctx.stroke()

  // Draw refs (branches, tags) next to node
  if (node.refs.length > 0) {
    const refX = x + 15
    let refY = y - 10

    node.refs.forEach((ref) => {
      ctx.fillStyle = ref.type === 'branch' ? '#28a745' : ref.type === 'tag' ? '#ffc107' : '#6c757d'
      ctx.fillRect(refX, refY, 60, 20)
      ctx.fillStyle = '#fff'
      ctx.font = '12px sans-serif'
      ctx.fillText(ref.name, refX + 5, refY + 14)
      refY += 25
    })
  }

  // Draw commit message (truncated)
  ctx.fillStyle = '#333'
  ctx.font = '12px sans-serif'
  const message = node.commit.subject.substring(0, 40)
  ctx.fillText(message, x + 15 + (node.refs.length > 0 ? 70 : 0), y + 4)
}

function renderEdge(ctx: CanvasRenderingContext2D, edge: GraphEdge, nodes: GraphNode[]) {
  const fromNode = nodes.find((n) => n.commit.hash === edge.from)
  const toNode = nodes.find((n) => n.commit.hash === edge.to)

  if (!fromNode || !toNode) return

  const x1 = fromNode.x * 50 + 25
  const y1 = fromNode.y * 40 + 25
  const x2 = toNode.x * 50 + 25
  const y2 = toNode.y * 40 + 25

  ctx.beginPath()
  ctx.moveTo(x1, y1)

  if (edge.type === 'merge') {
    // Curved line for merges
    const cpX = (x1 + x2) / 2
    const cpY = (y1 + y2) / 2
    ctx.quadraticCurveTo(cpX, cpY, x2, y2)
  } else {
    // Straight line
    ctx.lineTo(x2, y2)
  }

  ctx.strokeStyle = edge.color
  ctx.lineWidth = 2
  ctx.stroke()
}
```

### 6.2 Commit Details Panel

**File: src/renderer/components/git-tree/CommitDetailsPanel.tsx**
```typescript
import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useCommitDetails } from '../../hooks/useGitTree'
import { CommitFile } from '../../../shared/schemas/git-tree'

interface CommitDetailsPanelProps {
  repoPath: string
  commitHash: string
}

/**
 * Panel displaying detailed commit information.
 */
export function CommitDetailsPanel({ repoPath, commitHash }: CommitDetailsPanelProps) {
  const { commitDetailsResult } = useCommitDetails(repoPath, commitHash)

  return Result.builder(commitDetailsResult)
    .onInitial(() => (
      <div className="commit-details-loading">
        <span>Loading commit details...</span>
      </div>
    ))
    .onErrorTag('CommitNotFoundError', (error) => (
      <div className="commit-details-error">
        <p>Commit not found: {error.message}</p>
      </div>
    ))
    .onErrorTag('GitCommandError', (error) => (
      <div className="commit-details-error">
        <p>Failed to load commit: {error.message}</p>
      </div>
    ))
    .onDefect((defect) => (
      <div className="commit-details-error">
        <p>Unexpected error: {String(defect)}</p>
      </div>
    ))
    .onSuccess((data) => {
      const details = data.value
      return (
        <div className="commit-details-panel">
          <div className="commit-header">
            <h3>{details.commit.subject}</h3>
            <code>{details.commit.hash.substring(0, 8)}</code>
          </div>

          <div className="commit-meta">
            <div>
              <strong>Author:</strong> {details.commit.author} &lt;{details.commit.authorEmail}&gt;
            </div>
            <div>
              <strong>Date:</strong> {new Date(details.commit.authorDate * 1000).toLocaleString()}
            </div>
            <div>
              <strong>Committer:</strong> {details.commit.committer} &lt;{details.commit.committerEmail}&gt;
            </div>
          </div>

          <div className="commit-message">
            <pre>{details.commit.message}</pre>
          </div>

          <div className="commit-stats">
            <span>{details.stats.filesChanged} files changed</span>
            <span className="additions">+{details.stats.insertions}</span>
            <span className="deletions">-{details.stats.deletions}</span>
          </div>

          <div className="commit-files">
            <h4>Changed Files</h4>
            <CommitFileList files={details.files} />
          </div>
        </div>
      )
    })
    .render()
}

function CommitFileList({ files }: { files: CommitFile[] }) {
  return (
    <ul className="file-list">
      {files.map((file) => (
        <li key={file.path} className={`file-item status-${file.status}`}>
          <span className="file-status">{file.status}</span>
          <span className="file-path">{file.path}</span>
          <span className="file-stats">
            <span className="additions">+{file.additions}</span>
            <span className="deletions">-{file.deletions}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
```

### 6.3 Repository Browser

**File: src/renderer/components/git-tree/RepositoryBrowser.tsx**
```typescript
import React, { useState } from 'react'
import { Result } from '@effect-atom/atom-react'
import { useRepositories, useCommitGraph, useBranchOperations } from '../../hooks/useGitTree'
import { GraphCanvas } from './GraphCanvas'
import { CommitDetailsPanel } from './CommitDetailsPanel'
import { BranchList } from './BranchList'
import { GraphConfig } from '../../../shared/schemas/git-tree'

/**
 * Main Git Tree repository browser component.
 */
export function RepositoryBrowser() {
  const { repositoriesResult } = useRepositories()
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [graphConfig, setGraphConfig] = useState<GraphConfig>({
    maxCommits: 1000,
    showTags: true,
    showRemotes: true,
    showStashes: true,
    showUncommitted: true,
    branchOrder: 'date',
  })

  return (
    <div className="git-tree-browser">
      {/* Repository selector */}
      {Result.builder(repositoriesResult)
        .onInitial(() => <div>Loading repositories...</div>)
        .onErrorTag('RepositoryDiscoveryError', (error) => (
          <div>Failed to discover repositories: {error.message}</div>
        ))
        .onDefect((defect) => <div>Unexpected error: {String(defect)}</div>)
        .onSuccess((data) => {
          const repos = data.value
          if (repos.length === 0) {
            return <div>No Git repositories found in workspace</div>
          }

          const currentRepo = selectedRepo || repos[0].workingDirectory
          if (selectedRepo === null) {
            setSelectedRepo(currentRepo)
          }

          return <RepositoryView
            repoPath={currentRepo}
            repositories={repos}
            onRepoChange={setSelectedRepo}
            graphConfig={graphConfig}
            onGraphConfigChange={setGraphConfig}
            selectedCommit={selectedCommit}
            onCommitSelect={setSelectedCommit}
          />
        })
        .render()}
    </div>
  )
}

interface RepositoryViewProps {
  repoPath: string
  repositories: Repository[]
  onRepoChange: (path: string) => void
  graphConfig: GraphConfig
  onGraphConfigChange: (config: GraphConfig) => void
  selectedCommit: string | null
  onCommitSelect: (hash: string | null) => void
}

function RepositoryView({
  repoPath,
  repositories,
  onRepoChange,
  graphConfig,
  onGraphConfigChange,
  selectedCommit,
  onCommitSelect,
}: RepositoryViewProps) {
  const { commitGraphResult } = useCommitGraph(repoPath, graphConfig)

  return (
    <div className="repository-view">
      {/* Control bar */}
      <div className="control-bar">
        <select
          value={repoPath}
          onChange={(e) => onRepoChange(e.target.value)}
          className="repo-selector"
        >
          {repositories.map((repo) => (
            <option key={repo.id} value={repo.workingDirectory}>
              {repo.name}
            </option>
          ))}
        </select>

        <GraphConfigControls config={graphConfig} onChange={onGraphConfigChange} />
      </div>

      {/* Main content: graph + details */}
      <div className="content-area">
        {/* Left: Commit graph */}
        <div className="graph-area">
          {Result.builder(commitGraphResult)
            .onInitial(() => <div>Loading commit graph...</div>)
            .onErrorTag('GraphBuildError', (error) => (
              <div>Failed to build graph: {error.message}</div>
            ))
            .onDefect((defect) => <div>Unexpected error: {String(defect)}</div>)
            .onSuccess((data) => {
              const graph = data.value
              return <GraphCanvas
                graph={graph}
                selectedCommit={selectedCommit || undefined}
                onNodeClick={onCommitSelect}
              />
            })
            .render()}
        </div>

        {/* Right: Commit details */}
        {selectedCommit && (
          <div className="details-area">
            <CommitDetailsPanel repoPath={repoPath} commitHash={selectedCommit} />
          </div>
        )}
      </div>
    </div>
  )
}

function GraphConfigControls({ config, onChange }: {
  config: GraphConfig
  onChange: (config: GraphConfig) => void
}) {
  return (
    <div className="graph-config">
      <label>
        <input
          type="checkbox"
          checked={config.showTags}
          onChange={(e) => onChange({ ...config, showTags: e.target.checked })}
        />
        Show Tags
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.showRemotes}
          onChange={(e) => onChange({ ...config, showRemotes: e.target.checked })}
        />
        Show Remotes
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.showStashes}
          onChange={(e) => onChange({ ...config, showStashes: e.target.checked })}
        />
        Show Stashes
      </label>
      <label>
        Max Commits:
        <input
          type="number"
          value={config.maxCommits}
          onChange={(e) => onChange({ ...config, maxCommits: parseInt(e.target.value) })}
          min={100}
          max={10000}
          step={100}
        />
      </label>
    </div>
  )
}
```

---

## Integration with Source Control Domain

### How This Plan Evolves

The Git Tree visualization is now a key component of the unified source-control domain:

1. **Repository Management**: The `RepositoryService` handles discovery and state management for all git repositories, providing the foundation for the Git Tree UI.

2. **Commit Graph Building**: The `CommitGraphService` implements the graph construction algorithms, caching, and incremental updates described in this plan.

3. **Git Operations**: The `GitWorkflowService` provides high-level git operations (merge, rebase, cherry-pick) that the Git Tree UI can invoke.

4. **Provider Integration**: The `ProviderPort` abstraction allows Git Tree to work with repositories from GitHub, GitLab, and Bitbucket seamlessly.

5. **UI Components**: The Git Tree visualization components (`CommitGraph.tsx`, `RepositoryExplorer.tsx`) are part of the source-control UI module.

### Benefits of the Unified Architecture

- **Shared Infrastructure**: Git command execution, file system operations, and caching are shared across all source-control features
- **Consistent Patterns**: All components follow the same hexagonal architecture and Effect patterns
- **Better Testing**: Port-based design enables comprehensive testing with mocks
- **Extensibility**: Easy to add new git operations, providers, or UI features
- **Performance**: Shared caching and optimizations benefit all features

### Implementation Priority

In the new architecture, Git Tree features are implemented in this order:

1. **Week 1**: Core domain model and ports (foundation for all features)
2. **Week 2**: Repository discovery and commit graph building (core Git Tree functionality)
3. **Week 3**: IPC integration and provider abstraction (connect to UI and online repos)
4. **Week 4**: UI components including the commit graph visualization

## Success Criteria

1. **Repository Discovery**: Automatically discover all Git repositories in workspace ✓
2. **Graph Rendering**: Display commit graph with branches/tags for repos with 1000+ commits ✓
3. **Performance**: Graph updates complete in <500ms for typical repos ✓
4. **Type Safety**: Zero `any` types, full Effect pattern usage ✓
5. **Error Handling**: <5% defect rate, all errors typed and handled ✓
6. **Git Operations**: All basic operations work (checkout, merge, rebase, cherry-pick) ✓
7. **Multi-Repo**: Support multiple repositories simultaneously ✓
8. **Real-time Updates**: Graph updates automatically on Git operations ✓

---

## Key Implementation Notes

### Hexagonal Architecture Benefits
- **Testability**: Mock ports to test services without real Git
- **Flexibility**: Swap Git implementation (e.g., use libgit2 in future)
- **Clarity**: Clear separation between domain logic and infrastructure

### Effect Patterns Applied
- ✅ `Effect.gen` for all async flows
- ✅ `Effect.Service` pattern for dependency injection
- ✅ `Stream` for parsing large Git log output
- ✅ `Ref` for caching graphs
- ✅ `Scope` for resource management
- ✅ Effect Schema for parsing (not validation)

### Parse, Don't Validate
- All Git output is parsed using Effect Schema
- Schemas define both structure and validation
- Type inference from schemas (no manual type definitions)

### Structured Concurrency
- All background work scoped with `Effect.forkScoped`
- No `forkDaemon` usage
- File watchers use Stream with automatic cleanup

### Performance Considerations
- Stream-based Git log parsing for large repos
- Incremental graph updates (not full rebuild)
- Canvas rendering for 1000+ commits
- TTL caching for expensive operations

---

## References

- Git Graph Extension: https://github.com/mhutchie/vscode-git-graph
- Effect Documentation: https://effect.website
- Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/
- Git Log Format: https://git-scm.com/docs/git-log
- Effect Schema: https://effect.website/docs/schema/introduction
- Structured Concurrency: https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/
