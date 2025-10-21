# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern GitHub Desktop clone demonstrating type-safe IPC communication in Electron using Effect and @effect-atom/atom-react for state management. This application showcases functional programming patterns with end-to-end type safety from the main process to UI components.

## Key Technologies

- **Effect**: Functional programming library for error handling, dependency injection (services/layers), and structured concurrency
- **@effect-atom/atom-react**: Reactive state management replacing React Query/Zustand patterns
- **Effect Schema**: Runtime type validation enforced across process boundaries
- **Electron**: Desktop framework with main/renderer process architecture
- **TypeScript**: Full type safety throughout the stack

## Development Commands

```bash
# Development with hot reload
pnpm dev

# Build the application
pnpm compile:app

# Lint code
pnpm lint
pnpm lint:fix  # with auto-fix

# Preview built application
pnpm start

# Full build with packaging
pnpm prebuild
pnpm build

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

All services are composed into `MainLayer` in `src/main/index(1).ts`:
```typescript
const MainLayer = Layer.mergeAll(
  GitHubHttpService.Default,
  SecureStoreService.Default,
  GitHubAuthService.Default,
  GitHubApiService.Default
)
```

**Renderer Services** (`src/renderer/lib/`):
- `ElectronIpcClient`: Type-safe IPC communication
- `GitHubClient`: Renderer-side API wrapper

### Type-Safe IPC with Effect Schema

All IPC communication is contract-based via domain-specific contract files in `src/shared/`:
- `ipc-contracts.ts` exports all contracts (currently `GitHubIpcContracts`)
- Each contract defines: `channel`, `input` schema, `output` schema, and `errors` schema
- Uses Effect Schema for runtime validation at process boundaries
- Handlers in `src/main/ipc/{domain}-handlers.ts` auto-decode/encode messages
- Error mapping in `src/main/ipc/error-mapper.ts` transforms domain errors to IPC errors
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

### Reactive State Management with Effect Atoms

Uses `@effect-atom/atom-react` to replace React Query/Zustand patterns:
- **Atoms** defined in `src/renderer/atoms/github-atoms.ts` integrate Effect runtime with React
- **Atom families** for parameterized queries (similar to React Query keys): `reposAtom(username)`, `issuesAtom({ owner, repo, state })`
- **Reactivity keys** for cache invalidation: `['github:auth']`, `['github:repos:user']`
- **TTL caching**: `Atom.setIdleTTL(Duration.minutes(5))` for automatic cache expiration
- **Result<T, E>** types for typed error handling in components
- **Custom hooks** (`src/renderer/hooks/useGitHubAtoms.ts`) wrap atoms for clean React integration

Example: `reposAtom` family caches repos per user for 5 minutes and invalidates on auth changes.

### Shared Schemas (`src/shared/schemas/`)

All data models use Effect Schema:
- `GitHubUser`, `GitHubRepository`, `GitHubIssue`
- Error types: `AuthenticationError`, `NetworkError`, `NotFoundError`
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
- Uses `instanceof` checks with actual error classes (not string tags)
- Type-safe error transformation with `mapDomainErrorToIpcError`
- Returns `IpcErrorResult = { _tag: 'Error'; error: AuthenticationError | NetworkError }`

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

## Environment Variables

Required in `.env`:
- `GITHUB_CLIENT_ID`: GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth app client secret
- `STORE_ENCRYPTION_KEY`: Key for encrypting stored credentials (use secure value in production)

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
setupHandler('getPullRequest', (input: ContractInput<'getPullRequest'>) =>
  apiService.getPullRequest(input.owner, input.repo, input.number))
```
*No error handling needed - automatically mapped by `mapDomainErrorToIpcError`*

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
export const setupGitLabIpcHandlers = Effect.gen(function* () {
  const authService = yield* GitLabAuthService
  const apiService = yield* GitLabApiService

  type ContractInput<K extends keyof typeof GitLabIpcContracts> =
    S.Schema.Type<typeof GitLabIpcContracts[K]['input']>
  type ContractOutput<K extends keyof typeof GitLabIpcContracts> =
    S.Schema.Type<typeof GitLabIpcContracts[K]['output']>

  const setupHandler = <K extends keyof typeof GitLabIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    // ... same pattern as github-handlers.ts
  }

  setupHandler('signIn', () => authService.startAuthFlow)
  // ... register all handlers
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
├── shared/                    # IPC contracts and schemas (cross-process types)
│   ├── ipc-contracts.ts      # All IPC contract exports (GitHubIpcContracts, etc.)
│   └── schemas/
│       ├── errors.ts          # Shared error types (AuthenticationError, NetworkError)
│       ├── github/            # GitHub domain schemas
│       │   ├── user.ts
│       │   ├── repository.ts
│       │   └── issue.ts
│       └── gitlab/            # Future: GitLab domain schemas
│
├── main/                      # Main process (Node.js, Effect services)
│   ├── github/                # GitHub domain
│   │   ├── errors.ts          # GitHubAuthError, GitHubApiError, etc.
│   │   ├── http-service.ts    # HTTP client for GitHub API
│   │   ├── auth-service.ts    # OAuth flow (geppetto:// protocol)
│   │   ├── store-service.ts   # Encrypted credential storage
│   │   ├── api-service.ts     # High-level GitHub operations
│   │   └── schemas.ts         # Domain-specific types (StoredGitHubAuth, etc.)
│   │
│   ├── gitlab/                # Future: GitLab domain (same structure as github/)
│   │
│   └── ipc/                   # IPC handler registration
│       ├── error-mapper.ts    # Maps all domain errors to IPC errors
│       ├── github-handlers.ts # Registers GitHub IPC handlers
│       └── gitlab-handlers.ts # Future: GitLab IPC handlers
│
├── renderer/                  # Renderer process (React + atoms)
│   ├── atoms/
│   │   ├── github-atoms.ts    # GitHub state atoms
│   │   └── gitlab-atoms.ts    # Future: GitLab state atoms
│   ├── hooks/
│   │   └── useGitHubAtoms.ts  # GitHub custom hooks
│   ├── components/            # UI components
│   └── lib/
│       ├── ipc-client.ts      # Base IPC client
│       └── github-client.ts   # GitHub-specific client wrapper
│
└── preload/
    └── index.ts               # IPC bridge (contextBridge)
```

### Architecture Decisions & Rationale

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
