# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern GitHub Desktop clone with **tiered deployment** (Free/Pro) demonstrating type-safe IPC communication in Electron using Effect and @effect-atom/atom-react for state management. This application showcases functional programming patterns with end-to-end type safety, DDD-based multi-account management, and tier-based feature gating from the main process to UI components.

## Key Technologies

- **Effect**: Functional programming library for error handling, dependency injection (services/layers), and structured concurrency
- **@effect-atom/atom-react**: Reactive state management replacing React Query/Zustand patterns
- **Effect Schema**: Runtime type validation enforced across process boundaries
- **Electron**: Desktop framework with main/renderer process architecture
- **TypeScript**: Full type safety throughout the stack

## Development Commands

```bash
# Development with hot reload
pnpm dev              # Default (free tier)
pnpm dev:free         # Free tier build
pnpm dev:pro          # Pro tier build

# Compile application
pnpm compile:app       # Default
pnpm compile:app:free  # Free tier
pnpm compile:app:pro   # Pro tier

# Build packages
pnpm prebuild          # Default
pnpm prebuild:free     # Free tier prebuild
pnpm prebuild:pro      # Pro tier prebuild

pnpm build             # Default
pnpm build:free        # Free tier package
pnpm build:pro         # Pro tier package
pnpm build:all         # Build both tiers

# Release (publish to GitHub/stores)
pnpm release           # Default
pnpm release:free      # Release free tier
pnpm release:pro       # Release pro tier

# Lint code
pnpm lint
pnpm lint:fix  # with auto-fix

# Preview built application
pnpm start

# Clean development artifacts
pnpm clean:dev
```

## Architecture Overview

### Three-Process Electron Architecture

1. **Main Process** (`src/main/`): Node.js environment with Effect Services for API operations and IPC handlers
2. **Preload Script** (`src/preload/`): Secure IPC bridge exposing typed APIs to renderer via `contextBridge`
3. **Renderer Process** (`src/renderer/`): React app using Effect Atoms for reactive state management
4. **Shared Layer** (`src/shared/`): Type-safe IPC contracts and schemas shared between processes

This architecture demonstrates a custom Effect-based abstraction over Electron's ipcMain/ipcRenderer for type-safe cross-process communication.

### Tiered Architecture (Free vs Pro)

The application supports **two deployment tiers** with separate builds and feature sets:

**Free Tier** (`APP_TIER=free`):
- Single GitHub account authentication
- No account switching UI
- No GitLab or Bitbucket support
- Build artifacts: `my-electron-app-free-v{version}-{os}.{ext}`
- App ID: `com.{author}.{name}.free`
- Product name: "Geppetto Free"

**Pro Tier** (`APP_TIER=pro`):
- Unlimited GitHub accounts with account switching
- Future: Unlimited GitLab accounts
- Future: Unlimited Bitbucket accounts
- Account switcher UI enabled
- Build artifacts: `my-electron-app-pro-v{version}-{os}.{ext}`
- App ID: `com.{author}.{name}.pro`
- Product name: "Geppetto Pro"

**Tier Configuration:**
- `src/shared/tier-config.ts`: Central tier configuration and limits
- `src/main/tier/tier-service.ts`: TierService for runtime feature gating
- Environment variables: `APP_TIER`, `APP_NAME`, `APP_ID_SUFFIX`
- Build-time injection via Vite (`process.env.APP_TIER`)
- Separate electron-builder configs per tier

**Feature Gating:**
```typescript
// TierService validates operations against tier limits
const tierService = yield* TierService
yield* tierService.checkCanAddAccount('github', accountContext) // Fails if limit exceeded
yield* tierService.checkFeatureAvailable('account-switcher') // Fails if free tier
```

**Multi-Account Architecture:**
- `AccountContext` aggregate root (DDD pattern) manages all accounts
- `Account` entities with unique `AccountId` format: `{provider}:{userId}` (e.g., `github:12345`)
- `AccountContextService` handles account CRUD operations with tier validation
- `SecureStoreService` stores tokens per account ID (encrypted with `electron-store`)
- IPC contracts: `AccountIpcContracts` for account management operations
- Renderer atoms: `accountContextAtom`, `activeAccountAtom`, `tierLimitsAtom`

**Key Files:**
- `src/shared/tier-config.ts`: Tier limits configuration
- `src/shared/schemas/account-context.ts`: AccountContext domain aggregate
- `src/main/tier/tier-service.ts`: Tier validation service
- `src/main/account/account-context-service.ts`: Account management service
- `src/main/ipc/account-handlers.ts`: Account IPC handlers
- `src/renderer/atoms/account-atoms.ts`: Account state atoms
- `.env.free`, `.env.pro`: Tier-specific environment variables
- `electron.vite.config.ts`: Tier-aware build configuration
- `electron-builder.ts`: Tier-aware packaging configuration

