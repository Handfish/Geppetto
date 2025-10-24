# Foreward

The specific classes / files have changed in this process, but this serves as a guide on how to use @effect-atom/react in this application


# Effect Atom + IPC Integration Guide

A comprehensive guide to understanding how `@effect-atom/atom-react` integrates with Electron IPC in Geppetto, from a client code perspective.

## Table of Contents

- [Overview](#overview)
- [Architecture Diagram](#architecture-diagram)
- [Data Flow](#data-flow)
- [Core Concepts](#core-concepts)
- [Code Examples](#code-examples)
- [Advanced Patterns](#advanced-patterns)

---

## Overview

This application uses `@effect-atom/atom-react` to bridge Effect's functional runtime with React's reactive UI model. The integration creates a type-safe, reactive state management system that seamlessly communicates across Electron's process boundary via IPC.

**Key Benefits:**
- **Type Safety**: End-to-end type safety from main process to UI components
- **Reactive Caching**: Automatic caching with TTL and smart invalidation
- **Error Handling**: Typed errors in the UI with Result types
- **Dependency Injection**: Effect services compose cleanly with React atoms

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RENDERER PROCESS                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    React Component                                │  │
│  │                                                                   │  │
│  │  function RepositoryList() {                                     │  │
│  │    const { repos } = useUserRepos()  ◄─── Custom Hook           │  │
│  │                                                                   │  │
│  │    return Result.builder(repos)                                  │  │
│  │      .onSuccess(data => <UI>{data}</UI>)                        │  │
│  │      .onError('NetworkError', err => <Error>{err}</Error>)      │  │
│  │      .render()                                                   │  │
│  │  }                                                                │  │
│  └───────────────────────┬───────────────────────────────────────────┘  │
│                          │                                              │
│                          ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Custom Hook (useGitHubAtoms.ts)                     │  │
│  │                                                                   │  │
│  │  export function useUserRepos() {                                │  │
│  │    const userReposResult = useAtomValue(userReposAtom)          │  │
│  │    return { repos: userReposResult, ... }                        │  │
│  │  }                                                                │  │
│  └───────────────────────┬───────────────────────────────────────────┘  │
│                          │                                              │
│                          ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                 Effect Atoms (github-atoms.ts)                   │  │
│  │                                                                   │  │
│  │  const githubRuntime = Atom.runtime(GitHubClient.Default)       │  │
│  │                                  │                                │  │
│  │  export const reposAtom = Atom.family((username) =>             │  │
│  │    githubRuntime.atom(                                           │  │
│  │      Effect.gen(function* () {                                   │  │
│  │        const github = yield* GitHubClient ◄──── Service DI       │  │
│  │        return yield* github.getRepos(username)                   │  │
│  │      })                                                           │  │
│  │    ).pipe(                                                        │  │
│  │      Atom.withReactivity(['github:repos:user']), ◄── Cache Key   │  │
│  │      Atom.setIdleTTL(Duration.minutes(5))  ◄───── TTL Cache      │  │
│  │    )                                                              │  │
│  │  )                                                                │  │
│  └───────────────────────┬───────────────────────────────────────────┘  │
│                          │                                              │
│                          ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              GitHubClient Service (ipc-client.ts)                │  │
│  │                                                                   │  │
│  │  export class GitHubClient extends Effect.Service() {            │  │
│  │    dependencies: [ElectronIpcClient.Default],                    │  │
│  │    effect: Effect.gen(function* () {                             │  │
│  │      const ipc = yield* ElectronIpcClient                        │  │
│  │      return {                                                     │  │
│  │        getRepos: (username) =>                                   │  │
│  │          ipc.invoke('getRepos', { username })  ◄── Type-safe IPC │  │
│  │      }                                                            │  │
│  │    })                                                             │  │
│  │  }                                                                │  │
│  └───────────────────────┬───────────────────────────────────────────┘  │
│                          │                                              │
│                          ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │           ElectronIpcClient (ipc-client.ts)                      │  │
│  │                                                                   │  │
│  │  invoke<T extends IpcChannels>(                                  │  │
│  │    channel: T,                                                    │  │
│  │    input: Schema.Type<IpcContracts[T]['input']>                 │  │
│  │  ): Effect<                                                       │  │
│  │    Schema.Type<IpcContracts[T]['output']>,  ◄── Output Type      │  │
│  │    Schema.Type<IpcContracts[T]['errors']>   ◄── Error Type       │  │
│  │  > {                                                              │  │
│  │    1. Validate input with Effect Schema                          │  │
│  │    2. Call window.electron.ipcRenderer.invoke()                  │  │
│  │    3. Validate output with Effect Schema                         │  │
│  │    4. Return typed Effect                                        │  │
│  │  }                                                                │  │
│  └───────────────────────┬───────────────────────────────────────────┘  │
│                          │                                              │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │
              IPC Boundary │ (window.electron.ipcRenderer.invoke)
                           │
┌──────────────────────────▼──────────────────────────────────────────────┐
│                        PRELOAD SCRIPT                                   │
│                                                                          │
│  contextBridge.exposeInMainWorld('electron', {                          │
│    ipcRenderer: {                                                        │
│      invoke: (channel, ...args) =>                                      │
│        ipcRenderer.invoke(channel, ...args)  ◄── Secure Bridge          │
│    }                                                                     │
│  })                                                                      │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────────┐
│                         MAIN PROCESS                                    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              IPC Handler (github-handlers.ts)                      │ │
│  │                                                                     │ │
│  │  ipcMain.handle('github:getRepos', async (_, input) => {          │ │
│  │    const program = Effect.gen(function* () {                      │ │
│  │      const validated = yield* S.decodeUnknown(inputSchema)(input) │ │
│  │      const api = yield* GitHubApiService                          │ │
│  │      return yield* api.getRepos(validated.username)               │ │
│  │    })                                                              │ │
│  │    return Effect.runPromise(program.pipe(                         │ │
│  │      Effect.provide(MainLayer)  ◄── DI Layer                      │ │
│  │    ))                                                              │ │
│  │  })                                                                │ │
│  └────────────────────────┬───────────────────────────────────────────┘ │
│                           │                                             │
│                           ▼                                             │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │           GitHubApiService (api-service.ts)                        │ │
│  │                                                                     │ │
│  │  getRepos: Effect.gen(function* () {                               │ │
│  │    const http = yield* GitHubHttpService                           │ │
│  │    const store = yield* SecureStoreService                         │ │
│  │    const token = yield* store.getToken()                           │ │
│  │    return yield* http.get('/user/repos', token)                    │ │
│  │  })                                                                 │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. User Interaction → Atom Subscription

```typescript
// Component renders and subscribes to atom
function RepositoryList() {
  const { repos } = useUserRepos()  // ← Subscribe to atom
  // Component re-renders when atom value changes
}
```

**What happens:**
1. `useUserRepos()` calls `useAtomValue(userReposAtom)`
2. `@effect-atom/atom-react` subscribes component to atom updates
3. Atom checks cache:
   - **Cache hit (< 5 min TTL)**: Returns cached `Result<Repository[], Error>`
   - **Cache miss**: Executes Effect to fetch data

### 2. Effect Execution → IPC Call

```typescript
// Atom definition
const githubRuntime = Atom.runtime(GitHubClient.Default)  // ← Runtime with services

export const reposAtom = Atom.family((username) =>
  githubRuntime.atom(
    Effect.gen(function* () {
      const github = yield* GitHubClient      // ← DI: Get service from runtime
      return yield* github.getRepos(username) // ← Execute Effect (IPC call)
    })
  ).pipe(
    Atom.withReactivity(['github:repos:user']),  // ← Cache key
    Atom.setIdleTTL(Duration.minutes(5))         // ← 5 min TTL
  )
)
```

**What happens:**
1. Effect runtime provides `GitHubClient` service to the Effect
2. `github.getRepos(username)` returns `Effect<Repository[], Error>`
3. Effect calls `ElectronIpcClient.invoke('getRepos', { username })`
4. IPC client validates input with Effect Schema
5. IPC client calls `window.electron.ipcRenderer.invoke('github:getRepos', { username })`

### 3. IPC Transport → Main Process

```typescript
// ElectronIpcClient.invoke() implementation
invoke: <T extends IpcChannels>(channel: T, input: ...) =>
  Effect.gen(function* () {
    const contract = GitHubIpcContracts[channel]  // ← Get contract

    // 1. Validate input
    const validatedInput = yield* S.decodeUnknown(contract.input)(input)

    // 2. Call IPC (cross-process boundary)
    const rawResult = yield* Effect.tryPromise({
      try: () => window.electron.ipcRenderer.invoke(contract.channel, validatedInput),
      catch: (error) => new NetworkError({ message: error.message })
    })

    // 3. Handle error responses
    if (rawResult?._tag === 'Error') {
      return yield* Effect.fail(rawResult.error)
    }

    // 4. Validate output
    const decoded = yield* S.decodeUnknown(contract.output)(rawResult)
    return decoded  // ← Fully typed result
  })
```

**What happens:**
1. Input validated against `IpcContracts[channel].input` schema
2. Call crosses process boundary via Electron's `contextBridge`
3. Main process handler receives request
4. Response validated against `IpcContracts[channel].output` schema
5. Typed result returned as `Effect<Output, Error>`

### 4. Main Process → Effect Services

```typescript
// Main process IPC handler
ipcMain.handle('github:getRepos', async (_, input) => {
  const program = Effect.gen(function* () {
    // 1. Validate input
    const validated = yield* S.decodeUnknown(inputSchema)(input)

    // 2. Get service from DI layer
    const api = yield* GitHubApiService

    // 3. Execute service method
    const repos = yield* api.getRepos(validated.username)

    // 4. Return typed result
    return repos  // ← GitHubRepository[]
  })

  // Run Effect with all services
  return Effect.runPromise(
    program.pipe(Effect.provide(MainLayer))
  )
})
```

**What happens:**
1. Handler validates input with Effect Schema
2. Effect runtime provides services from `MainLayer`
3. `GitHubApiService` executes GitHub API calls using HTTP service
4. Result returned through IPC back to renderer

### 5. Result → Atom → Component Update

```typescript
// Atom receives Result and caches it
reposAtom → Result<Repository[], Error>
            │
            ├─ Success: Result.success(repos)
            │   → Cached for 5 minutes
            │   → Component renders success UI
            │
            └─ Error: Result.error(NetworkError)
                → Cached (no retry until manual refresh)
                → Component renders error UI

// Component handles all states
Result.builder(repos)
  .onInitial(() => <Loading />)           // ← First load
  .onError('NetworkError', err => ...)    // ← Typed error handling
  .onError('AuthenticationError', ...)    // ← Another error type
  .onSuccess(data => <UI>{data}</UI>)     // ← Success state
  .render()
```

**What happens:**
1. Effect completes with `Exit<Repository[], Error>`
2. `@effect-atom/atom-react` wraps in `Result<Repository[], Error>`
3. Atom stores Result in cache with TTL
4. Component re-renders with new Result
5. `Result.builder()` pattern matches on state/error type

---

## Core Concepts

### 1. Atom Runtime

The runtime is the bridge between Effect services and React atoms:

```typescript
const githubRuntime = Atom.runtime(GitHubClient.Default)
//                                  ▲
//                                  └─── Effect Layer (provides services)
```

**Purpose:**
- Provides dependency injection for atoms
- Manages Effect execution within React lifecycle
- Shares service instances across atoms

### 2. Atom Families (Parameterized Atoms)

Similar to React Query's query keys, atom families create cached atoms per parameter:

```typescript
export const reposAtom = Atom.family((username?: string) =>
  githubRuntime.atom(...)
)

// Usage creates separate cached instances:
reposAtom('octocat')  // ← Cache entry 1
reposAtom('torvalds') // ← Cache entry 2
reposAtom(undefined)  // ← Cache entry 3 (current user)
```

**Each instance has:**
- Independent cache with its own TTL
- Separate reactivity key for invalidation
- Distinct subscription tracking

### 3. Reactivity Keys (Cache Invalidation)

Reactivity keys create relationships between atoms for smart invalidation:

```typescript
export const signInAtom = githubRuntime.fn(
  Effect.fnUntraced(function* () { ... }),
  { reactivityKeys: ['github:auth'] }  // ← Mutates 'github:auth'
)

export const authStateAtom = githubRuntime.atom(...)
  .pipe(
    Atom.withReactivity(['github:auth'])  // ← Subscribes to 'github:auth'
  )

export const reposAtom = Atom.family((username) =>
  githubRuntime.atom(...).pipe(
    Atom.withReactivity([`github:repos:${username || 'user'}`])
  )
)
```

**How it works:**
1. `signIn()` completes → Atom system notifies `'github:auth'` changed
2. All atoms subscribing to `'github:auth'` invalidate their cache
3. Components using those atoms trigger re-fetch
4. New data flows through the system

**Invalidation hierarchy:**
```
signIn/signOut mutation
    │
    └─► 'github:auth' key
            │
            ├─► authStateAtom (invalidated)
            ├─► isAuthenticatedAtom (invalidated, derived from authStateAtom)
            └─► currentUserAtom (invalidated, derived from authStateAtom)
```

### 4. TTL Caching

Time-based cache expiration prevents stale data:

```typescript
Atom.setIdleTTL(Duration.minutes(5))
```

- **Idle TTL**: Cache expires 5 minutes after last access
- **Active subscriptions**: Cache stays alive while component is mounted
- **Expiration**: Atom automatically refetches on next access after expiry

### 5. Result Type

`Result<T, E>` is @effect-atom's type for representing async state:

```typescript
type Result<T, E> =
  | { _tag: 'Initial', waiting: boolean }  // First load
  | { _tag: 'Success', value: T, waiting: boolean }  // Has data
  | { _tag: 'Error', error: E, waiting: boolean }    // Has error
  | { _tag: 'Defect', defect: unknown, waiting: boolean }  // Unexpected error
```

**The `waiting` field:**
- `true`: Effect is currently executing (loading/refetching)
- `false`: Effect is idle

**Usage patterns:**

```typescript
// Pattern 1: Builder pattern (recommended)
Result.builder(repos)
  .onInitial(() => <Loading />)
  .onError((error) => {
    if (error._tag === 'NetworkError') return <NetworkError>{error.message}</NetworkError>
    if (error._tag === 'AuthenticationError') return <AuthError />
    return <GenericError />
  })
  .onDefect(() => <UnexpectedError />)
  .onSuccess(data => <UI>{data}</UI>)
  .render()

// Pattern 2: Direct matching
if (repos._tag === 'Success') {
  return <UI>{repos.value}</UI>
}

// Pattern 3: Get or else
const data = Result.getOrElse(repos, () => [])
```

---

## Code Examples

### Example 1: Simple Data Fetching

**Define the atom:**

```typescript
// src/renderer/atoms/github-atoms.ts
export const reposAtom = Atom.family((username?: string) =>
  githubRuntime
    .atom(
      Effect.gen(function* () {
        const github = yield* GitHubClient
        return yield* github.getRepos(username)
      })
    )
    .pipe(
      Atom.withReactivity([`github:repos:${username || 'user'}`]),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)
```

**Create a hook:**

```typescript
// src/renderer/hooks/useGitHubAtoms.ts
export function useGitHubRepos(username?: string) {
  const reposResult = useAtomValue(reposAtom(username))
  const refreshRepos = useAtomRefresh(reposAtom(username))

  return {
    repos: reposResult,
    refresh: refreshRepos,
    isLoading: reposResult._tag === 'Initial' && reposResult.waiting,
    isFetching: reposResult.waiting,
  }
}
```

**Use in component:**

```typescript
// src/renderer/components/RepositoryList.tsx
export function RepositoryList() {
  const { repos, refresh, isLoading } = useGitHubRepos()

  return (
    <div>
      <button onClick={refresh}>Refresh</button>

      {Result.builder(repos)
        .onInitial(() => <div>Loading...</div>)
        .onError((error) => {
          if (error._tag === 'NetworkError') {
            return <div>Network error: {error.message}</div>
          }
          return <div>Error occurred</div>
        })
        .onDefect(() => <div>Unexpected error</div>)
        .onSuccess((repositories) => (
          <ul>
            {repositories.map(repo => (
              <li key={repo.id}>{repo.name}</li>
            ))}
          </ul>
        ))
        .render()}
    </div>
  )
}
```

### Example 2: Derived Atoms

**Derive from other atoms without IPC:**

```typescript
// src/renderer/atoms/github-atoms.ts

// Base atom (fetches via IPC)
export const authStateAtom = githubRuntime
  .atom(
    Effect.gen(function* () {
      const github = yield* GitHubClient
      return yield* github.checkAuth()
    })
  )
  .pipe(
    Atom.withReactivity(['github:auth']),
    Atom.keepAlive  // ← Keep in memory (auth is always needed)
  )

// Derived atom (pure computation, no IPC)
export const isAuthenticatedAtom = Atom.make((get) => {
  const authResult = get(authStateAtom)  // ← Read from another atom
  const auth = Result.getOrElse(authResult, () => ({
    authenticated: false as const,
  }))
  return auth.authenticated  // ← Returns boolean, not Result
})

// Another derived atom
export const currentUserAtom = Atom.make((get) => {
  const authResult = get(authStateAtom)
  const auth = Result.getOrElse(authResult, () => ({
    authenticated: false as const,
  }))
  return auth.authenticated && 'user' in auth && auth.user
    ? Option.some(auth.user)
    : Option.none()
})
```

**Benefits:**
- Derived atoms recompute when dependencies change
- No duplicate IPC calls
- Type-safe composition

### Example 3: Mutations with Reactivity

**Define mutation atom:**

```typescript
// src/renderer/atoms/github-atoms.ts
export const signInAtom = githubRuntime.fn(
  Effect.fnUntraced(function* () {
    const github = yield* GitHubClient
    return yield* github.signIn()
  }),
  { reactivityKeys: ['github:auth'] }  // ← Invalidates auth cache
)
```

**Use in component:**

```typescript
// src/renderer/components/AuthCard.tsx
export function AuthCard() {
  const { isAuthenticated, currentUser } = useGitHubAuth()
  const [signInResult, signIn] = useAtom(signInAtom)
  //     ▲                ▲
  //     │                └─── Function to trigger mutation
  //     └──────────────────── Result of last mutation

  const handleSignIn = () => {
    signIn()  // ← Triggers Effect, invalidates 'github:auth' on success
  }

  return (
    <div>
      {Result.builder(signInResult)
        .onInitial(() => <button onClick={handleSignIn}>Sign In</button>)
        .onError((error) => {
          if (error._tag === 'AuthenticationError') {
            return (
              <div>
                <div>Auth failed: {error.message}</div>
                <button onClick={handleSignIn}>Retry</button>
              </div>
            )
          }
          return <div>Error: {JSON.stringify(error)}</div>
        })
        .onDefect(() => <div>Unexpected error</div>)
        .onSuccess((data) => (
          <div>Signed in as {data.user.login}</div>
        ))
        .render()}
    </div>
  )
}
```

**What happens when `signIn()` is called:**

1. `signInAtom` executes Effect (OAuth flow via IPC)
2. On success, atom system broadcasts `'github:auth'` changed
3. `authStateAtom` invalidates its cache (subscribed to `'github:auth'`)
4. Components using `authStateAtom` re-render with fresh auth state
5. `signInResult` updates to `Result.success({ user, token })`

---

## Advanced Patterns

### Pattern 1: Conditional Atoms (Skip IPC if Not Needed)

```typescript
export const userReposAtom = Atom.make((get) => {
  const userOption = get(currentUserAtom)

  if (Option.isNone(userOption)) {
    // Not authenticated, skip IPC call
    return Result.success([] as GitHubRepository[])
  }

  const user = userOption.value
  // Authenticated, delegate to reposAtom
  return get(reposAtom(user.login))
})
```

**Why this is powerful:**
- Reads from derived atom (`currentUserAtom`)
- Conditionally calls IPC-backed atom (`reposAtom`)
- Returns consistent `Result` type
- Avoids unnecessary IPC calls when not authenticated

### Pattern 2: Multiple Error Types

```typescript
// IPC contract defines possible errors
export const GitHubIpcContracts = {
  getRepo: {
    channel: 'github:getRepo' as const,
    input: S.Struct({ owner: S.String, repo: S.String }),
    output: GitHubRepository,
    errors: S.Union(AuthenticationError, NetworkError, NotFoundError),
    //              ▲                     ▲              ▲
    //              └─────────────────────┴──────────────┘
    //                   All possible error types
  },
}

// Component handles each error differently
Result.builder(repoResult)
  .onError((error) => {
    if (error._tag === 'AuthenticationError') {
      return <div>Please sign in to view this repository</div>
    }
    if (error._tag === 'NetworkError') {
      return <div>Connection failed: {error.message}</div>
    }
    if (error._tag === 'NotFoundError') {
      return <div>Repository not found</div>
    }
    return <div>Error: {JSON.stringify(error)}</div>
  })
  .onDefect(() => (
    <div>Unexpected error occurred</div>
  ))
  .onSuccess((repo) => <RepoDetails repo={repo} />)
  .render()
```

**Type safety:**
- TypeScript knows all possible error types from contract
- `.onError(handler)` receives a union of all possible errors
- Use `error._tag` to discriminate between error types
- TypeScript provides autocomplete for error tags

### Pattern 3: Optimistic Updates

```typescript
// Pattern for optimistic UI updates (not yet implemented in codebase)
export const starRepoAtom = Atom.family(({ owner, repo }: { owner: string; repo: string }) =>
  githubRuntime.fn(
    Effect.fnUntraced(function* () {
      const github = yield* GitHubClient
      return yield* github.starRepo(owner, repo)
    }),
    {
      // Invalidate specific repo and user's starred repos
      reactivityKeys: [`github:repo:${owner}/${repo}`, 'github:starred:user'],
    }
  )
)

// Usage in component
function RepoCard({ owner, repo }) {
  const { repo: repoResult } = useGitHubRepo(owner, repo)
  const [starResult, starRepo] = useAtom(starRepoAtom({ owner, repo }))

  const handleStar = () => {
    starRepo()  // ← Triggers mutation
    // After success, both repoAtom and starredReposAtom auto-refresh
  }

  return (
    <div>
      {Result.getOrNull(repoResult)?.name}
      <button onClick={handleStar} disabled={starResult.waiting}>
        {starResult.waiting ? 'Starring...' : 'Star'}
      </button>
    </div>
  )
}
```

### Pattern 4: Polling / Auto-Refresh

```typescript
// Custom hook with interval-based refresh
export function useGitHubIssues(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open',
  { pollingInterval }: { pollingInterval?: number } = {}
) {
  const issuesResult = useAtomValue(issuesAtom({ owner, repo, state }))
  const refreshIssues = useAtomRefresh(issuesAtom({ owner, repo, state }))

  React.useEffect(() => {
    if (!pollingInterval) return

    const interval = setInterval(refreshIssues, pollingInterval)
    return () => clearInterval(interval)
  }, [pollingInterval, refreshIssues])

  return {
    issues: issuesResult,
    refresh: refreshIssues,
    isLoading: issuesResult._tag === 'Initial' && issuesResult.waiting,
  }
}

// Usage
function IssueList() {
  const { issues } = useGitHubIssues('facebook', 'react', 'open', {
    pollingInterval: 30000  // ← Poll every 30 seconds
  })

  return Result.builder(issues)
    .onSuccess(data => <List items={data} />)
    .render()
}
```

---

## Summary

**The full stack in one view:**

```
React Component
    ↓ useAtomValue(atom)
Custom Hook
    ↓ wraps atom subscription
Effect Atom (with cache & TTL)
    ↓ Effect.gen + GitHubClient service
GitHubClient Service
    ↓ ipc.invoke('channel', input)
ElectronIpcClient
    ↓ validate → window.electron.ipcRenderer.invoke → validate
─────────────────────────────────────────────────────────────
IPC Boundary (contextBridge)
─────────────────────────────────────────────────────────────
Main Process IPC Handler
    ↓ validate input → Effect.provide(MainLayer)
GitHubApiService (with DI)
    ↓ GitHub API HTTP calls
GitHub REST API
```

**Key Takeaways:**

1. **Atoms are reactive caches** for Effect computations
2. **Atom families** create per-parameter cache instances (like React Query keys)
3. **Reactivity keys** enable cross-atom cache invalidation
4. **Result type** provides exhaustive async state handling
5. **Type safety** is enforced end-to-end via Effect Schema
6. **Dependency injection** composes cleanly from main process to React

This architecture gives you the best of both worlds: Effect's functional programming power with React's reactive UI model.
