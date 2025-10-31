# AI Watcher UI Enhancement Plan

## Overview

Add comprehensive AI watcher management features to the repository interface:
1. **Issues Integration**: Fetch and display repository issues from GitHub
2. **Issue Shortlisting**: Keyboard-driven modal for selecting focus issues
3. **AI Watcher Launching**: Launch AI agents (claude-code/codex) from shortlisted issues
4. **Status Indicators**: Beautiful LED-style indicators showing active watcher states

**Status**: Not Started
**Target Completion**: 1-2 days
**Primary Goal**: Enhance repository workflow with AI-powered issue tracking and visual watcher monitoring

---

## Architecture Principles

### Hexagonal Architecture (Ports & Adapters)

**CRITICAL**: Follow hexagonal architecture patterns for the GitHub Issues domain.

**Pattern**:
```
Port (interface) → Schema (types) → Adapter (Service) → Domain Service → IPC → Atoms → UI
```

**Example Structure** (following AI providers pattern):
```
src/main/github/issues/
├── ports.ts              # IssuePort interface
├── schemas.ts            # Issue schemas (or in shared/)
├── adapter.ts            # GitHubIssueAdapter extends Effect.Service
├── issue-service.ts      # IssueService for orchestration
└── errors.ts             # Domain-specific errors

src/shared/schemas/github/
└── issue.ts              # Issue, IssueComment schemas

src/main/ipc/
└── github-issue-handlers.ts  # IPC handlers

src/renderer/atoms/
└── github-issue-atoms.ts     # Issue state atoms
```

### Effect Patterns

**Schema Usage**: ALWAYS use `Schema.parse` (never validate/decode directly)
```typescript
const issue = yield* Schema.decode(IssueSchema)(rawData)  // ❌ WRONG
const issue = Schema.parse(IssueSchema, rawData)          // ✅ CORRECT
```

**Error Handling**: Use tagged errors with Effect
```typescript
class IssueNotFoundError extends Data.TaggedError('IssueNotFoundError')<{
  issueNumber: number
  repositoryId: string
}> {}
```

**Service Pattern**: Extend Effect.Service
```typescript
export class IssueService extends Effect.Service<IssueService>()('IssueService', {
  effect: Effect.gen(function* () {
    const adapter = yield* GitHubIssueAdapter
    // implementation
  }),
  dependencies: [GitHubIssueAdapter.Default]
}) {}
```

### UI Patterns

**Result.builder**: Type-safe error rendering
```typescript
Result.builder(issuesResult)
  .onInitial(() => <Spinner />)
  .onErrorTag('NotFoundError', (error) => <NotFound />)
  .onSuccess((issues) => <IssueList issues={issues} />)
  .render()
```

**Keyboard Shortcuts**: Use dedicated hook (see git-tree-ui)
```typescript
useKeyboardShortcuts({
  onToggleShortlist: () => toggleIssue(issue.id),
  onLaunchWatcher: () => launchWatcher(),
  onClose: () => onClose(),
})
```

**Glassy UI**: Follow AIUsageBars pattern
- Glassmorphism with `backdrop-blur-xl`
- Subtle gradients and borders
- Color-coded status (green/yellow/unlit)
- Provider favicons

---

## Phase 1: Backend - GitHub Issues Integration

**Duration**: 2-3 hours
**Risk**: Low
**Impact**: Enables issue fetching via hexagonal architecture

### 1.1 Define Issue Port & Schemas

**File**: `src/main/github/issues/ports.ts`
```typescript
import { Effect } from 'effect'
import type { Issue, IssueComment } from './schemas'

export interface IssuePort {
  /**
   * List issues for a repository
   */
  listIssues(params: {
    owner: string
    repo: string
    state?: 'open' | 'closed' | 'all'
    labels?: string[]
    assignee?: string
    limit?: number
  }): Effect.Effect<readonly Issue[], IssueError>

  /**
   * Get a specific issue by number
   */
  getIssue(params: {
    owner: string
    repo: string
    issueNumber: number
  }): Effect.Effect<Issue, IssueError | IssueNotFoundError>

  /**
   * List comments for an issue
   */
  listComments(params: {
    owner: string
    repo: string
    issueNumber: number
  }): Effect.Effect<readonly IssueComment[], IssueError>
}
```

**File**: `src/shared/schemas/github/issue.ts`
```typescript
import { Schema } from 'effect'

export class Issue extends Schema.Class<Issue>('Issue')({
  number: Schema.Number,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  state: Schema.Literal('open', 'closed'),
  labels: Schema.Array(Schema.Struct({
    name: Schema.String,
    color: Schema.String,
  })),
  assignees: Schema.Array(Schema.Struct({
    login: Schema.String,
    avatarUrl: Schema.String,
  })),
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
  url: Schema.String,
}) {}

export class IssueComment extends Schema.Class<IssueComment>('IssueComment')({
  id: Schema.Number,
  body: Schema.String,
  author: Schema.Struct({
    login: Schema.String,
    avatarUrl: Schema.String,
  }),
  createdAt: Schema.DateFromString,
}) {}
```