### Domain-Driven Organization

The application is organized by **domains** (e.g., `github/`, future: `gitlab/`, `bitbucket/`), where each domain contains:
- **Services**: Business logic and API integration (`{domain}-service.ts`, `api-service.ts`, etc.)
- **Errors**: Domain-specific error classes using `Data.TaggedError`
- **Schemas**: Domain-specific data models (stored in `src/shared/schemas/{domain}/`)

This organization enables:
- Multiple OAuth providers (GitHub, GitLab, Bitbucket, etc.)
- Clean separation of concerns per integration
- Isolated testing and maintenance
- Easy addition of new providers

### Effect-Based Service Architecture

The application uses Effect's dependency injection via services and layers:

**Main Process Services** (`src/main/github/`):
- `GitHubHttpService`: HTTP client for GitHub API requests
- `SecureStoreService`: Encrypted credential storage using `electron-store`
- `GitHubAuthService`: OAuth flow with local callback server (port 3000)
- `GitHubApiService`: High-level GitHub operations (repos, issues, PRs)

All services are composed into `MainLayer` in `src/main/index.ts`:
```typescript
const MainLayer = Layer.mergeAll(
  GitHubHttpService.Default,
  SecureStoreService.Default,
  TierService.Default,
  AccountContextService.Default,
  GitHubAuthService.Default,
  GitHubApiService.Default
)
```

**Core Services** (`src/main/`):
- `TierService` (`tier/tier-service.ts`): Feature gating and tier limit enforcement
- `AccountContextService` (`account/account-context-service.ts`): Multi-account management with DDD aggregate

**Renderer Services** (`src/renderer/lib/`):
- `ElectronIpcClient`: Type-safe IPC communication
- `GitHubClient`: Renderer-side API wrapper

### Type-Safe IPC with Effect Schema

All IPC communication is contract-based via domain-specific contract files in `src/shared/`:
- `ipc-contracts.ts` exports all contracts: `AccountIpcContracts`, `GitHubIpcContracts`
- Each contract defines: `channel`, `input` schema, `output` schema, and `errors` schema
- Uses Effect Schema for runtime validation at process boundaries
- Handlers in `src/main/ipc/{domain}-handlers.ts` auto-decode/encode messages
- Error mapping in `src/main/ipc/error-mapper.ts` transforms domain errors (including tier errors) to IPC errors
- Ensures end-to-end type safety across process boundary

**IPC Contract Structure:**
```typescript
export const GitHubIpcContracts = {
  signIn: {
    channel: 'github:signIn' as const,
    input: S.Void,                          // Input schema
    output: S.Struct({ ... }),              // Output schema
    errors: S.Union(AuthenticationError, NetworkError),  // Error union
  },
  // ... more contracts
} as const
```

**CRITICAL: IPC Handler Type Safety Pattern**

When implementing IPC handlers in `src/main/ipc/{domain}-handlers.ts`, use the centralized `registerIpcHandler` utility from `src/main/ipc/ipc-handler-setup.ts`. This utility handles all type safety concerns automatically.

**Recommended Pattern (Using registerIpcHandler):**

```typescript
// src/main/ipc/{domain}-handlers.ts
import { registerIpcHandler } from './ipc-handler-setup'
import { GitHubIpcContracts } from '../../shared/ipc-contracts'

export const setupGitHubIpcHandlers = Effect.gen(function* () {
  const apiService = yield* GitHubApiService
  const authService = yield* GitHubAuthService

  // Register handlers with automatic type safety
  registerIpcHandler(
    GitHubIpcContracts.signIn,
    () => authService.startAuthFlow
  )

  registerIpcHandler(
    GitHubIpcContracts.getRepos,
    (input) => apiService.getRepos(input.username)
  )

  registerIpcHandler(
    GitHubIpcContracts.getPullRequest,
    (input) => apiService.getPullRequest(input.owner, input.repo, input.number)
  )
})
```

**How registerIpcHandler Works:**

The utility provides:
- ✅ **Automatic input validation** (decode from wire format)
- ✅ **Automatic output encoding** (encode to wire format)
- ✅ **Automatic error mapping** (via `mapDomainErrorToIpcError`)
- ✅ **Full type safety** (preserves both decoded and encoded types)
- ✅ **Tracing support** (Effect spans for debugging)

**Key Benefits:**

1. **No Boilerplate**: No need to manually create `setupHandler` functions
2. **Centralized Type Safety**: Type handling logic is in one place (`ipc-handler-setup.ts`)
3. **Consistent Error Handling**: All handlers use the same error mapping
4. **Less Error-Prone**: Reduces chance of type safety mistakes

**Type Safety Under the Hood:**

The utility uses the dual-type schema pattern internally:

