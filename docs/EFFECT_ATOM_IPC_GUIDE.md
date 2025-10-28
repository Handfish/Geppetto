# Foreward

The specific classes / files have changed in this process, but this serves as a guide on how to use @effect-atom/react in this application


# Effect Atom + IPC Integration Guide

A comprehensive guide to understanding how `@effect-atom/atom-react` integrates with Electron IPC in Geppetto, from a client code perspective.

## Table of Contents

- [Overview](#overview)
- [Architecture Diagram](#architecture-diagram)
- [Data Flow](#data-flow)
- [Core Concepts](#core-concepts)
- [Result Error Handling](#result-error-handling)
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

#### ⚠️ Critical: Object Parameter Memoization

**Atom families use object identity** (reference equality) to determine if it's the same atom. This means **you must memoize objects passed to atom families** or you'll create infinite subscription loops!

```typescript
// ❌ WRONG: New object every render = infinite loop
function CommitView({ repoId }: Props) {
  const { graph } = useCommitGraph(repoId, { maxCommits: 20, layout: 'topological' })
  //                                        ▲ New object reference every render!
  // This creates a NEW atom subscription on every render → infinite requests
}

// ✅ CORRECT: Memoized object = stable reference
function CommitView({ repoId }: Props) {
  const graphOptions = useMemo(
    () => ({ maxCommits: 20, layout: 'topological' as const }),
    [] // Empty deps = stable reference
  )
  const { graph } = useCommitGraph(repoId, graphOptions)
  // Same object reference every render → reuses same atom → shared cache
}

// ✅ ALSO CORRECT: Module-level constant (when options don't change)
const GRAPH_OPTIONS = { maxCommits: 20, layout: 'topological' as const }

function CommitView({ repoId }: Props) {
  const { graph } = useCommitGraph(repoId, GRAPH_OPTIONS)
  // All components share the same constant → perfect cache sharing
}
```

**Why this matters:**

1. **Performance**: New object = new atom = new IPC call = wasted work
2. **Cache sharing**: Multiple components with same options should share cache
3. **Memory leaks**: Uncollected atom subscriptions accumulate in memory

**Best practices:**

- **Simple values** (strings, numbers): No memoization needed
- **Objects/arrays**: Always memoize with `useMemo` or use module-level constants
- **Computed options**: Include all source values in `useMemo` dependency array
- **Shared options**: Define once at module level, import everywhere

See the **[Atom Family Memoization Pattern](#pattern-5-atom-family-parameter-memoization)** section for detailed examples.

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

## Result Error Handling

The `Result<T, E>` type from `@effect-atom/atom-react` provides type-safe error handling with pattern matching. For comprehensive error handling patterns and best practices, see **[Result Error Handling Patterns](./RESULT_ERROR_HANDLING_PATTERNS.md)**.

### Quick Reference

**Pattern 1: Side Effects with `Result.matchWithError` (Recommended for useEffect)**

```typescript
import { Result } from '@effect-atom/atom-react'

React.useEffect(() => {
  if (result.waiting) return

  Result.matchWithError(result, {
    onInitial: () => {
      // Handle initial state
    },
    onError: (error: MyErrorUnion) => {
      // TypeScript knows the exact error union type!
      if (error._tag === 'AuthenticationError') {
        setErrorMessage(error.message)
      } else if (error._tag === 'NetworkError') {
        setRetryable(true)
      }
    },
    onDefect: (defect: unknown) => {
      console.error('Unexpected error:', defect)
    },
    onSuccess: (data) => {
      setData(data)
    },
  })
}, [result])
```

**Benefits:**
- ✅ Direct error access without Option unwrapping
- ✅ Full TypeScript type narrowing with `error._tag` checks
- ✅ Separates expected errors (onError) from unexpected errors (onDefect)
- ✅ No type assertions needed

**Pattern 2: UI Rendering with `Result.builder` (Recommended for JSX)**

```typescript
{Result.builder(dataResult)
  .onInitial(() => <LoadingSpinner />)
  .onErrorTag('NetworkError', (error: NetworkError) => (
    <ErrorAlert message={error.message} action={<RetryButton />} />
  ))
  .onErrorTag('NotFoundError', (error: NotFoundError) => (
    <ErrorAlert message={error.message} />
  ))
  .onDefect((defect: unknown) => (
    <ErrorAlert message={`Unexpected: ${String(defect)}`} />
  ))
  .onSuccess((data) => (
    <DataDisplay data={data} />
  ))
  .render()}
```

**Benefits:**
- ✅ Type-safe error tag matching with `.onErrorTag()`
- ✅ Exhaustive error handling - TypeScript ensures all error tags are handled
- ✅ Clean separation of error types in UI
- ✅ Explicit type annotations for clarity

**For complete documentation including:**
- Anti-patterns to avoid
- Type narrowing strategies
- Real-world examples
- Common pitfalls

See **[Result Error Handling Patterns](./RESULT_ERROR_HANDLING_PATTERNS.md)**

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
        .onErrorTag('NetworkError', (error: NetworkError) => (
          <div>Network error: {error.message}</div>
        ))
        .onErrorTag('AuthenticationError', (error: AuthenticationError) => (
          <div>Please sign in to view repositories</div>
        ))
        .onDefect((defect: unknown) => (
          <div>Unexpected error: {String(defect)}</div>
        ))
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

  // Example: Side effect to show toast notification on error
  React.useEffect(() => {
    if (signInResult.waiting) return

    Result.matchWithError(signInResult, {
      onInitial: () => {},
      onError: (error: AuthError) => {
        if (error._tag === 'AuthenticationError') {
          showToast({ type: 'error', message: `Auth failed: ${error.message}` })
        }
      },
      onDefect: (defect: unknown) => {
        console.error('Sign in defect:', defect)
      },
      onSuccess: (data) => {
        showToast({ type: 'success', message: `Signed in as ${data.user.login}` })
      },
    })
  }, [signInResult])

  return (
    <div>
      {Result.builder(signInResult)
        .onInitial(() => <button onClick={handleSignIn}>Sign In</button>)
        .onErrorTag('AuthenticationError', (error: AuthenticationError) => (
          <div>
            <div>Auth failed: {error.message}</div>
            <button onClick={handleSignIn}>Retry</button>
          </div>
        ))
        .onErrorTag('NetworkError', (error: NetworkError) => (
          <div>
            <div>Network error: {error.message}</div>
            <button onClick={handleSignIn}>Retry</button>
          </div>
        ))
        .onDefect((defect: unknown) => (
          <div>Unexpected error: {String(defect)}</div>
        ))
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

// Component handles each error type-safely with onErrorTag
Result.builder(repoResult)
  .onInitial(() => <LoadingSpinner />)
  .onErrorTag('AuthenticationError', (error: AuthenticationError) => (
    <div>Please sign in to view this repository</div>
  ))
  .onErrorTag('NetworkError', (error: NetworkError) => (
    <div>Connection failed: {error.message}</div>
  ))
  .onErrorTag('NotFoundError', (error: NotFoundError) => (
    <div>Repository not found</div>
  ))
  .onDefect((defect: unknown) => (
    <div>Unexpected error occurred: {String(defect)}</div>
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

### Pattern 5: Atom Family Parameter Memoization

**Problem:** Atom families use object identity to cache subscriptions. Passing inline objects creates infinite loops because each render creates a new object reference, which the atom family treats as a different subscription.

**Symptoms of the problem:**
- Infinite IPC requests in console logs
- UI stuck in loading state
- Backend logs show repeated cache hits for same query
- Browser performance degrades over time

#### Anti-Pattern: Inline Objects

```typescript
// ❌ WRONG: Creates infinite loop
function CommitGraphView({ repositoryId }: Props) {
  const { graphResult } = useCommitGraph(
    repositoryId,
    { maxCommits: 20, layoutAlgorithm: 'topological' }  // ← New object every render!
  )
  // Every render:
  // 1. New options object created
  // 2. Hook creates new params object
  // 3. Atom family sees different reference
  // 4. Creates new atom subscription
  // 5. Triggers IPC request
  // 6. Result arrives → component re-renders
  // 7. Go to step 1 → INFINITE LOOP
}
```

**What you'll see in console:**
```
[commitGraphAtom] Requesting commit graph for: abc-123
[CommitGraphService] Cache HIT for repository: abc-123
[commitGraphAtom] Received graph with 20 nodes
[commitGraphAtom] Requesting commit graph for: abc-123  ← Again!
[CommitGraphService] Cache HIT for repository: abc-123
[commitGraphAtom] Received graph with 20 nodes
[commitGraphAtom] Requesting commit graph for: abc-123  ← Again!!
... (repeats infinitely)
```

#### Solution 1: useMemo in Component

Use `useMemo` to create a stable reference within the component:

```typescript
// ✅ CORRECT: Memoized object = stable reference
function CommitGraphView({ repositoryId }: Props) {
  // Memoize options object to ensure stable reference
  const graphOptions = useMemo(
    () => ({ maxCommits: 20, layoutAlgorithm: 'topological' as const }),
    [] // Empty array = never recreates (static options)
  )

  const { graphResult } = useCommitGraph(repositoryId, graphOptions)
  // Same object reference every render → reuses same atom → no duplicate requests
}

// For computed options, include dependencies:
function DynamicCommitGraphView({ repositoryId, maxCommits }: Props) {
  const graphOptions = useMemo(
    () => ({ maxCommits, layoutAlgorithm: 'topological' as const }),
    [maxCommits]  // Recreate only when maxCommits changes
  )

  const { graphResult } = useCommitGraph(repositoryId, graphOptions)
}
```

#### Solution 2: Module-Level Constants

For options that never change, define constants at module level:

```typescript
// ✅ BEST: Module-level constant (shared across ALL components)
const DEFAULT_GRAPH_OPTIONS = { maxCommits: 20, layoutAlgorithm: 'topological' as const }
const LARGE_GRAPH_OPTIONS = { maxCommits: 100, layoutAlgorithm: 'topological' as const }

function CommitGraphView({ repositoryId }: Props) {
  const { graphResult } = useCommitGraph(repositoryId, DEFAULT_GRAPH_OPTIONS)
  // All components using DEFAULT_GRAPH_OPTIONS share the same atom!
}

function DetailedGraphView({ repositoryId }: Props) {
  const { graphResult } = useCommitGraph(repositoryId, LARGE_GRAPH_OPTIONS)
  // Different options = different atom (but still properly cached)
}
```

**Benefits of module-level constants:**
- ✅ Perfect cache sharing across all components
- ✅ Zero re-computation overhead
- ✅ Clearest intent (options are truly constant)
- ✅ Easy to maintain (defined once, used everywhere)

#### Solution 3: Smart Hook Implementation

You can also handle memoization inside custom hooks:

```typescript
// Custom hook with built-in memoization
export function useCommitGraph(
  repositoryId: RepositoryId,
  options?: GraphOptions,
) {
  // Memoize params object based on repositoryId and options reference
  const params = useMemo(
    () => ({ repositoryId, options }),
    [repositoryId.value, options]  // ← Depends on options reference
  )

  const graphResult = useAtomValue(commitGraphAtom(params))
  const refresh = useAtomRefresh(commitGraphAtom(params))

  return {
    graphResult,
    refresh,
    graph: Result.getOrElse(graphResult, () => null),
    isLoading: graphResult._tag === "Initial" && graphResult.waiting,
  }
}

// Callers must still memoize options!
// The hook only memoizes the params wrapper, not the options themselves
```

#### When to Use Each Approach

| Scenario | Approach | Example |
|----------|----------|---------|
| Static options (never change) | Module-level constant | `const OPTIONS = { maxCommits: 20 }` |
| Options vary by component | `useMemo` in component | `useMemo(() => ({ maxCommits }), [maxCommits])` |
| Options computed from props | `useMemo` with dependencies | `useMemo(() => ({ max: limit * 2 }), [limit])` |
| Options shared across features | Exported constants | `export const GRAPH_OPTIONS = {...}` |

#### Real-World Example

```typescript
// src/renderer/components/dev/SourceControlDevPanel.tsx

function SourceControlDevPanel() {
  const [selectedRepository, setSelectedRepository] = useState<Repository | null>(null)

  // Memoize graph options to ensure stable reference for atom family
  // This prevents creating new atom subscriptions on every render
  const graphOptions = useMemo(
    () => ({ maxCommits: 20, layoutAlgorithm: 'topological' as const }),
    [] // Static options - never change
  )

  return (
    <div>
      {selectedRepository && (
        <CommitGraphView
          repositoryId={selectedRepository.id}
          options={graphOptions}  // ← Stable reference
        />
      )}
    </div>
  )
}

// Multiple instances share the same atom because options reference is stable:
// Instance 1: useCommitGraph(repo1, graphOptions)  → Atom A
// Instance 2: useCommitGraph(repo2, graphOptions)  → Atom B (different repo)
// Instance 3: useCommitGraph(repo1, graphOptions)  → Atom A (reused!)
```

#### Debugging Tips

If you suspect an infinite loop issue:

1. **Check console logs**: Look for repeated identical requests
2. **Add logging to hooks**: Log when params objects are created
3. **Use React DevTools**: Check if component is re-rendering continuously
4. **Verify memoization**: Add `console.log(options)` in hook to see if reference changes

```typescript
export function useCommitGraph(repositoryId: RepositoryId, options?: GraphOptions) {
  // Debug: Log when options reference changes
  React.useEffect(() => {
    console.log('[useCommitGraph] Options reference changed:', options)
  }, [options])

  const params = useMemo(
    () => {
      console.log('[useCommitGraph] Creating new params object')
      return { repositoryId, options }
    },
    [repositoryId.value, options]
  )
  // If you see "Creating new params object" on every render, options aren't memoized!
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
3. **⚠️ Object parameters must be memoized** to prevent infinite loops with atom families
4. **Reactivity keys** enable cross-atom cache invalidation
5. **Result type** provides exhaustive async state handling
6. **Type safety** is enforced end-to-end via Effect Schema
7. **Dependency injection** composes cleanly from main process to React

**Critical Best Practice:**
Always memoize objects/arrays passed to atom families using `useMemo` or module-level constants. Failure to do so creates infinite subscription loops that degrade performance and waste resources. See [Pattern 5: Atom Family Parameter Memoization](#pattern-5-atom-family-parameter-memoization) for details.

This architecture gives you the best of both worlds: Effect's functional programming power with React's reactive UI model.
