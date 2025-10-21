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

1. **Main Process** (`src/main/`): Node.js environment with Effect Services for GitHub API operations and IPC handlers
2. **Preload Script** (`src/preload/`): Secure IPC bridge exposing typed APIs to renderer via `contextBridge`
3. **Renderer Process** (`src/renderer/`): React app using Effect Atoms for reactive state management
4. **Shared Layer** (`src/shared/`): Type-safe IPC contracts and schemas shared between processes

This architecture demonstrates a custom Effect-based abstraction over Electron's ipcMain/ipcRenderer for type-safe cross-process communication.

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

All IPC communication is contract-based via `src/shared/ipc-contracts.ts`:
- Defines channels, input/output schemas, and error types
- Uses Effect Schema for runtime validation
- Handlers in `src/main/ipc/github-handlers.ts` auto-decode/encode messages
- Ensures type safety across process boundary

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
All errors are typed and tracked through Effect's error channel:
- Domain errors in `src/main/github/errors.ts`: `GitHubAuthError`, `GitHubApiError`, etc.
- Shared error types in `src/shared/schemas/errors.ts`: `AuthenticationError`, `NetworkError`, `NotFoundError`
- IPC handlers catch and transform errors to shared types
- Renderer receives `Result<T, E>` types for typed error handling in UI

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

### Adding New Features

When adding GitHub API features:
1. Define schema in `src/shared/schemas/` using Effect Schema
2. Add IPC contract to `src/shared/ipc-contracts.ts` with input/output/errors
3. Implement service method in `src/main/github/api-service.ts`
4. Add handler to `src/main/ipc/github-handlers.ts`
5. Create atom in `src/renderer/atoms/github-atoms.ts` with appropriate TTL and reactivity keys
6. Build UI components using custom hooks

### Testing Approach

- Services are testable in isolation using Effect's testing utilities
- Mock layers can replace real services for dependency injection
- IPC contracts enable contract testing between processes
- Atoms can be tested independently from React components

### File Structure Summary

```
src/
├── shared/          # IPC contracts and schemas (cross-process types)
│   ├── ipc-contracts.ts
│   └── schemas/
├── main/            # Main process (Node.js, Effect services)
│   ├── github/      # GitHub API services
│   └── ipc/         # IPC handlers
├── renderer/        # Renderer process (React + atoms)
│   ├── atoms/       # Effect atoms for state
│   ├── hooks/       # Custom React hooks
│   ├── components/  # UI components
│   └── lib/         # IPC client
└── preload/         # IPC bridge (contextBridge)
```