```typescript
// Inside registerIpcHandler (you don't write this):
type InputSchemaWithTypes = S.Schema<InputDecoded, InputEncoded, never>
type OutputSchemaWithTypes = S.Schema<OutputDecoded, OutputEncoded, never>

// Type assertions are handled internally:
S.decodeUnknown(contract.input as unknown as InputSchemaWithTypes)(input)
S.encode(contract.output as unknown as OutputSchemaWithTypes)(result)
```

**Why Type Assertions Are Necessary (Internal Detail):**

TypeScript cannot narrow `contract.input` from a union type based on the generic contract parameter. The utility uses `as unknown as InputSchemaWithTypes` internally to preserve both:
- Decoded type: `S.Schema.Type<TInputSchema>` (application-level)
- Encoded type: `S.Schema.Encoded<TInputSchema>` (wire-level)

This is NOT a loss of type safety because:
1. Effect Schema validates at runtime (catches all invalid data)
2. The assertion tells TypeScript what we know to be true at runtime
3. The generic parameters ensure the handler signature matches the contract

**When to Use Manual Pattern:**

In rare cases where `registerIpcHandler` doesn't work (e.g., complex Schema.Class unions), you can fall back to individual handler registration. See `src/main/ipc/ipc-handler-setup.ts` for the implementation reference.

**This pattern applies to ALL IPC handler files:** `github-handlers.ts`, `account-handlers.ts`, `ai-provider-handlers.ts`, and any future domain handlers.

### Reactive State Management with Effect Atoms

Uses `@effect-atom/atom-react` to replace React Query/Zustand patterns:
- **Atoms** defined in `src/renderer/atoms/` integrate Effect runtime with React
  - `account-atoms.ts`: Account management (`accountContextAtom`, `activeAccountAtom`, `tierLimitsAtom`)
  - `github-atoms.ts`: GitHub data (`reposAtom`, `issuesAtom`, etc.)
- **Atom families** for parameterized queries (similar to React Query keys): `reposAtom(username)`, `issuesAtom({ owner, repo, state })`
- **Reactivity keys** for cache invalidation: `['account:context']`, `['github:auth']`, `['github:repos:user']`
- **TTL caching**: `Atom.setIdleTTL(Duration.minutes(5))` for automatic cache expiration
- **Result<T, E>** types for typed error handling in components
- **Result.builder** pattern for rendering UI based on Result state
- **Custom hooks** (`src/renderer/hooks/useGitHubAtoms.ts`) wrap atoms for clean React integration

Example: `reposAtom` family caches repos per user for 5 minutes and invalidates on auth changes. When switching accounts, all relevant atoms invalidate via reactivity keys.

**Result.builder Pattern for Components:**

All atoms return `Result<T, E>` types which represent async operations with three possible states:
- `Initial`: Operation hasn't started or is loading
- `Success<T>`: Operation completed successfully with data of type T
- `Failure<E>`: Operation failed with typed error E

Use the **Result.builder** pattern in React components to handle all states declaratively:

```typescript
export function RepositoryList() {
  const { repos } = useUserRepos()  // repos is Result<GitHubRepository[], IpcError>

  return (
    <div>
      {Result.builder(repos)
        .onInitial(() => (
          <div>Loading repositories...</div>
        ))
        .onErrorTag('AuthenticationError', (error) => (
          <div>Please authenticate first: {error.message}</div>
        ))
        .onErrorTag('NetworkError', (error) => (
          <div>Network error: {error.message}</div>
        ))
        .onErrorTag('NotFoundError', (error) => (
          <div>Not found: {error.message}</div>
        ))
        .onDefect((defect) => (
          <div>Unexpected error: {String(defect)}</div>
        ))
        .onSuccess((repositories) => (
          <div>
            {repositories.map(repo => (
              <div key={repo.id}>{repo.name}</div>
            ))}
          </div>
        ))
        .render()}
    </div>
  )
}
```

**Result.builder API:**
- `.onInitial(render)`: Handle loading state (before data is available)
- `.onErrorTag(tag, render)`: Handle specific error types by their `_tag` field
- `.onDefect(render)`: Handle unexpected errors (bugs, runtime errors)
- `.onSuccess(render)`: Handle successful result with typed data
- `.render()`: Required final call to produce React elements

**Benefits:**
1. **Exhaustive error handling**: TypeScript ensures all error types are handled
2. **No manual loading states**: `onInitial` handles loading automatically
3. **Type-safe success data**: Success callback receives properly typed data
4. **Clear error boundaries**: Each error type can have custom UI

**Common Patterns:**

✅ **CORRECT** - Handle all error types:
```typescript
Result.builder(result)
  .onInitial(() => <Spinner />)
  .onErrorTag('AuthenticationError', () => <LoginPrompt />)
  .onErrorTag('NetworkError', (error) => <ErrorAlert message={error.message} />)
  .onErrorTag('NotFoundError', () => <NotFound />)
  .onDefect((defect) => <ErrorBoundary error={defect} />)
  .onSuccess((data) => <DataView data={data} />)
  .render()
```