**File**: `src/main/github/issues/errors.ts`
```typescript
import { Data } from 'effect'

export class IssueError extends Data.TaggedError('IssueError')<{
  message: string
  cause?: unknown
}> {}

export class IssueNotFoundError extends Data.TaggedError('IssueNotFoundError')<{
  issueNumber: number
  owner: string
  repo: string
}> {}
```

### 1.2 Create GitHub Issue Adapter

**File**: `src/main/github/issues/adapter.ts`
```typescript
import { Effect, Schema } from 'effect'
import type { IssuePort } from './ports'
import { Issue, IssueComment } from '../../../shared/schemas/github/issue'
import { GitHubHttpService } from '../http-service'
import { IssueError, IssueNotFoundError } from './errors'

export class GitHubIssueAdapter extends Effect.Service<GitHubIssueAdapter>()(
  'GitHubIssueAdapter',
  {
    effect: Effect.gen(function* () {
      const httpService = yield* GitHubHttpService

      const adapter: IssuePort = {
        listIssues: (params) =>
          Effect.gen(function* () {
            const queryParams = new URLSearchParams({
              state: params.state ?? 'open',
              per_page: String(params.limit ?? 100),
            })

            if (params.labels?.length) {
              queryParams.set('labels', params.labels.join(','))
            }

            const url = `/repos/${params.owner}/${params.repo}/issues?${queryParams}`
            const issues = yield* httpService.makeRequest(
              url,
              Schema.Array(Issue)
            ).pipe(
              Effect.mapError((error) =>
                new IssueError({
                  message: `Failed to fetch issues: ${error}`,
                  cause: error,
                })
              )
            )

            return issues
          }),

        getIssue: (params) =>
          Effect.gen(function* () {
            const url = `/repos/${params.owner}/${params.repo}/issues/${params.issueNumber}`
            const issue = yield* httpService.makeRequest(url, Issue).pipe(
              Effect.mapError((error) => {
                // Map 404 to IssueNotFoundError
                if (error._tag === 'NotFoundError') {
                  return new IssueNotFoundError({
                    issueNumber: params.issueNumber,
                    owner: params.owner,
                    repo: params.repo,
                  })
                }
                return new IssueError({
                  message: `Failed to fetch issue: ${error}`,
                  cause: error,
                })
              })
            )

            return issue
          }),

        listComments: (params) =>
          Effect.gen(function* () {
            const url = `/repos/${params.owner}/${params.repo}/issues/${params.issueNumber}/comments`
            const comments = yield* httpService.makeRequest(
              url,
              Schema.Array(IssueComment)
            ).pipe(
              Effect.mapError((error) =>
                new IssueError({
                  message: `Failed to fetch comments: ${error}`,
                  cause: error,
                })
              )
            )

            return comments
          }),
      }

      return adapter
    }),
    dependencies: [GitHubHttpService.Default],
  }
) {}
```

### 1.3 Create Issue Service

**File**: `src/main/github/issues/issue-service.ts`
```typescript
import { Effect } from 'effect'
import { GitHubIssueAdapter } from './adapter'
import type { Issue } from '../../../shared/schemas/github/issue'

export class IssueService extends Effect.Service<IssueService>()(
  'IssueService',
  {
    effect: Effect.gen(function* () {
      const issueAdapter = yield* GitHubIssueAdapter

      return {
        listRepositoryIssues: (params: {
          owner: string
          repo: string
          state?: 'open' | 'closed' | 'all'
        }) => issueAdapter.listIssues(params),

        getIssueDetails: (params: {
          owner: string
          repo: string
          issueNumber: number
        }) => issueAdapter.getIssue(params),
      }
    }),
    dependencies: [GitHubIssueAdapter.Default],
  }
) {}
```

### 1.4 Create IPC Contracts & Handlers

**File**: `src/shared/ipc-contracts.ts` (add to existing exports)
```typescript
export namespace GitHubIssueIpcContracts {
  export const listRepositoryIssues = IpcContract.make(
    'github:list-repository-issues',
    {
      input: Schema.Struct({
        owner: Schema.String,
        repo: Schema.String,
        state: Schema.optional(Schema.Literal('open', 'closed', 'all')),
      }),
      output: Schema.Array(Issue),
      errors: Schema.Union(
        IssueError,
        NetworkError,
        AuthenticationError
      ),
    }
  )

  export const getIssue = IpcContract.make('github:get-issue', {
    input: Schema.Struct({
      owner: Schema.String,
      repo: Schema.String,
      issueNumber: Schema.Number,
    }),
    output: Issue,
    errors: Schema.Union(
      IssueError,
      IssueNotFoundError,
      NetworkError,
      AuthenticationError
    ),
  })
}
```

