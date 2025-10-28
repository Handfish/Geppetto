# Result API and Error Handling Patterns

A comprehensive guide to using the `Result` type from `@effect-atom/atom-react` for type-safe error handling in Geppetto.

## Table of Contents

- [Overview](#overview)
- [The Result Type](#the-result-type)
- [Result API Reference](#result-api-reference)
- [Common Patterns](#common-patterns)
- [Anti-Patterns](#anti-patterns)
- [Migration from Other Patterns](#migration-from-other-patterns)

---

## Overview

In Geppetto, all atoms that perform async operations (IPC calls, computations, etc.) return `Result<T, E>` types. This provides:

- **Type-safe error handling**: All possible error types are tracked by TypeScript
- **Exhaustive state handling**: Loading, success, error, and defect states
- **Declarative UI patterns**: Use `Result.builder` to map states to components
- **No null/undefined**: Explicit handling of all cases

**Core principle**: Never use try-catch, null checks, or optional chaining for error handling. Instead, use `Result` APIs to handle all states explicitly.

---

## The Result Type

### Type Definition

```typescript
type Result<T, E> =
  | { _tag: 'Initial'; waiting: boolean }
  | { _tag: 'Success'; value: T; waiting: boolean }
  | { _tag: 'Failure'; error: E; waiting: boolean }
  | { _tag: 'Defect'; defect: unknown; waiting: boolean }
```

### States Explained

**Initial** (`_tag: 'Initial'`)
- The operation hasn't completed yet (first load)
- No data or error available
- `waiting: true` means Effect is currently running
- `waiting: false` means atom is idle (not yet started)

**Success** (`_tag: 'Success'`)
- The operation completed successfully
- `value: T` contains the successful result
- `waiting: true` means a refetch is in progress (you have stale data)
- `waiting: false` means data is current and no fetch is running

**Failure** (`_tag: 'Failure'`)
- The operation failed with a known error type
- `error: E` contains the typed error (e.g., `NetworkError`, `AuthenticationError`)
- `waiting: true` means a retry is in progress
- `waiting: false` means no retry is running

**Defect** (`_tag: 'Defect'`)
- An unexpected error occurred (bug, unhandled exception)
- `defect: unknown` contains the unexpected error
- This indicates a bug in the application logic
- Should be logged and shown as "Unexpected Error" to users

### The `waiting` Field

The `waiting` boolean indicates whether an Effect is currently executing:

```typescript
// Initial load
{ _tag: 'Initial', waiting: true }   // Loading for first time
{ _tag: 'Initial', waiting: false }  // Atom exists but hasn't run yet

// Has data, refetching
{ _tag: 'Success', value: [...], waiting: true }   // Refetching (show stale data)
{ _tag: 'Success', value: [...], waiting: false }  // Idle with fresh data

// Has error, retrying
{ _tag: 'Failure', error: NetworkError, waiting: true }   // Retrying
{ _tag: 'Failure', error: NetworkError, waiting: false }  // Failed, not retrying
```

**Common UI patterns:**

```typescript
// Show spinner only on initial load
const isLoading = result._tag === 'Initial' && result.waiting

// Show "Refreshing..." badge if refetching
const isRefreshing = result._tag === 'Success' && result.waiting

// Show "Retrying..." on errors
const isRetrying = result._tag === 'Failure' && result.waiting

// General fetching indicator (any state)
const isFetching = result.waiting
```

---

## Result API Reference

### `Result.builder()` - Declarative Pattern Matching (RECOMMENDED)

The primary way to handle Result types in components. Provides exhaustive state handling with type safety.

```typescript
Result.builder(result)
  .onInitial(() => <LoadingSpinner />)
  .onErrorTag('AuthenticationError', (error) => <LoginPrompt error={error} />)
  .onErrorTag('NetworkError', (error) => <ErrorAlert error={error} />)
  .onErrorTag('NotFoundError', (error) => <NotFound />)
  .onDefect((defect) => <UnexpectedError defect={defect} />)
  .onSuccess((data) => <DataView data={data} />)
  .render()
```

**Builder Methods:**

- `.onInitial(render)` - Handle `Initial` state (before data is available)
- `.onErrorTag(tag, render)` - Handle specific error types by `_tag` field
- `.onDefect(render)` - Handle unexpected errors (bugs)
- `.onSuccess(render)` - Handle successful result with typed data
- `.render()` - **Required** final call to produce React elements

**TypeScript ensures:**
- All error types from the union are handled
- Success callback receives properly typed data
- Return types are consistent (all render functions must return same type)

### `Result.getOrElse()` - Safe Extraction with Fallback

Extract the success value or provide a default:

```typescript
// Basic usage
const accounts = Result.getOrElse(accountsResult, () => [])
//    ▲                            ▲                    ▲
//    Account[]                    Result<Account[], E>  fallback: () => Account[]

// With computation
const username = Result.getOrElse(userResult, () => {
  console.log('No user found')
  return 'Anonymous'
})
```

**Use cases:**
- Simple data extraction when you don't need error handling
- Providing default values in derived atoms
- Computing fallbacks based on other state

**Warning**: This discards error information. Only use when:
- Errors are handled elsewhere in the UI
- A default value is genuinely appropriate
- You're in a derived computation that doesn't care about errors

### `Result.match()` - Pattern Matching for Derived Values

**Result.match IS available and RECOMMENDED for computing derived values!**

Use `Result.match()` when you need to compute a value based on the Result state (boolean flags, counts, etc.):

```typescript
// ✅ CORRECT - Use Result.match for derived computations
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (data) => data.value.length > 0,  // CRITICAL: access data.value
  onFailure: () => false,
  onInitial: () => false,
})

const accountCount = Result.match(accountsResult, {
  onSuccess: (data) => data.value.length,  // data is { value: T, waiting: boolean }
  onFailure: () => 0,
  onInitial: () => 0,
})

const hasData = Result.match(repositoriesResult, {
  onSuccess: (data) => data.value.length > 0,
  onFailure: () => false,
  onInitial: () => false,
})
```

**CRITICAL - Callback Signature:**

Result.match callbacks receive the **full Result object**, not the unwrapped value:

```typescript
// ❌ WRONG - Trying to access value directly
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (usage) => usage.length > 0,  // ❌ Type error: Success has no length
  onFailure: () => false,
  onInitial: () => false,
})

// ✅ CORRECT - Access data.value
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (data) => data.value.length > 0,  // ✅ data is { value: T, waiting: boolean }
  onFailure: (err) => false,                    // err is { error: E, waiting: boolean }
  onInitial: (init) => false,                   // init is { waiting: boolean }
})
```

**When to use Result.match:**
- Computing boolean flags (isAuthenticated, hasData, isEmpty)
- Deriving simple values (counts, status strings)
- Non-rendering contexts (hooks, utility functions)
- You need different logic per Result state

**When to use Result.getOrElse instead:**
- You need the actual data with a fallback value
- Extracting secondary data (handled elsewhere)
- Within a Result.builder success callback

### Other Result Utilities

```typescript
// Check state type
Result.isInitial(result)   // boolean
Result.isSuccess(result)   // boolean
Result.isFailure(result)   // boolean
Result.isDefect(result)    // boolean

// Get value or null (useful for optional rendering)
Result.getOrNull(result)   // T | null

// Get value or undefined
Result.getOrUndefined(result)  // T | undefined

// Transform success value
Result.map(result, (value) => transformedValue)  // Result<U, E>

// Transform error value
Result.mapError(result, (error) => transformedError)  // Result<T, F>
```

**Important:** There are NO `getSuccess()`, `getFailure()`, or `getDefect()` methods in `@effect-atom/atom-react`. Always use:
- `Result.builder()` for UI rendering (recommended)
- `Result.match()` for extracting values in computations
- `Result.getOrElse()` for safe extraction with fallbacks

---

## Common Patterns

### Pattern 1: Exhaustive Error Handling in Components

**Use `Result.builder()` for exhaustive error handling in UI:**

```typescript
export function RepositoryList() {
  const { repositoriesResult } = useProviderRepositories('github')

  return (
    <div>
      {Result.builder(repositoriesResult)
        .onInitial(() => <LoadingSpinner size="md" />)
        .onErrorTag('AuthenticationError', (error) => (
          <ErrorAlert error={error} message="Please authenticate first" />
        ))
        .onErrorTag('NetworkError', (error) => (
          <ErrorAlert error={error} />
        ))
        .onErrorTag('ProviderOperationError', (error) => (
          <ErrorAlert error={error} />
        ))
        .onDefect((defect) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((groups) => {
          if (groups.length === 0) {
            return <EmptyState />
          }
          return <RepositoryGrid groups={groups} />
        })
        .render()}
    </div>
  )
}
```

**Why this is good:**
- ✅ TypeScript ensures all error types are handled
- ✅ Clear separation of states
- ✅ Easy to add new error types (TypeScript will remind you)
- ✅ No null checks or optional chaining needed

### Pattern 2: Safe Data Extraction in Derived Atoms

**Use `Result.getOrElse()` for safe defaults in computations:**

```typescript
// In RepositoryList.tsx
export function RepositoryList() {
  const { accountsResult } = useProviderAuth('github')
  const { repositoriesResult } = useProviderRepositories('github')

  return Result.builder(repositoriesResult)
    .onSuccess((groups) => {
      // Extract accounts safely for display purposes
      const accounts = Result.getOrElse(accountsResult, () => [])

      return (
        <div>
          {groups.map(group => {
            const account = accounts.find(acc => acc.id === group.accountId) ?? null
            return (
              <div key={group.accountId}>
                <h3>{account?.displayName ?? group.accountId}</h3>
                {/* render repos */}
              </div>
            )
          })}
        </div>
      )
    })
    .render()
}
```

**Why this works:**
- ✅ Primary data (repositories) has full error handling via builder
- ✅ Secondary data (accounts) has safe extraction with fallback
- ✅ Empty array fallback is appropriate (graceful degradation)
- ✅ No error state needed - we just show account IDs if accounts fail to load

### Pattern 3: Conditional Rendering with Loading States

**Use `waiting` field for granular loading states:**

```typescript
export function UserRepos() {
  const { repos } = useUserRepos()

  // Derive loading states
  const isInitialLoad = repos._tag === 'Initial' && repos.waiting
  const isRefreshing = repos._tag === 'Success' && repos.waiting
  const isRetrying = repos._tag === 'Failure' && repos.waiting

  return (
    <div>
      {/* Show banner for background operations */}
      {isRefreshing && <RefreshingBanner />}
      {isRetrying && <RetryingBanner />}

      {Result.builder(repos)
        .onInitial(() => {
          // Only show full loading on initial load
          return isInitialLoad ? <FullPageSpinner /> : null
        })
        .onSuccess((data) => (
          <div className={isRefreshing ? 'opacity-50' : ''}>
            <RepoList repos={data} />
          </div>
        ))
        .onFailure((error) => (
          <ErrorWithRetry error={error} isRetrying={isRetrying} />
        ))
        .render()}
    </div>
  )
}
```

**Why this is good:**
- ✅ Shows full spinner only on first load
- ✅ Shows subtle indicator during refetch (data still visible)
- ✅ Shows retry indicator when retrying failed request
- ✅ User always has feedback on what's happening

### Pattern 4: Multiple Results in One Component

**Handle multiple Results independently:**

```typescript
export function Dashboard() {
  const { accountsResult } = useProviderAuth('github')
  const { repositoriesResult } = useProviderRepositories('github')
  const { usageResult } = useAiProviderUsage('openai')

  return (
    <div className="dashboard">
      {/* Each Result handled independently */}
      <section>
        <h2>Accounts</h2>
        {Result.builder(accountsResult)
          .onInitial(() => <Skeleton />)
          .onErrorTag('NetworkError', (err) => <ErrorCard error={err} />)
          .onSuccess((accounts) => <AccountList accounts={accounts} />)
          .render()}
      </section>

      <section>
        <h2>Repositories</h2>
        {Result.builder(repositoriesResult)
          .onInitial(() => <Skeleton />)
          .onErrorTag('NetworkError', (err) => <ErrorCard error={err} />)
          .onErrorTag('AuthenticationError', () => <LoginPrompt />)
          .onSuccess((repos) => <RepoGrid repos={repos} />)
          .render()}
      </section>

      <section>
        <h2>AI Usage</h2>
        {Result.builder(usageResult)
          .onInitial(() => <Skeleton />)
          .onErrorTag('NetworkError', (err) => <ErrorCard error={err} />)
          .onSuccess((usage) => <UsageChart data={usage} />)
          .render()}
      </section>
    </div>
  )
}
```

**Why this works:**
- ✅ Each section loads independently
- ✅ Partial failures don't break the entire page
- ✅ Clear error boundaries per section
- ✅ Easy to add more sections

### Pattern 5: Derived Atoms with Result Transformation

**Transform Results in derived atoms:**

```typescript
// Atom that depends on another Result-returning atom
export const userRepositoryCountAtom = Atom.make((get) => {
  const reposResult = get(userReposAtom)

  // Transform the Result
  return Result.map(reposResult, (repos) => repos.length)
  //     ▲                      ▲
  //     Result<number, E>      repos: Repository[]
})

// Usage in component
export function RepoCount() {
  const countResult = useAtomValue(userRepositoryCountAtom)

  return Result.builder(countResult)
    .onInitial(() => <Skeleton />)
    .onSuccess((count) => <Badge>{count} repos</Badge>)
    .render()
}
```

**Why this works:**
- ✅ Error handling propagates automatically
- ✅ Transformation is pure (no side effects)
- ✅ Components receive transformed data
- ✅ No duplicate error handling needed

### Pattern 6: Conditional Atoms - Early Return Pattern

**The Challenge:** When using atoms conditionally with nullable parameters, TypeScript can lose error type information.

**Problem Example:**

```typescript
// ❌ PROBLEM - Conditional atoms with type casts lose error types
const emptyRepositoryAtom = Atom.make(() => Result.success(null))  // Result<null, never>

function useRepositoryById(id: RepositoryId | null) {
  // When id is null, we use empty atom - but error types don't match!
  const result = useAtomValue(
    id ? repositoryByIdAtom(id) : (emptyRepositoryAtom as any)  // ❌ Type cast!
  )

  // Result.builder can't access .onErrorTag() because TypeScript sees error type as `never`
  return Result.builder(result)
    .onErrorTag('NotFoundError', ...)  // ❌ TypeScript error: onErrorTag doesn't exist!
    .onSuccess(...)
}
```

**Root Cause:**
1. `repositoryByIdAtom(id)` returns `Result<Repository, NotFoundError | NetworkError>`
2. `emptyRepositoryAtom` returns `Result<null, never>` (error type is `never`)
3. When we conditionally use them, TypeScript loses the error types
4. Result.builder doesn't have `.onErrorTag()` for error type `never`
5. Type casts don't fix the runtime Result object - it still has `never` error type

**Solution: Early Return Pattern (Recommended)**

The cleanest solution is to handle null/undefined parameters **before** calling hooks that use atoms. This avoids conditional atoms entirely.

**Pattern 1: Early Return in Component**

```typescript
// ✅ BEST PRACTICE - Handle null in component before using hook
function RepositoryView({ id }: { id: RepositoryId | null }) {
  // Handle null case before calling hooks
  if (!id) {
    return <EmptyState message="No repository selected" />
  }

  // Now we can use the real atom directly - no conditionals!
  const { repositoryResult } = useRepositoryById(id)

  return Result.builder(repositoryResult)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('NotFoundError', () => <NotFound />)
    .onErrorTag('NetworkError', (error) => <ErrorAlert error={error} />)
    .onDefect((defect) => <UnexpectedError defect={defect} />)
    .onSuccess((repo) => <RepoCard repo={repo} />)
    .render()
}

// Hook requires non-null parameter
export function useRepositoryById(repositoryId: RepositoryId) {
  const repositoryResult = useAtomValue(repositoryByIdAtom(repositoryId))
  const refresh = useAtomRefresh(repositoryByIdAtom(repositoryId))

  return {
    repositoryResult,
    refresh,
    repository: Result.getOrElse(repositoryResult, () => null),
    isLoading: repositoryResult._tag === 'Initial' && repositoryResult.waiting,
  }
}
```

**Pattern 2: Early Return in Parent Component**

```typescript
// ✅ CORRECT - Parent handles null, child always gets valid ID
function BranchList({ repositoryId }: { repositoryId: RepositoryId | null }) {
  // Early return if no repository selected
  if (!repositoryId) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Branches</h3>
        <div className="text-center py-12">
          <p className="text-gray-400">No repository selected</p>
        </div>
      </div>
    )
  }

  // Now repositoryId is guaranteed non-null
  const { repositoryResult, refresh } = useRepositoryById(repositoryId)

  return (
    <div className="space-y-4">
      {/* ... use repositoryResult with full Result.builder API ... */}
    </div>
  )
}
```

**Real Example from Codebase:**

```typescript
// src/renderer/hooks/useSourceControl.ts

/**
 * Hook for repository by ID
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useRepositoryById(repositoryId: RepositoryId) {
  const repositoryResult = useAtomValue(repositoryByIdAtom(repositoryId))
  const refresh = useAtomRefresh(repositoryByIdAtom(repositoryId))

  const repository = Result.match(repositoryResult, {
    onSuccess: (data) =>
      Array.isArray(data.value) ? data.value[0] : data.value,
    onFailure: () => null,
    onInitial: () => null,
  })

  return {
    repositoryResult,  // Full Result with proper error types
    refresh,
    repository,        // Convenience property (nullable)
    isLoading: repositoryResult._tag === 'Initial' && repositoryResult.waiting,
  }
}

// src/renderer/components/source-control/BranchList.tsx

export function BranchList({ repositoryId }: { repositoryId: RepositoryId | null }) {
  // Early return if no repository selected
  if (!repositoryId) {
    return (
      <div className="space-y-4">
        <h3>Branches</h3>
        <p>No repository selected</p>
      </div>
    )
  }

  // Hook called with guaranteed non-null value
  const { repositoryResult, refresh } = useRepositoryById(repositoryId)

  return Result.builder(repositoryResult)
    .onErrorTag('NotFoundError', (error) => <ErrorAlert error={error} />)
    .onErrorTag('NetworkError', (error) => <ErrorAlert error={error} />)
    .onSuccess((repo) => <BranchTree repo={repo} />)
    .render()
}
```

**Why This Pattern Works:**

✅ **No conditional atoms** - Hook always uses the same atom type
✅ **Full type safety** - No type casts needed
✅ **Simple logic** - Clear separation of concerns (UI vs data)
✅ **Better UX** - Explicit empty states for invalid inputs
✅ **Easier testing** - Components have clear preconditions

**When to Use This Pattern:**

- ✅ Parameters can be null/undefined (optional selections)
- ✅ Null represents an invalid/empty state that should show different UI
- ✅ The component owns the decision about what to show when null
- ✅ You want to avoid conditional logic in hooks

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Accessing Value Directly in `Result.match()`

```typescript
// ❌ WRONG - Forgetting to access data.value
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (usage) => usage.length > 0,  // Type error: Success has no length!
  onFailure: () => false,
  onInitial: () => false,
})

// ✅ CORRECT - Access data.value
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (data) => data.value.length > 0,  // data is { value: T, waiting: boolean }
  onFailure: () => false,
  onInitial: () => false,
})
```

**Error you'll see:**
```
Property 'length' does not exist on type 'Success<readonly AiUsageSnapshot[], unknown>'.
```

**Why it happens:**
- Result.match callbacks receive the full Result object, not the unwrapped value
- Success objects have shape `{ value: T, waiting: boolean }`
- You must access `data.value` to get the actual data

**Remember:** All Result.match callbacks receive the Result object:
- `onSuccess: (data) => ...` where `data = { value: T, waiting: boolean }`
- `onFailure: (err) => ...` where `err = { error: E, waiting: boolean }`
- `onInitial: (init) => ...` where `init = { waiting: boolean }`

**Example: Extracting error messages with Result.match:**
```typescript
// ✅ CORRECT - Extract error message for toast/logging
const errorMessage = Result.match(cloneResult, {
  onSuccess: () => '',
  onFailure: (failureData) => {
    // failureData is { error: E, waiting: boolean }
    const error = failureData.error
    return error.stderr?.trim() || error.message || 'Operation failed'
  },
  onInitial: () => '',
})
```

### ❌ Anti-Pattern 2: Using Non-Existent Methods

```typescript
// ❌ WRONG - These methods DO NOT exist in @effect-atom/atom-react
const error = Result.getFailure(result)   // TypeError: Result.getFailure is not a function
const data = Result.getSuccess(result)    // TypeError: Result.getSuccess is not a function
const defect = Result.getDefect(result)   // TypeError: Result.getDefect is not a function

// ✅ CORRECT - Use Result.match to extract values
const errorMessage = Result.match(result, {
  onSuccess: () => null,
  onFailure: (failureData) => failureData.error.message,
  onInitial: () => null,
})

// ✅ CORRECT - Use Result.getOrElse for success values
const data = Result.getOrElse(result, () => [])
```

### ❌ Anti-Pattern 3: Manual State Checking Instead of Builder

```typescript
// ❌ WRONG - Manual pattern matching is verbose and error-prone
export function RepoList() {
  const { repos } = useUserRepos()

  if (repos._tag === 'Initial') {
    return <LoadingSpinner />
  }

  if (repos._tag === 'Failure') {
    const error = repos.error
    if (error._tag === 'NetworkError') {
      return <NetworkErrorAlert message={error.message} />
    }
    if (error._tag === 'AuthenticationError') {
      return <LoginPrompt />
    }
    return <GenericError />
  }

  if (repos._tag === 'Success') {
    return <RepoGrid repos={repos.value} />
  }

  // Easy to forget Defect case!
  return null
}

// ✅ CORRECT - Use Result.builder()
export function RepoList() {
  const { repos } = useUserRepos()

  return Result.builder(repos)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('NetworkError', (error) => (
      <NetworkErrorAlert message={error.message} />
    ))
    .onErrorTag('AuthenticationError', () => <LoginPrompt />)
    .onDefect((defect) => <UnexpectedError defect={defect} />)
    .onSuccess((data) => <RepoGrid repos={data} />)
    .render()
}
```

**Why builder is better:**
- ✅ TypeScript enforces handling all states
- ✅ More concise and readable
- ✅ Harder to forget cases (like Defect)
- ✅ Error tags are type-checked

### ❌ Anti-Pattern 4: Using `Result.getOrElse()` for Primary Data

```typescript
// ❌ WRONG - Loses error information for primary data
export function RepositoryList() {
  const { repositoriesResult } = useProviderRepositories('github')

  // Discards loading and error states!
  const repos = Result.getOrElse(repositoriesResult, () => [])

  return (
    <div>
      {repos.length === 0 && <div>No repositories</div>}
      {repos.map(repo => <RepoCard key={repo.id} repo={repo} />)}
    </div>
  )
}

// ✅ CORRECT - Handle all states properly
export function RepositoryList() {
  const { repositoriesResult } = useProviderRepositories('github')

  return Result.builder(repositoriesResult)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('AuthenticationError', () => <LoginPrompt />)
    .onErrorTag('NetworkError', (error) => <ErrorAlert error={error} />)
    .onDefect((defect) => <UnexpectedError defect={defect} />)
    .onSuccess((repos) => {
      if (repos.length === 0) {
        return <EmptyState />
      }
      return repos.map(repo => <RepoCard key={repo.id} repo={repo} />)
    })
    .render()
}
```

**Why this matters:**
- ❌ Users see no loading indicator
- ❌ Users see no error messages (silent failure)
- ❌ Cannot distinguish between "no repos" and "failed to load"
- ✅ With builder: proper feedback for all states

### ❌ Anti-Pattern 5: Ignoring the `waiting` Field

```typescript
// ❌ WRONG - Only checks _tag, ignores ongoing operations
export function RepoList() {
  const { repos } = useUserRepos()

  const isLoading = repos._tag === 'Initial'
  // Missing: repos._tag === 'Success' && repos.waiting (refetching!)

  return (
    <div>
      {isLoading && <Spinner />}
      {Result.builder(repos)
        .onSuccess((data) => <List items={data} />)
        .render()}
    </div>
  )
}

// ✅ CORRECT - Check both _tag and waiting
export function RepoList() {
  const { repos } = useUserRepos()

  const isInitialLoad = repos._tag === 'Initial' && repos.waiting
  const isRefreshing = repos._tag === 'Success' && repos.waiting

  return (
    <div>
      {isInitialLoad && <FullPageSpinner />}
      {isRefreshing && <RefreshBanner />}
      {Result.builder(repos)
        .onSuccess((data) => <List items={data} />)
        .render()}
    </div>
  )
}
```

**Why this matters:**
- ❌ No feedback during refetch (user thinks app is frozen)
- ❌ Can't show stale data while refreshing
- ✅ With waiting: granular loading states

### ❌ Anti-Pattern 6: Not Handling Defects

```typescript
// ❌ WRONG - Missing .onDefect() handler
Result.builder(repos)
  .onInitial(() => <Spinner />)
  .onErrorTag('NetworkError', (err) => <Error error={err} />)
  .onSuccess((data) => <List data={data} />)
  .render()
  // ^ TypeScript error: onDefect is required!

// ✅ CORRECT - Always handle defects
Result.builder(repos)
  .onInitial(() => <Spinner />)
  .onErrorTag('NetworkError', (err) => <Error error={err} />)
  .onDefect((defect) => {
    console.error('Unexpected error:', defect)
    return <UnexpectedError message="Something went wrong. Please report this bug." />
  })
  .onSuccess((data) => <List data={data} />)
  .render()
```

**Why defects matter:**
- Defects indicate bugs in application logic
- Should be logged for debugging
- Should show user-friendly "bug report" message
- TypeScript enforces handling (if configured correctly)

### ❌ Anti-Pattern 7: Unsafe Type Casts with Conditional Atoms

```typescript
// ❌ WRONG - Type cast erases error type information
const emptyAtom = Atom.make(() => Result.success(null))

function useRepositoryById(id: RepositoryId | null) {
  const result = useAtomValue(
    id ? repositoryByIdAtom(id) : (emptyAtom as unknown as ReturnType<typeof repositoryByIdAtom>)
    //                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                              Type cast looks safe but loses error types at runtime!
  )

  // TypeScript accepts this but Result.builder fails at compile time
  return Result.builder(result)
    .onErrorTag('NotFoundError', ...)  // ❌ Error: onErrorTag doesn't exist!
    .onSuccess(...)
}

// ✅ CORRECT - Use early return pattern instead
export function useRepositoryById(repositoryId: RepositoryId) {
  // Hook requires non-null - components handle null before calling
  const repositoryResult = useAtomValue(repositoryByIdAtom(repositoryId))
  const refresh = useAtomRefresh(repositoryByIdAtom(repositoryId))

  return {
    repositoryResult,
    refresh,
    repository: Result.getOrElse(repositoryResult, () => null),
    isLoading: repositoryResult._tag === 'Initial' && repositoryResult.waiting,
  }
}

// Component handles null with early return
function BranchList({ repositoryId }: { repositoryId: RepositoryId | null }) {
  if (!repositoryId) {
    return <EmptyState message="No repository selected" />
  }

  const { repositoryResult } = useRepositoryById(repositoryId)

  return Result.builder(repositoryResult)
    .onErrorTag('NotFoundError', ...)  // ✅ Works!
    .onErrorTag('NetworkError', ...)   // ✅ Works!
    .onSuccess(...)
    .render()
}
```

**Why this matters:**
- ❌ Type casts bypass TypeScript's type system
- ❌ Runtime Result object still has `never` error type
- ❌ Result.builder sees `never` and disables `.onErrorTag()`
- ✅ With early return: avoid conditional atoms entirely
- ✅ Hooks use single atom type with proper error types
- ✅ Components have explicit empty states for invalid inputs

**See Pattern 6: Conditional Atoms - Early Return Pattern for full details.**

---

## Migration from Other Patterns

### From React Query

```typescript
// React Query (before)
const { data, isLoading, error } = useQuery({
  queryKey: ['repos', username],
  queryFn: () => fetchRepos(username),
})

if (isLoading) return <Spinner />
if (error) return <Error error={error} />
return <List repos={data} />

// Effect Atom (after)
const { repos } = useUserRepos(username)

return Result.builder(repos)
  .onInitial(() => <Spinner />)
  .onErrorTag('NetworkError', (error) => <Error error={error} />)
  .onDefect((defect) => <UnexpectedError defect={defect} />)
  .onSuccess((data) => <List repos={data} />)
  .render()
```

**Key differences:**
- ✅ Typed errors (not `unknown`)
- ✅ Explicit defect handling
- ✅ No null/undefined for data
- ✅ `.render()` enforces exhaustive handling

### From Zustand

```typescript
// Zustand (before)
const repos = useRepoStore((state) => state.repos)
const loading = useRepoStore((state) => state.loading)
const error = useRepoStore((state) => state.error)

if (loading) return <Spinner />
if (error) return <Error error={error} />
if (!repos) return <Empty />
return <List repos={repos} />

// Effect Atom (after)
const { repos } = useUserRepos()

return Result.builder(repos)
  .onInitial(() => <Spinner />)
  .onErrorTag('NetworkError', (error) => <Error error={error} />)
  .onDefect((defect) => <UnexpectedError defect={defect} />)
  .onSuccess((data) => {
    if (data.length === 0) return <Empty />
    return <List repos={data} />
  })
  .render()
```

**Key differences:**
- ✅ Single Result type (not 3 separate states)
- ✅ No null checks needed
- ✅ Exhaustive error handling enforced
- ✅ Empty state is success case with empty array

### From Try-Catch

```typescript
// Try-catch (before)
const [repos, setRepos] = useState<Repo[] | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<Error | null>(null)

useEffect(() => {
  ;(async () => {
    try {
      setLoading(true)
      const data = await fetchRepos()
      setRepos(data)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  })()
}, [])

if (loading) return <Spinner />
if (error) return <Error error={error} />
if (!repos) return null
return <List repos={repos} />

// Effect Atom (after)
const { repos } = useUserRepos()

return Result.builder(repos)
  .onInitial(() => <Spinner />)
  .onErrorTag('NetworkError', (error) => <Error error={error} />)
  .onDefect((defect) => <UnexpectedError defect={defect} />)
  .onSuccess((data) => <List repos={data} />)
  .render()
```

**Key differences:**
- ✅ No manual state management
- ✅ No try-catch (errors in type system)
- ✅ Automatic caching and refetch
- ✅ Reactive invalidation on mutations

---

## Summary

### Do's ✅

1. **Use `Result.builder()` for UI rendering** - Exhaustive, type-safe, declarative
2. **Use `Result.getOrElse()` for safe extraction** - When you need a fallback value
3. **Check `waiting` field** - For granular loading states
4. **Always handle Defects** - They indicate bugs that should be logged
5. **Use `.onErrorTag()` per error type** - Specific handling for each error
6. **Handle empty success cases** - Empty array is still success, show appropriate UI

### Don'ts ❌

1. **Don't forget `data.value` in `Result.match()`** - Callbacks receive full Result object
2. **Don't manually pattern match** - Use `Result.builder()` instead
3. **Don't use `getOrElse()` for primary data** - Loses error information
4. **Don't ignore `waiting` field** - Misses refetch/retry states
5. **Don't forget `onDefect()`** - Unhandled defects are bugs
6. **Don't use try-catch** - Errors should be in the type system

### Quick Reference

```typescript
// ✅ Primary UI rendering (RECOMMENDED)
Result.builder(result)
  .onInitial(() => <Loading />)
  .onErrorTag('ErrorType', (err) => <Error />)
  .onDefect((defect) => <Bug />)
  .onSuccess((data) => <UI />)
  .render()

// ✅ Derived computations (boolean flags, counts)
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (data) => data.value.length > 0,  // Remember: data.value!
  onFailure: () => false,
  onInitial: () => false,
})

// ✅ Safe extraction with fallback
const value = Result.getOrElse(result, () => defaultValue)

// ✅ Check loading states
const isLoading = result._tag === 'Initial' && result.waiting
const isRefreshing = result._tag === 'Success' && result.waiting
```

---

## Real-World Example

Here's a complete example from the codebase showing proper Result handling:

```typescript
// src/renderer/components/RepositoryList.tsx
export function RepositoryList() {
  const { accountsResult } = useProviderAuth('github')
  const { repositoriesResult } = useProviderRepositories('github')

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">
        Your Connected Repositories
      </h2>

      {Result.builder(repositoriesResult)
        .onInitial(() => <LoadingSpinner size="md" />)
        .onErrorTag('AuthenticationError', error => (
          <ErrorAlert error={error} message="Please authenticate first" />
        ))
        .onErrorTag('NetworkError', error => (
          <ErrorAlert error={error} />
        ))
        .onErrorTag('ProviderOperationError', error => (
          <ErrorAlert error={error} />
        ))
        .onDefect(defect => (
          <ErrorAlert message={String(defect)} />
        ))
        .onSuccess(groups => {
          if (groups.length === 0) {
            return <div className="text-gray-400">No repositories found</div>
          }

          // Get accounts list safely (secondary data)
          const accounts = Result.getOrElse(accountsResult, () => [])

          return (
            <div className="space-y-6">
              {groups.map(group => {
                const account = accounts.find(acc => acc.id === group.accountId) ?? null
                return (
                  <div className="space-y-3" key={group.accountId}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {account?.displayName ?? account?.username ?? group.accountId}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {group.provider.toUpperCase()}
                        </p>
                      </div>
                      <span className="text-sm text-gray-500">
                        {group.repositories.length} repositories
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {group.repositories.map(repo => (
                        <RepoCard key={repo.repositoryId} repo={repo} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })
        .render()}
    </div>
  )
}
```

**What makes this good:**
1. ✅ Primary data (repositories) has exhaustive error handling
2. ✅ Secondary data (accounts) uses safe extraction with fallback
3. ✅ Handles all 4 Result states (Initial, Error, Defect, Success)
4. ✅ Shows appropriate UI for empty success case
5. ✅ Graceful degradation if accounts fail (shows account IDs)
6. ✅ No null checks or optional chaining in rendering logic