❌ **WRONG** - Using Result.getOrElse in components (lose error information):
```typescript
const data = Result.getOrElse(result, () => [])
return <div>{data.map(...)}</div>  // No loading state, no error handling
```

❌ **WRONG** - Manual pattern matching (verbose and error-prone):
```typescript
if (Result.isInitial(result)) return <Spinner />
if (Result.isFailure(result)) {
  const error = Result.getFailure(result)
  // ... manual error handling
}
const data = Result.getSuccess(result)
return <DataView data={data} />
```

### Shared Schemas (`src/shared/schemas/`)

All data models use Effect Schema:
- **Account schemas**: `AccountContext`, `Account`, `AccountId`, `ProviderType` (`schemas/account-context.ts`)
- **GitHub schemas**: `GitHubUser`, `GitHubRepository`, `GitHubIssue`, `GitHubPullRequest`
- **Error types**: `AuthenticationError`, `NetworkError`, `NotFoundError`
- **Tier errors**: `AccountLimitExceededError`, `FeatureNotAvailableError`
- Ensures runtime type safety and validation across all layers

## Key Patterns & Conventions

### 1. Effect Generators for Async Flows
All async operations use Effect generators (`Effect.gen`) for composable, type-safe flows:
```typescript
Effect.gen(function* () {
  const token = yield* getToken
  return yield* httpService.makeAuthenticatedRequest(endpoint, token, schema)
})
```

### 2. Effect.Service for Dependency Injection
Services use the `Effect.Service` pattern:
- Define dependencies via `dependencies` array
- Compose into layers with `Layer.mergeAll`
- Access via `yield* ServiceName` in Effect.gen
- Enables testing via mock layers

**⚠️ CRITICAL: When implementing Effect.Service, ALWAYS double-check:**
1. **Dependencies array** matches all services used via `yield*`
2. **Imports** include all dependency services at the top of the file
3. **All `yield*` statements** correspond to services in the dependencies array
4. Missing any of these will cause runtime errors that TypeScript won't catch!

### 3. GitHub OAuth Flow
OAuth flow using custom protocol handler (`geppetto://`):
1. `GitHubAuthService.startAuthFlow` opens browser to GitHub with redirect URI `geppetto://auth/callback`
2. Custom protocol handler (registered in `src/main/index.ts`) catches callback from browser
3. Protocol callback emits `oauth-callback` event with authorization code
4. Exchanges code for token via `GitHubHttpService.exchangeCodeForToken`
5. Stores encrypted credentials with `SecureStoreService`

This follows the same pattern as GitHub Desktop, VS Code, and other native apps - avoiding port conflicts and network exposure of local HTTP servers.

### 4. Typed Error Handling

All errors are typed and tracked through Effect's error channel using a three-layer approach:

**Layer 1: Domain Errors** (`src/main/{domain}/errors.ts`)
- Domain-specific error classes using `Data.TaggedError`
- Examples: `GitHubAuthError`, `GitHubApiError`, `GitHubTokenExchangeError`
- Contain domain-specific context (status codes, endpoints, etc.)
- Used within services for precise error handling

**Layer 2: IPC Error Mapping** (`src/main/ipc/error-mapper.ts`)
- Maps domain errors to shared error types that cross process boundaries
- Handles tier errors: `AccountLimitExceededError`, `FeatureNotAvailableError`
- Uses `instanceof` checks with actual error classes (not string tags)
- Type-safe error transformation with `mapDomainErrorToIpcError`
- Returns `IpcErrorResult = { _tag: 'Error'; error: AuthenticationError | NetworkError | NotFoundError }`

**Layer 3: Shared Error Types** (`src/shared/schemas/errors.ts`)
- Process-boundary-safe error schemas: `AuthenticationError`, `NetworkError`, `NotFoundError`
- Serializable with Effect Schema
- Renderer receives `Result<T, E>` types for typed error handling in UI

**Error Flow:**
```
Service Error (GitHubAuthError)
  → mapDomainErrorToIpcError
  → IPC Error (AuthenticationError)
  → Renderer (typed Result<T, E>)
```

### 5. Redacted<T> for Sensitive Data
Sensitive data uses `Redacted` type to prevent accidental logging:
```typescript
const token = Redacted.make(tokenString)
const value = Redacted.value(token)  // explicit unwrap required
```
Used throughout for GitHub tokens in storage, IPC contracts, and API calls.

### 6. Result API for Error Handling - CRITICAL PATTERNS

**CRITICAL: All atoms that perform async operations return `Result<T, E>` types from `@effect-atom/atom-react`.**

#### The Result Type Structure