**File**: `src/main/ipc/github-issue-handlers.ts`
```typescript
import { GitHubIssueIpcContracts } from '../../shared/ipc-contracts'
import { IssueService } from '../github/issues/issue-service'
import { registerIpcHandler } from './ipc-handler-setup'

export function registerGitHubIssueHandlers() {
  registerIpcHandler(
    GitHubIssueIpcContracts.listRepositoryIssues,
    (input) =>
      Effect.gen(function* () {
        const issueService = yield* IssueService
        return yield* issueService.listRepositoryIssues(input)
      })
  )

  registerIpcHandler(
    GitHubIssueIpcContracts.getIssue,
    (input) =>
      Effect.gen(function* () {
        const issueService = yield* IssueService
        return yield* issueService.getIssueDetails(input)
      })
  )
}
```

**File**: `src/main/ipc/setup.ts` (add to existing handler registration)
```typescript
import { registerGitHubIssueHandlers } from './github-issue-handlers'

export function registerAllIpcHandlers() {
  // ... existing handlers
  registerGitHubIssueHandlers()
}
```

### 1.5 Update Main Layer

**File**: `src/main/index.ts` (add to MainLayer)
```typescript
import { IssueService } from './github/issues/issue-service'
import { GitHubIssueAdapter } from './github/issues/adapter'

const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,

  // GitHub domain
  Layer.mergeAll(
    GitHubApiService.Default,
    IssueService.Default,
    GitHubIssueAdapter.Default,
  ),

  // ... rest of layers
)
```

### 1.6 Create Issue Atoms

**File**: `src/renderer/atoms/github-issue-atoms.ts`
```typescript
import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { GitHubIssueClient } from '../lib/ipc-client'

const issueRuntime = Atom.runtime(GitHubIssueClient.Default)

/**
 * List issues for a repository
 */
export const repositoryIssuesAtom = Atom.family(
  (params: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' }) =>
    issueRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* GitHubIssueClient
          return yield* client.listRepositoryIssues(params)
        })
      )
      .pipe(
        Atom.withReactivity(['github:issues', params.owner, params.repo]),
        Atom.setIdleTTL(Duration.minutes(5))
      )
)

/**
 * Get specific issue details
 */
export const issueDetailsAtom = Atom.family(
  (params: { owner: string; repo: string; issueNumber: number }) =>
    issueRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* GitHubIssueClient
          return yield* client.getIssue(params)
        })
      )
      .pipe(
        Atom.withReactivity(['github:issue', params.owner, params.repo, params.issueNumber]),
        Atom.setIdleTTL(Duration.minutes(10))
      )
)
```

### 1.7 Create IPC Client

**File**: `src/renderer/lib/ipc-client.ts` (add to existing clients)
```typescript
import { GitHubIssueIpcContracts } from '../../shared/ipc-contracts'

export const GitHubIssueClient = Effect.Service.make(
  Effect.Service.Tag<GitHubIssueClient>()('GitHubIssueClient'),
  {
    listRepositoryIssues: (params: {
      owner: string
      repo: string
      state?: 'open' | 'closed' | 'all'
    }) => electronIpcClient.invoke(GitHubIssueIpcContracts.listRepositoryIssues, params),

    getIssue: (params: {
      owner: string
      repo: string
      issueNumber: number
    }) => electronIpcClient.invoke(GitHubIssueIpcContracts.getIssue, params),
  }
).Default
```

### 1.8 Testing

```bash
# Compile and verify types
pnpm compile:app

# Run app and test issue fetching
pnpm dev

# Manual verification:
# - Open repository dropdown
# - Click "View Issues" button
# - Verify issues load from GitHub
```

**Success Criteria**:
- ✅ Hexagonal architecture implemented
- ✅ All types compile
- ✅ Issues fetch from GitHub API
- ✅ Error handling works correctly
- ✅ Atoms reactive and cached

---

## Phase 2: Issues Modal UI

**Duration**: 2-3 hours
**Risk**: Low
**Impact**: UI for viewing and shortlisting issues

### 2.1 Add Button to RepositoryDropdown

**File**: `src/renderer/components/ui/RepositoryDropdown.tsx`

Add new menu item after "Clone to Workspace":
```typescript
import { ListTodo } from 'lucide-react'

// In the Actions Menu section:
<MenuItem
  icon={ListTodo}
  label="View Issues"
  onClick={() => {
    setShowIssuesModal(true)
    onOpenChange(false) // Close dropdown
  }}
/>
```

### 2.2 Create Issues Modal Component