```typescript
type Result<T, E> =
  | { _tag: 'Initial'; waiting: boolean }     // Loading (no data yet)
  | { _tag: 'Success'; value: T; waiting: boolean }  // Has data
  | { _tag: 'Failure'; error: E; waiting: boolean }  // Has error
  | { _tag: 'Defect'; defect: unknown; waiting: boolean }  // Unexpected error (bug)
```

#### REQUIRED Pattern: Use `Result.builder()` for ALL UI Rendering

This is the **ONLY** correct way to handle Result types in components:

```typescript
// ✅ CORRECT: Exhaustive error handling with Result.builder
export function RepositoryList() {
  const { repositoriesResult } = useProviderRepositories('github')

  return Result.builder(repositoriesResult)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('AuthenticationError', (error) => <LoginPrompt error={error} />)
    .onErrorTag('NetworkError', (error) => <ErrorAlert error={error} />)
    .onErrorTag('ProviderOperationError', (error) => <ErrorAlert error={error} />)
    .onDefect((defect) => <UnexpectedError defect={defect} />)
    .onSuccess((data) => <DataView data={data} />)
    .render()  // ← REQUIRED final call
}
```

**Builder Methods (ALL REQUIRED):**
- `.onInitial(render)` - Handle initial loading state
- `.onErrorTag(tag, render)` - Handle EACH specific error type individually
- `.onDefect(render)` - Handle unexpected errors (bugs) - MUST ALWAYS INCLUDE
- `.onSuccess(render)` - Handle successful result with typed data
- `.render()` - **REQUIRED** final call to produce React elements

#### Safe Data Extraction: `Result.match()` and `Result.getOrElse()`

**Use `Result.match()` for derived computations:**

```typescript
// ✅ CORRECT: Use Result.match() for boolean flags and derived values
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (data) => data.value.length > 0,  // CRITICAL: access data.value, not data directly
  onFailure: () => false,
  onInitial: () => false,
})

const accountCount = Result.match(accountsResult, {
  onSuccess: (data) => data.value.length,  // data is { value: T, waiting: boolean }
  onFailure: () => 0,
  onInitial: () => 0,
})

// Use Result.match when:
// - Computing derived boolean flags (isAuthenticated, hasData, isEmpty)
// - You need different return values based on Result state
// - You're in a non-rendering context (hooks, utility functions)
```

**Use `Result.getOrElse()` for data extraction with fallback:**

```typescript
// ✅ CORRECT: Safe extraction with fallback for secondary data
const accounts = Result.getOrElse(accountsResult, () => [])

// Use Result.getOrElse when:
// - You need a default value for secondary/auxiliary data
// - Primary error handling is done elsewhere (e.g., via Result.builder)
// - You're extracting data within a success callback
```

#### CRITICAL - Result.match Callback Signature

**Result.match callbacks receive the full Result object, NOT the unwrapped value:**

```typescript
// ❌ WRONG: Trying to access value directly
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (usage) => usage.length > 0,  // ❌ Type error: Success has no length
  onFailure: () => false,
  onInitial: () => false,
})

// ✅ CORRECT: Access data.value to get the actual data
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (data) => data.value.length > 0,  // ✅ data is { value: T, waiting: boolean }
  onFailure: (err) => false,                    // err is { error: E, waiting: boolean }
  onInitial: (init) => false,                   // init is { waiting: boolean }
})
```

#### Handling Loading States: Check `waiting` Field

The `waiting` boolean indicates whether an Effect is currently executing:

```typescript
// ✅ CORRECT: Check both _tag and waiting for granular states
const isInitialLoad = result._tag === 'Initial' && result.waiting      // First load
const isRefreshing = result._tag === 'Success' && result.waiting      // Refetching with stale data
const isRetrying = result._tag === 'Failure' && result.waiting        // Retrying after error
const isFetching = result.waiting                                      // Any active operation
```

#### Complete Real-World Example

```typescript
export function RepositoryList() {
  const { accountsResult } = useProviderAuth('github')
  const { repositoriesResult } = useProviderRepositories('github')

  // Primary data MUST use Result.builder for full error handling
  return Result.builder(repositoriesResult)
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
      // Secondary data can use safe extraction with fallback
      const accounts = Result.getOrElse(accountsResult, () => [])

      if (groups.length === 0) {
        return <EmptyState message="No repositories found" />
      }

      return (
        <div className="space-y-6">
          {groups.map(group => {
            // Graceful degradation if account data is unavailable
            const account = accounts.find(acc => acc.id === group.accountId) ?? null
            return (
              <RepoGroup
                key={group.accountId}
                group={group}
                accountName={account?.displayName ?? account?.username ?? group.accountId}
              />
            )
          })}
        </div>
      )
    })
    .render()
}
```

**Why This Pattern Works:**
1. ✅ Primary data (repositories) has exhaustive error handling
2. ✅ All 4 Result states handled: Initial, Error (by tag), Defect, Success
3. ✅ Secondary data (accounts) uses safe extraction with graceful fallback
4. ✅ Empty success case handled within `.onSuccess()`
5. ✅ No null checks or optional chaining needed
6. ✅ TypeScript enforces handling all error types

#### Anti-Patterns to NEVER Use

```typescript
// ❌ WRONG: Accessing value directly in Result.match (forgetting data.value)
const isAuthenticated = Result.match(usageResult, {
  onSuccess: (usage) => usage.length > 0,  // Type error: Success object has no length!
  onFailure: () => false,
  onInitial: () => false,
})

// ❌ WRONG: Using getOrElse for primary data (loses error handling)
const repos = Result.getOrElse(repositoriesResult, () => [])
return <div>{repos.map(...)}</div>  // No loading, no errors shown!

// ❌ WRONG: Manual pattern matching (verbose, easy to forget cases)
if (result._tag === 'Initial') return <Spinner />
if (result._tag === 'Failure') return <Error />
// ... missing Defect case!

// ❌ WRONG: Not handling Defect state
Result.builder(result)
  .onInitial(() => <Loading />)
  .onErrorTag('NetworkError', () => <Error />)
  .onSuccess((data) => <UI />)
  .render()
  // ^ TypeScript should error: missing .onDefect()
```

**For comprehensive details and more examples, see `docs/RESULT_API_AND_ERROR_HANDLING.md`**

### 7. TypeScript Type Safety - Avoid `unknown` and `any`

**CRITICAL RULE: This codebase maintains strict type safety. DO NOT use `unknown` or `any` types except in very specific, justified cases.**

**When `unknown` is Acceptable:**
- ✅ External input boundaries (e.g., `ipcMain.handle(_event, input: unknown)`)
- ✅ As part of necessary type assertions with Effect Schema (e.g., `as unknown as InputSchema`)
- ✅ When dealing with truly unknown data that will be immediately validated

**When `any` is NEVER Acceptable:**
- ❌ NEVER use `any` to bypass type errors
- ❌ NEVER use `any` in function parameters or return types
- ❌ NEVER use `any` to avoid figuring out the correct type

**Proper Type Assertion Pattern:**

When TypeScript cannot infer types due to limitations (like indexed union types), use **double type assertion** with proper type definitions:

```typescript
// ✅ CORRECT: Proper type definition then double assertion
type InputSchema = S.Schema<ContractInput<K>, S.Schema.Encoded<typeof Contracts[K]['input']>>
const validated = yield* S.decodeUnknown(contract.input as unknown as InputSchema)(input)

// ❌ WRONG: Using unknown without type definition
const validated = yield* S.decodeUnknown(contract.input as S.Schema<unknown>)(input)

// ❌ NEVER: Using any
const validated = yield* S.decodeUnknown(contract.input as any)(input)
```

**Why This Matters:**
1. **Type Safety is Runtime Safety**: Our Effect Schema validation relies on accurate types
2. **Refactoring Confidence**: Proper types enable safe refactoring across the codebase
3. **Documentation**: Types serve as inline documentation for future developers
4. **Compiler Assistance**: TypeScript can catch bugs only if types are accurate

**When You're Stuck:**
- Use `S.Schema.Type<typeof Schema>` to extract types from schemas
- Use `S.Schema.Encoded<typeof Schema>` to get the encoded (wire) type
- Define intermediate type aliases to help TypeScript infer correctly
- Ask for clarification rather than using `any` or overly broad `unknown`

## Environment Variables

Required in `.env`:
- `GITHUB_CLIENT_ID`: GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth app client secret
- `STORE_ENCRYPTION_KEY`: Key for encrypting stored credentials (use secure value in production)

Tier-specific (`.env.free`, `.env.pro`):
- `APP_TIER`: `free` or `pro`
- `APP_NAME`: Application display name (e.g., "Geppetto Free", "Geppetto Pro")
- `APP_ID_SUFFIX`: Suffix for app ID (e.g., `free`, `pro`)

## Implementation Guidelines

### Adding New API Endpoints to Existing Domain

When adding new features to an existing domain (e.g., GitHub):

**1. Define Data Schema** (`src/shared/schemas/{domain}/`)
```typescript
// src/shared/schemas/github/pull-request.ts
export class PullRequest extends S.Class<PullRequest>('PullRequest')({
  id: S.Number,
  title: S.String,
  // ... fields
}) {}
```

**2. Add IPC Contract** (`src/shared/ipc-contracts.ts`)
```typescript
export const GitHubIpcContracts = {
  // ... existing contracts
  getPullRequest: {
    channel: 'github:getPullRequest' as const,
    input: S.Struct({ owner: S.String, repo: S.String, number: S.Number }),
    output: PullRequest,
    errors: S.Union(AuthenticationError, NetworkError, NotFoundError),
  },
} as const
```