**File**: `src/renderer/components/ai-watchers/IssuesModal.tsx`
```typescript
import { useState, useEffect } from 'react'
import { useAtomValue } from '@effect-atom/atom-react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, Zap } from 'lucide-react'
import { repositoryIssuesAtom } from '../../atoms/github-issue-atoms'
import type { Issue } from '../../../shared/schemas/github/issue'

interface IssuesModalProps {
  isOpen: boolean
  onClose: () => void
  owner: string
  repo: string
  onLaunchWatchers: (issueIds: number[]) => void
}

export function IssuesModal({
  isOpen,
  onClose,
  owner,
  repo,
  onLaunchWatchers,
}: IssuesModalProps) {
  const [shortlist, setShortlist] = useState<Set<number>>(new Set())
  const issuesResult = useAtomValue(repositoryIssuesAtom({ owner, repo, state: 'open' }))

  // Keyboard shortcuts
  useKeyboardShortcuts({
    enabled: isOpen,
    onClose,
    onToggleShortlist: (issueNumber: number) => {
      setShortlist(prev => {
        const next = new Set(prev)
        if (next.has(issueNumber)) {
          next.delete(issueNumber)
        } else {
          next.add(issueNumber)
        }
        return next
      })
    },
    onLaunch: () => {
      if (shortlist.size > 0) {
        onLaunchWatchers(Array.from(shortlist))
        onClose()
      }
    },
  })

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
          >
            <div className="w-full max-w-4xl h-[80vh] bg-gray-900/95 border border-gray-700/50 rounded-lg shadow-2xl backdrop-blur-xl pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Issues: {owner}/{repo}
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Press Space to add to shortlist • Enter to launch watchers
                  </p>
                </div>
                <button
                  className="p-2 hover:bg-gray-800 rounded transition-colors"
                  onClick={onClose}
                  type="button"
                >
                  <X className="size-5 text-gray-400" />
                </button>
              </div>

              {/* Issue List */}
              <div className="overflow-y-auto h-[calc(100%-8rem)] p-4">
                {Result.builder(issuesResult)
                  .onInitial(() => <div className="text-center py-8 text-gray-400">Loading issues...</div>)
                  .onErrorTag('IssueError', (error) => (
                    <div className="text-center py-8 text-red-400">
                      Error loading issues: {error.message}
                    </div>
                  ))
                  .onSuccess((issues) => (
                    <div className="space-y-2">
                      {issues.map((issue) => (
                        <IssueRow
                          key={issue.number}
                          issue={issue}
                          isShortlisted={shortlist.has(issue.number)}
                          onToggle={() => {
                            setShortlist(prev => {
                              const next = new Set(prev)
                              if (next.has(issue.number)) {
                                next.delete(issue.number)
                              } else {
                                next.add(issue.number)
                              }
                              return next
                            })
                          }}
                        />
                      ))}
                    </div>
                  ))
                  .render()}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-700/50 flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  {shortlist.size} issue{shortlist.size !== 1 ? 's' : ''} shortlisted
                </div>
                <button
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  disabled={shortlist.size === 0}
                  onClick={() => {
                    onLaunchWatchers(Array.from(shortlist))
                    onClose()
                  }}
                  type="button"
                >
                  <Zap className="size-4" />
                  Launch AI Watchers
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

interface IssueRowProps {
  issue: Issue
  isShortlisted: boolean
  onToggle: () => void
}

function IssueRow({ issue, isShortlisted, onToggle }: IssueRowProps) {
  return (
    <button
      className={`w-full p-3 rounded border transition-all text-left ${
        isShortlisted
          ? 'bg-teal-500/10 border-teal-500/50'
          : 'bg-gray-800/30 border-gray-700/30 hover:border-gray-600/50'
      }`}
      onClick={onToggle}
      type="button"
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div
          className={`mt-0.5 size-5 rounded border-2 flex items-center justify-center transition-colors ${
            isShortlisted
              ? 'bg-teal-500 border-teal-500'
              : 'border-gray-600'
          }`}
        >
          {isShortlisted && <Check className="size-3 text-white" />}
        </div>

        {/* Issue Content */}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-white">
              #{issue.number} {issue.title}
            </h3>
          </div>
          {issue.body && (
            <p className="text-sm text-gray-400 mt-1 line-clamp-2">
              {issue.body}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {issue.labels.map((label) => (
              <span
                key={label.name}
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: `#${label.color}20`,
                  color: `#${label.color}`,
                  borderColor: `#${label.color}40`,
                  borderWidth: '1px',
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  )
}
```

### 2.3 Create Keyboard Shortcuts Hook

**File**: `src/renderer/hooks/useIssueModalKeyboardShortcuts.ts`
```typescript
import { useEffect } from 'react'

interface ShortcutHandlers {
  enabled: boolean
  onClose: () => void
  onToggleShortlist: (issueNumber: number) => void
  onLaunch: () => void
}

export function useKeyboardShortcuts({
  enabled,
  onClose,
  onToggleShortlist,
  onLaunch,
}: ShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break
        case 'Enter':
          e.preventDefault()
          onLaunch()
          break
        // Space handled in IssueRow onClick
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onClose, onLaunch])
}
```

### 2.4 Testing

```bash
# Run app
pnpm dev