**3. Implement Service Method** (`src/main/{domain}/api-service.ts`)
```typescript
getPullRequest: (owner: string, repo: string, number: number) =>
  Effect.gen(function* () {
    const token = yield* getToken
    return yield* httpService.makeAuthenticatedRequest(
      `/repos/${owner}/${repo}/pulls/${number}`,
      token,
      PullRequest
    )
  })
```

**4. Register IPC Handler** (`src/main/ipc/{domain}-handlers.ts`)
```typescript
import { registerIpcHandler } from './ipc-handler-setup'

// Inside your setupXxxIpcHandlers function:
registerIpcHandler(
  GitHubIpcContracts.getPullRequest,
  (input) => apiService.getPullRequest(input.owner, input.repo, input.number)
)
```
*No error handling needed - automatically mapped by `registerIpcHandler` via `mapDomainErrorToIpcError`*

**5. Create Atom** (`src/renderer/atoms/{domain}-atoms.ts`)
```typescript
export const pullRequestAtom = Atom.family((params: { owner: string; repo: string; number: number }) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* GitHubClient
      return yield* client.getPullRequest(params)
    })
  )
    .pipe(Atom.setIdleTTL(Duration.minutes(5)))
    .pipe(Atom.withReactivityKeys([['github:auth'], ['github:pr', params]]))
)
```

**6. Use in Components**
```typescript
const { data, isLoading, error } = useAtomValue(pullRequestAtom({ owner, repo, number }))
```

### Adding a New OAuth Provider Domain

To add a new provider (e.g., GitLab, Bitbucket):

**1. Create Domain Structure**
```
src/main/gitlab/
├── errors.ts           # GitLabAuthError, GitLabApiError, etc.
├── http-service.ts     # HTTP client for GitLab API
├── auth-service.ts     # OAuth flow using gitlab:// protocol
├── api-service.ts      # High-level GitLab operations
└── schemas.ts          # Domain-specific types (if any)
```

**2. Define Shared Schemas** (`src/shared/schemas/gitlab/`)
```typescript
export class GitLabUser extends S.Class<GitLabUser>('GitLabUser')({ ... })
export class GitLabProject extends S.Class<GitLabProject>('GitLabProject')({ ... })
```

**3. Create IPC Contracts** (`src/shared/ipc-contracts.ts`)
```typescript
export const GitLabIpcContracts = {
  signIn: {
    channel: 'gitlab:signIn' as const,
    input: S.Void,
    output: S.Struct({ user: GitLabUser, token: S.Redacted(S.String) }),
    errors: S.Union(AuthenticationError, NetworkError),
  },
  // ... more contracts
} as const
```

**4. Extend Error Mapper** (`src/main/ipc/error-mapper.ts`)
```typescript
import { GitLabAuthError, GitLabApiError } from '../gitlab/errors'

type GitLabDomainError = GitLabAuthError | GitLabApiError | ...

const isGitLabDomainError = (error: unknown): error is GitLabDomainError => {
  return error instanceof GitLabAuthError || error instanceof GitLabApiError || ...
}

export const mapDomainErrorToIpcError = (error: unknown): Effect.Effect<IpcErrorResult> => {
  // Add GitLab error handling
  if (isGitLabDomainError(error)) {
    // ... map to AuthenticationError or NetworkError
  }

  // Existing GitHub handling
  if (isGitHubDomainError(error)) { ... }

  // ... fallback
}
```

**5. Create Handler Setup** (`src/main/ipc/gitlab-handlers.ts`)
```typescript
import { registerIpcHandler } from './ipc-handler-setup'
import { GitLabIpcContracts } from '../../shared/ipc-contracts'

export const setupGitLabIpcHandlers = Effect.gen(function* () {
  const authService = yield* GitLabAuthService
  const apiService = yield* GitLabApiService

  // Register handlers using the centralized utility
  registerIpcHandler(
    GitLabIpcContracts.signIn,
    () => authService.startAuthFlow
  )

  registerIpcHandler(
    GitLabIpcContracts.getProjects,
    (input) => apiService.getProjects(input.username)
  )

  // ... register all other handlers
})
```

**6. Register Protocol & Layer** (`src/main/index.ts`)
```typescript
// Register protocol
app.setAsDefaultProtocolClient('gitlab')

// Add to MainLayer
const MainLayer = Layer.mergeAll(
  // GitHub services
  GitHubHttpService.Default,
  GitHubAuthService.Default,
  // ...

  // GitLab services
  GitLabHttpService.Default,
  GitLabAuthService.Default,
  // ...
)

// Setup handlers
Effect.runPromise(
  Effect.gen(function* () {
    yield* setupGitHubIpcHandlers
    yield* setupGitLabIpcHandlers  // Add new handlers
  }).pipe(Effect.provide(MainLayer))
)
```

**7. Create Renderer Atoms** (`src/renderer/atoms/gitlab-atoms.ts`)
```typescript
// Mirror the pattern from github-atoms.ts
```

### Key Principles

1. **Type Safety First**: Use `S.Schema.Type<>` and `S.Schema.Encoded<>` to extract types from schemas
2. **No `any` Types**: Use `unknown` with runtime validation where TypeScript can't infer
3. **Domain Isolation**: Each provider is independent with its own errors, services, and schemas
4. **Centralized Error Mapping**: All domain errors funnel through `error-mapper.ts`
5. **Contract-Based IPC**: All cross-process communication validated by schemas
6. **Effect Generators**: Use `Effect.gen` for all async operations
7. **Service Dependencies**: Declare in `dependencies` array, compose with `Layer.mergeAll`

### Testing Approach

- Services are testable in isolation using Effect's testing utilities
- Mock layers can replace real services for dependency injection
- IPC contracts enable contract testing between processes
- Atoms can be tested independently from React components

### File Structure Summary

```
src/
├── shared/                      # IPC contracts and schemas (cross-process types)
│   ├── tier-config.ts          # Tier configuration (Free/Pro limits)
│   ├── ipc-contracts.ts        # All IPC contract exports (AccountIpcContracts, GitHubIpcContracts)
│   └── schemas/
│       ├── errors.ts            # Shared error types (AuthenticationError, NetworkError, NotFoundError)
│       ├── account-context.ts   # AccountContext aggregate, Account entity, domain events
│       ├── github/              # GitHub domain schemas
│       │   ├── user.ts
│       │   ├── repository.ts
│       │   ├── issue.ts
│       │   └── pull-request.ts
│       └── gitlab/              # Future: GitLab domain schemas
│
├── main/                        # Main process (Node.js, Effect services)
│   ├── tier/                    # Tier management
│   │   └── tier-service.ts      # TierService - feature gating and limit enforcement
│   │
│   ├── account/                 # Multi-account management
│   │   └── account-context-service.ts  # AccountContextService - DDD aggregate management
│   │
│   ├── github/                  # GitHub domain
│   │   ├── errors.ts            # GitHubAuthError, GitHubApiError, etc.
│   │   ├── http-service.ts      # HTTP client for GitHub API
│   │   ├── auth-service.ts      # OAuth flow (geppetto:// protocol) with account integration
│   │   ├── store-service.ts     # Multi-account encrypted token storage
│   │   ├── api-service.ts       # High-level GitHub operations
│   │   └── schemas.ts           # Domain-specific types (StoredGitHubAuth, etc.)
│   │
│   ├── gitlab/                  # Future: GitLab domain (same structure as github/)
│   │
│   └── ipc/                     # IPC handler registration
│       ├── error-mapper.ts      # Maps all domain errors (GitHub, tier) to IPC errors
│       ├── account-handlers.ts  # Account management IPC handlers
│       ├── github-handlers.ts   # GitHub IPC handlers
│       └── gitlab-handlers.ts   # Future: GitLab IPC handlers
│
├── renderer/                    # Renderer process (React + atoms)
│   ├── atoms/
│   │   ├── account-atoms.ts     # Account management state atoms
│   │   ├── github-atoms.ts      # GitHub state atoms
│   │   └── gitlab-atoms.ts      # Future: GitLab state atoms
│   ├── hooks/
│   │   └── useGitHubAtoms.ts    # GitHub custom hooks
│   ├── components/              # UI components
│   └── lib/
│       ├── ipc-client.ts        # Base IPC client
│       └── github-client.ts     # GitHub-specific client wrapper
│
└── preload/
    └── index.ts                 # IPC bridge (contextBridge)
```

### Architecture Decisions & Rationale

**Why Tiered Architecture?**
- **Monetization**: Clear free/pro distinction enables business model
- **Feature Gating**: Compile-time tier configuration prevents feature leakage
- **User Segmentation**: Different app IDs allow free and pro to coexist on same system
- **Account Limits**: DDD AccountContext aggregate enforces tier limits with domain events
- **Scalability**: Easy to add new tiers or adjust limits per tier

**Why Domain-Driven Organization?**
- **Scalability**: Easy to add new OAuth providers (GitLab, Bitbucket, Azure DevOps)
- **Isolation**: Each domain has its own errors, services, schemas
- **Maintainability**: Changes to one provider don't affect others
- **Testing**: Mock individual domains independently

**Why Centralized Error Mapper?**
- Single source of truth for error transformation
- Easy to add new domain errors without touching handler code
- Type-safe error handling using `instanceof` checks
- Prevents error handling duplication across handlers

**Why Schema-First?**
- Runtime validation catches invalid data at boundaries
- Type inference from schemas (no manual type definitions)
- Contract-based testing between processes
- Self-documenting API contracts

**Why Effect Services?**
- Dependency injection for testability
- Composable effects (retry, timeout, fallback)
- Error channel tracking (no thrown exceptions)
- Resource management (automatic cleanup)