# Manual verification:
# - Open repository dropdown
# - Click "View Issues"
# - Modal appears with issues
# - Press Space on issue to add to shortlist
# - Verify checkbox toggles
# - Verify shortlist counter updates
# - Press Escape to close
```

**Success Criteria**:
- ✅ Modal opens from dropdown
- ✅ Issues display correctly
- ✅ Keyboard shortcuts work
- ✅ Shortlist updates correctly
- ✅ UI matches AIUsageBars aesthetic

---

## Phase 3: AI Watcher Integration with Git Worktrees

**Duration**: 2-3 hours
**Risk**: Medium (git operations)
**Impact**: Launch watchers from shortlisted issues in isolated worktrees

**Key Workflow**: Each AI watcher runs in a dedicated git worktree with a branch named `issue#<number>`. If the branch doesn't exist, it's created from the default branch. This ensures complete isolation between issues.

### 3.1 Fix Command Bug

**File**: `src/main/ai-watchers/ai-watcher-service.ts`

**Current Bug**: Line 56-57
```typescript
case 'claude-code':
  return { command: 'claude-code' }  // ❌ WRONG - bash process is 'claude'
```

**Fix**:
```typescript
case 'claude-code':
  return { command: 'claude' }  // ✅ CORRECT - actual bash command
```

### 3.2 Add Git Worktree Operations

**File**: `src/shared/ipc-contracts.ts` (add to SourceControlIpcContracts)
```typescript
export const SourceControlIpcContracts = {
  // ... existing contracts

  'source-control:create-worktree-for-issue': {
    channel: 'source-control:create-worktree-for-issue' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      issueNumber: S.Number,
      baseBranch: S.optional(S.String), // defaults to main/master
    }),
    output: S.Struct({
      worktreePath: S.String,
      branchName: S.String,
      branchExisted: S.Boolean,
    }),
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:remove-worktree': {
    channel: 'source-control:remove-worktree' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
      worktreePath: S.String,
    }),
    output: S.Void,
    errors: S.Union(NotFoundError, GitOperationError),
  },

  'source-control:list-worktrees': {
    channel: 'source-control:list-worktrees' as const,
    input: S.Struct({
      repositoryId: RepositoryId,
    }),
    output: S.Array(
      S.Struct({
        path: S.String,
        branch: S.String,
        head: S.String,
      })
    ),
    errors: S.Union(NotFoundError, GitOperationError),
  },
} as const
```

**File**: `src/main/source-control/git-command-service.ts` (add methods)
```typescript
export class GitCommandService extends Effect.Service<GitCommandService>() {
  // ... existing methods

  /**
   * Create a git worktree for an issue
   * Branch naming: issue#<number>
   * Creates branch from baseBranch if it doesn't exist
   */
  createWorktreeForIssue: (params: {
    repositoryPath: string
    issueNumber: number
    baseBranch?: string
  }) =>
    Effect.gen(function* () {
      const branchName = `issue#${params.issueNumber}`
      const worktreePath = path.join(
        params.repositoryPath,
        '..',
        `worktree-${branchName}`
      )

      // Check if branch exists
      const branchExists = yield* Effect.tryPromise({
        try: () =>
          execPromise(`git -C "${params.repositoryPath}" rev-parse --verify ${branchName}`)
            .then(() => true)
            .catch(() => false),
        catch: () => new GitOperationError({ message: 'Failed to check branch' }),
      })

      if (branchExists) {
        // Branch exists - create worktree from existing branch
        yield* Effect.tryPromise({
          try: () =>
            execPromise(
              `git -C "${params.repositoryPath}" worktree add "${worktreePath}" ${branchName}`
            ),
          catch: (error) =>
            new GitOperationError({
              message: `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`,
            }),
        })
      } else {
        // Branch doesn't exist - create from base branch
        const baseBranch =
          params.baseBranch ??
          (yield* Effect.tryPromise({
            try: () =>
              execPromise(
                `git -C "${params.repositoryPath}" symbolic-ref refs/remotes/origin/HEAD`
              ).then((out) => out.trim().replace('refs/remotes/origin/', '')),
            catch: () => 'main', // fallback to 'main'
          }))

        yield* Effect.tryPromise({
          try: () =>
            execPromise(
              `git -C "${params.repositoryPath}" worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`
            ),
          catch: (error) =>
            new GitOperationError({
              message: `Failed to create worktree with new branch: ${error instanceof Error ? error.message : String(error)}`,
            }),
        })
      }

      return {
        worktreePath,
        branchName,
        branchExisted: branchExists,
      }
    }),

  /**
   * Remove a git worktree
   */
  removeWorktree: (worktreePath: string) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => execPromise(`git worktree remove "${worktreePath}" --force`),
        catch: (error) =>
          new GitOperationError({
            message: `Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })
    }),

  /**
   * List all worktrees for a repository
   */
  listWorktrees: (repositoryPath: string) =>
    Effect.gen(function* () {
      const output = yield* Effect.tryPromise({
        try: () =>
          execPromise(
            `git -C "${repositoryPath}" worktree list --porcelain`
          ),
        catch: (error) =>
          new GitOperationError({
            message: `Failed to list worktrees: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })

      // Parse worktree list output
      const worktrees: Array<{ path: string; branch: string; head: string }> = []
      const lines = output.trim().split('\n')
      let current: Partial<{ path: string; branch: string; head: string }> = {}

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current as any)
          current = { path: line.substring(9) }
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring(7).replace('refs/heads/', '')
        } else if (line.startsWith('HEAD ')) {
          current.head = line.substring(5)
        }
      }
      if (current.path) worktrees.push(current as any)

      return worktrees
    }),
}
```

### 3.3 Add Issue Context to Watcher Config

**File**: `src/shared/schemas/ai-watchers.ts` (update AiWatcherConfig)
```typescript
export class AiWatcherConfig extends Schema.Class<AiWatcherConfig>('AiWatcherConfig')({
  // ... existing fields
  issueContext: Schema.optional(Schema.Struct({
    owner: Schema.String,
    repo: Schema.String,
    repositoryId: Schema.String, // Repository ID for worktree operations
    issueNumber: Schema.Number,
    issueTitle: Schema.String,
    worktreePath: Schema.optional(Schema.String), // Path to the worktree
    branchName: Schema.optional(Schema.String), // Branch name (e.g., 'issue#202')
  })),
}) {}
```

### 3.4 Create Watcher Launcher Hook with Worktree Support

**File**: `src/renderer/hooks/useAiWatcherLauncher.ts`
```typescript
import { useState } from 'react'
import { useAtom } from '@effect-atom/atom-react'
import { createWatcherAtom } from '../atoms/ai-watcher-atoms'
import type { GitHubIssue } from '../../shared/schemas/github/issue'
import type { AiWatcherConfig } from '../../shared/schemas/ai-watchers'
import type { RepositoryId } from '../../shared/schemas/source-control/repository'
import { SourceControlClient } from '../lib/ipc-client'
import { Effect } from 'effect'
import { toast } from 'sonner'

export function useAiWatcherLauncher() {
  const [createResult, createWatcher] = useAtom(createWatcherAtom)
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false)

  const launchWatcherForIssue = async (
    issue: GitHubIssue,
    provider: 'claude-code' | 'codex',
    repositoryId: RepositoryId,
    owner: string,
    repo: string
  ) => {
    setIsCreatingWorktree(true)

    try {
      // Step 1: Create worktree for the issue
      console.log(`[useAiWatcherLauncher] Creating worktree for issue #${issue.number}`)

      const worktreeResult = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* SourceControlClient
          return yield* client.createWorktreeForIssue({
            repositoryId,
            issueNumber: issue.number,
          })
        }).pipe(Effect.provide(SourceControlClient.Default))
      )

      console.log(
        `[useAiWatcherLauncher] Worktree created: ${worktreeResult.worktreePath}`
      )

      // Show toast notification
      if (worktreeResult.branchExisted) {
        toast.info(
          `Using existing branch '${worktreeResult.branchName}' for issue #${issue.number}`
        )
      } else {
        toast.success(
          `Created new branch '${worktreeResult.branchName}' for issue #${issue.number}`
        )
      }

      // Step 2: Create AI watcher config with worktree path
      const config: AiWatcherConfig = {
        type: provider,
        name: `${provider}: #${issue.number} ${issue.title}`,
        workingDirectory: worktreeResult.worktreePath,
        issueContext: {
          owner,
          repo,
          repositoryId,
          issueNumber: issue.number,
          issueTitle: issue.title,
          worktreePath: worktreeResult.worktreePath,
          branchName: worktreeResult.branchName,
        },
      }

      // Step 3: Launch the watcher
      console.log(`[useAiWatcherLauncher] Launching ${provider} watcher`)
      createWatcher(config)
    } catch (error) {
      console.error('[useAiWatcherLauncher] Failed to launch watcher:', error)
      toast.error(
        `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      setIsCreatingWorktree(false)
    }
  }

  return {
    launchWatcherForIssue,
    isLaunching: createResult.waiting || isCreatingWorktree,
    createResult,
  }
}
```

### 3.5 Integrate Launcher in Modal

**File**: `src/renderer/components/ai-watchers/IssuesModal.tsx` (update)
```typescript
import { useAiWatcherLauncher } from '../../hooks/useAiWatcherLauncher'

interface IssuesModalProps {
  isOpen: boolean
  onClose: () => void
  owner: string
  repo: string
  repositoryId: RepositoryId // Add repository ID
  onLaunchWatchers?: (issueNumbers: number[]) => void
}

export function IssuesModal({
  isOpen,
  onClose,
  owner,
  repo,
  repositoryId,
  onLaunchWatchers,
}: IssuesModalProps) {
  const { launchWatcherForIssue, isLaunching } = useAiWatcherLauncher()
  const [selectedProvider, setSelectedProvider] = useState<'claude-code' | 'codex'>('claude-code')

  const handleLaunchWatchers = async () => {
    const shortlistedIssues = issues.filter(issue => shortlist.has(issue.number))

    // Launch watchers sequentially to avoid git conflicts
    for (const issue of shortlistedIssues) {
      await launchWatcherForIssue(
        issue,
        selectedProvider,
        repositoryId,
        owner,
        repo
      )
    }

    onClose()
  }

  // Add provider selector in footer before launch button
  return (
    // ... existing modal structure
    <div className="p-4 border-t border-gray-700/50 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="text-sm text-gray-400">
          {shortlist.size} issue{shortlist.size !== 1 ? 's' : ''} shortlisted
        </div>

        {/* Provider Selector */}
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value as 'claude-code' | 'codex')}
          className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
          disabled={isLaunching}
        >
          <option value="claude-code">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
      </div>

      <button
        onClick={handleLaunchWatchers}
        disabled={shortlist.size === 0 || isLaunching}
        className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-600 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        type="button"
      >
        <Zap className="size-4" />
        {isLaunching ? 'Creating Worktrees...' : 'Launch AI Watchers'}
      </button>
    </div>
  )
}
```

**File**: `src/renderer/components/ui/RepositoryDropdown.tsx` (update to pass repositoryId)
```typescript
// In RepositoryDropdown component
<MenuItem
  icon={ListTodo}
  label="View Issues"
  onClick={() => {
    setShowIssuesModal(true)
    onOpenChange(false)
  }}
/>

{/* Issues Modal - add at end of component */}
{showIssuesModal && (
  <IssuesModal
    isOpen={showIssuesModal}
    onClose={() => setShowIssuesModal(false)}
    owner={repo.owner}
    repo={repo.name}
    repositoryId={repo.repositoryId}
  />
)}
```

### 3.6 Testing

```bash
# Run app
pnpm dev

# Manual verification:
# - Open issues modal
# - Shortlist multiple issues (e.g., #101, #202, #303)
# - Select Claude Code provider
# - Click "Launch AI Watchers"

# Verify git worktrees:
cd /path/to/repo
git worktree list
# Should show:
# /path/to/worktree-issue#101  abc1234 [issue#101]
# /path/to/worktree-issue#202  def5678 [issue#202]
# /path/to/worktree-issue#303  ghi9012 [issue#303]

# Verify watchers:
# - Check watcher names include issue context
# - Verify watchers are running in worktree directories
# - Verify command is 'claude' not 'claude-code'
# - Test that existing branches are reused (create issue#101 manually first)
```

**Success Criteria**:
- ✅ Command bug fixed (`claude` not `claude-code`)
- ✅ Watchers launch with correct command
- ✅ Issue context preserved in watcher config
- ✅ Git worktrees created for each issue
- ✅ Branch naming follows `issue#<number>` pattern
- ✅ New branches created from default branch (main/master)
- ✅ Existing branches are reused (not recreated)
- ✅ Watchers run in isolated worktree directories
- ✅ Multiple watchers can launch sequentially
- ✅ Toast notifications show worktree creation status

---

## Phase 4: LED Status Indicators

**Duration**: 2-3 hours
**Risk**: Low
**Impact**: Beautiful visual watcher status monitoring

### 4.1 Create WatcherStatusLED Component

**File**: `src/renderer/components/ai-watchers/WatcherStatusLED.tsx`
```typescript
import { motion } from 'framer-motion'
import type { AiWatcher } from '../../../shared/schemas/ai-watchers'
import { X } from 'lucide-react'

const getProviderFavicon = (type: string) => {
  switch (type) {
    case 'claude-code':
    case 'claude':
      return '🤖' // Or actual favicon URL
    case 'codex':
      return '⚡'
    case 'cursor':
      return '🎯'
    default:
      return '🔧'
  }
}

const getStatusColor = (status: AiWatcher['status']) => {
  switch (status) {
    case 'running':
      return {
        bg: '#10b98150',
        border: '#10b981',
        glow: '#10b98180',
        shadow: '0 0 20px #10b98180',
      }
    case 'idle':
      return {
        bg: '#fbbf2450',
        border: '#fbbf24',
        glow: '#fbbf2480',
        shadow: '0 0 20px #fbbf2480',
      }
    case 'stopped':
    case 'errored':
      return {
        bg: '#1f293710',
        border: '#374151',
        glow: 'transparent',
        shadow: 'none',
      }
    default:
      return {
        bg: '#6b728050',
        border: '#6b7280',
        glow: '#6b728080',
        shadow: '0 0 20px #6b728080',
      }
  }
}

interface WatcherLEDProps {
  watcher: AiWatcher
  onClear?: (watcherId: string) => void
}

export function WatcherStatusLED({ watcher, onClear }: WatcherLEDProps) {
  const colors = getStatusColor(watcher.status)
  const favicon = getProviderFavicon(watcher.type)
  const isActive = watcher.status === 'running' || watcher.status === 'idle'
  const isDead = watcher.status === 'stopped' || watcher.status === 'errored'

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="relative group"
      exit={{ opacity: 0, scale: 0.8 }}
      initial={{ opacity: 0, scale: 0.8 }}
      layout
    >
      {/* LED Square */}
      <div
        className="relative size-12 rounded border-2 backdrop-blur-xl transition-all duration-300"
        style={{
          backgroundColor: colors.bg,
          borderColor: colors.border,
          boxShadow: isActive ? colors.shadow : 'none',
        }}
      >
        {/* Favicon */}
        <div className="absolute inset-0 flex items-center justify-center text-lg">
          {favicon}
        </div>

        {/* Pulsing Glow (only when active) */}
        {isActive && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            className="absolute inset-0 rounded"
            style={{
              backgroundColor: colors.glow,
              filter: 'blur(8px)',
              zIndex: -1,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Clear button (only when dead) */}
        {isDead && onClear && (
          <button
            className="absolute -top-1 -right-1 size-4 bg-gray-700 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => onClear(watcher.id)}
            type="button"
          >
            <X className="size-3 text-white" />
          </button>
        )}
      </div>

      {/* Tooltip on hover */}
      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        <div className="bg-gray-900/95 border border-gray-700/50 rounded px-2 py-1 text-xs text-white backdrop-blur-xl">
          <div className="font-medium">{watcher.name}</div>
          <div className="text-gray-400 capitalize">{watcher.status}</div>
        </div>
      </div>
    </motion.div>
  )
}
```

### 4.2 Create Watchers Panel Component

**File**: `src/renderer/components/ai-watchers/WatchersPanel.tsx`
```typescript
import { useAtomValue, useAtom } from '@effect-atom/atom-react'
import { AnimatePresence } from 'framer-motion'
import { aiWatchersAtom, stopWatcherAtom } from '../../atoms/ai-watcher-atoms'
import { WatcherStatusLED } from './WatcherStatusLED'
import { Result } from '@effect-atom/atom-react'

export function WatchersPanel() {
  const watchersResult = useAtomValue(aiWatchersAtom)
  const [, stopWatcher] = useAtom(stopWatcherAtom)

  const handleClearWatcher = (watcherId: string) => {
    stopWatcher(watcherId)
  }

  return Result.builder(watchersResult)
    .onInitial(() => null)
    .onErrorTag('AiWatcherError', () => null)
    .onSuccess((watchers) => {
      if (watchers.length === 0) return null

      return (
        <div className="fixed top-48 right-8 z-10">
          <div className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {watchers.map((watcher) => (
                <WatcherStatusLED
                  key={watcher.id}
                  onClear={handleClearWatcher}
                  watcher={watcher}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )
    })
    .render()
}
```

### 4.3 Integrate Watchers Panel in Main Layout

**File**: `src/renderer/components/MainScreen.tsx` (or similar)
```typescript
import { WatchersPanel } from './ai-watchers/WatchersPanel'

export function MainScreen() {
  return (
    <div className="relative">
      {/* Existing UI components */}

      {/* AI Usage Bars (top-left) */}
      <AiUsageBars />

      {/* Watcher Status Panel (top-right, below workflow button) */}
      <WatchersPanel />

      {/* Rest of layout */}
    </div>
  )
}
```

### 4.4 Testing

```bash
# Run app
pnpm dev

# Manual verification:
# - Launch AI watchers from issues
# - Verify LED indicators appear in top-right
# - Verify green when running
# - Verify yellow when idle (30s silence)
# - Verify unlit when stopped
# - Hover over LED to see tooltip
# - Click X on dead watcher to clear
```

**Success Criteria**:
- ✅ LEDs appear in top-right quadrant
- ✅ Colors match watcher states
- ✅ Glassy aesthetic like AIUsageBars
- ✅ Favicons display correctly
- ✅ Pulsing animation on active watchers
- ✅ Clear button works on dead watchers
- ✅ Tooltips show watcher info

---

## Success Metrics

### Feature Completeness

| Component | Expected | Delivered |
|-----------|----------|-----------|
| GitHub Issues Integration | Hexagonal architecture | ? |
| Issues Modal | Keyboard-driven shortlist | ? |
| AI Watcher Launching | Multi-issue launch | ? |
| Command Bug Fix | 'claude' process | ? |
| LED Indicators | Glassy, color-coded | ? |

### Code Quality

- [ ] No `any` types introduced
- [ ] All errors properly handled with Effect
- [ ] Hexagonal architecture followed
- [ ] Schema.parse used (never validate)
- [ ] Services have correct dependencies
- [ ] UI follows Result.builder pattern

### User Experience

- [ ] Modal opens smoothly
- [ ] Keyboard shortcuts intuitive
- [ ] LEDs provide clear status feedback
- [ ] Animations smooth (60fps)
- [ ] No layout shifts or jank

---

## Rollback Procedure

```bash
# Create backup branch
git checkout -b backup/pre-ai-watcher-ui

# If issues found, revert to backup
git checkout main
git reset --hard backup/pre-ai-watcher-ui
```

---

## Next Steps After Completion

- [ ] Update CLAUDE.md with new features
- [ ] Add screenshots to documentation
- [ ] Consider additional watcher controls (pause/resume)
- [ ] Add watcher logs viewer
- [ ] Add issue comment integration
- [ ] Consider GitLab/Bitbucket issue providers
