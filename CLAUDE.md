# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern GitHub Desktop clone with **tiered deployment** (Free/Pro) demonstrating type-safe IPC communication in Electron using Effect and @effect-atom/atom-react for state management. This application showcases functional programming patterns with end-to-end type safety, DDD-based multi-account management, tier-based feature gating, and **Layer-based Hexagonal Architecture** for multi-provider orchestration.

## Key Technologies

- **Effect**: Functional programming library for error handling, dependency injection (services/layers), and structured concurrency
- **@effect-atom/atom-react**: Reactive state management replacing React Query/Zustand patterns
- **Effect Schema**: Runtime type validation enforced across process boundaries
- **Electron**: Desktop framework with main/renderer process architecture
- **TypeScript**: Full type safety throughout the stack
- **Hexagonal Architecture**: Ports & Adapters pattern with hot-swappable implementations

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

### Layer-Based Hexagonal Architecture

**CRITICAL: Use Ports & Adapters pattern (Layer-based hexagonal architecture) for all multi-provider domains.**

The application implements hexagonal architecture using Effect's Layer system:
- **Hot-swappable adapters**: Replace implementations for testing/mocking
- **Multi-provider orchestration**: Access multiple providers simultaneously
- **Clean dependency injection**: Adapters captured at construction time
- **Zero coupling**: Business logic depends on abstract ports, not concrete implementations

**Architecture Components** (see `src/main/ai/` for reference implementation):
- **Port** (`provider-port.ts`): Interface all providers implement + tag registry
- **Adapters** (`{provider}/adapter.ts`): Layer implementations of the port
- **Adapters Layer** (`adapters-layer.ts`): Composition of all provider adapters
- **Registry Service** (`registry.ts`): Captures adapters at construction, provides lookup
- **Domain Service**: Business logic orchestrating providers via registry

**Critical Memoization Pattern**:
```typescript
// ✅ CORRECT: Module-level constant ensures single construction
export const CoreInfrastructureLayer = Layer.mergeAll(/* shared services */)
```
Effect memoizes by **object reference**, not service tag. Always share infrastructure layers via module-level constants.

**See detailed documentation**:
- `docs/AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md`: Hexagonal architecture deep dive
- `docs/AI_PROVIDER_LIFECYCLE.md`: Provider lifecycle and memoization
- `docs/AI_LAYERS_HEXAGONAL_AGENTS_BENEFIT.md`: Multi-provider patterns for AI agents

### Tiered Architecture (Free vs Pro)

Two deployment tiers with separate builds (`APP_TIER` env var):

**Free Tier**: Single GitHub account, no account switching
**Pro Tier**: Unlimited accounts with switcher UI, multi-provider support

**Feature Gating**: `TierService` validates operations against tier limits
```typescript
const tierService = yield* TierService
yield* tierService.checkCanAddAccount('github', accountContext)
yield* tierService.checkFeatureAvailable('account-switcher')
```

**Multi-Account Architecture**:
- `AccountContext` aggregate (DDD) with unique `AccountId`: `{provider}:{userId}`
- `SecureStoreService`: Encrypted token storage per account
- Tier validation integrated into `AccountContextService`

**Key files**: `src/shared/tier-config.ts`, `src/main/tier/tier-service.ts`, `src/main/account/account-context-service.ts`

### Domain-Driven Organization

The application is organized by **domains** (e.g., `github/`, `ai/`, future: `gitlab/`, `bitbucket/`), where each domain contains:
- **Ports**: Abstract interfaces defining contracts (e.g., `AiProviderPort`, `VcsProviderPort`)
- **Adapters**: Concrete implementations as Layers (e.g., `OpenAiBrowserProviderAdapter`)
- **Services**: Business logic and orchestration (`{domain}-service.ts`)
- **Errors**: Domain-specific error classes using `Data.TaggedError`
- **Schemas**: Domain-specific data models (stored in `src/shared/schemas/{domain}/`)

This organization enables:
- Multiple providers per domain (GitHub, GitLab, Bitbucket for VCS; OpenAI, Claude, Cursor for AI)
- Clean separation of concerns (Port/Adapter/Service)
- Isolated testing and maintenance
- Easy addition of new providers via Layer composition

### Effect Services & Layer Composition

**Core Infrastructure** (`CoreInfrastructureLayer`): Shared services (session, auth, storage, tier)

**Domain Services**:
- **VCS** (`src/main/github/`): HTTP, Auth, API services + provider adapter
- **AI** (`src/main/ai/`): Port, adapters (OpenAI/Claude/Cursor), registry, orchestration services

**Layer Composition** (`src/main/index.ts`):
```typescript
const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,  // Shared (memoized by reference)

  // Domain services with adapter injection
  Layer.provide(
    Layer.mergeAll(RegistryService.Default, DomainService.Default),
    AdaptersLayer  // Provides adapters to services
  )
)
```

**Renderer**: `ElectronIpcClient`, domain-specific clients (`GitHubClient`, `AiProviderClient`)

### Type-Safe IPC with Effect Schema

All IPC uses contract-based schemas (`src/shared/ipc-contracts.ts`):
- Contracts define: `channel`, `input`/`output`/`errors` schemas
- Runtime validation via Effect Schema at process boundaries
- Error mapping (`error-mapper.ts`) transforms domain → IPC errors

**CRITICAL: Use `registerIpcHandler` utility** (`src/main/ipc/ipc-handler-setup.ts`):
```typescript
// Handles validation, encoding, error mapping automatically
registerIpcHandler(
  AiProviderIpcContracts.signIn,
  (input) => aiProviderService.signIn(input.provider)
)
```

Benefits: Auto validation/encoding, centralized error handling, full type safety

### Reactive State Management with Effect Atoms

Uses `@effect-atom/atom-react` for React integration:
- **Atoms** in `src/renderer/atoms/`: Domain state with Effect runtime (`account-atoms.ts`, `github-atoms.ts`, `ai-atoms.ts`)
- **Atom families**: Parameterized queries like `reposAtom(username)`, `aiUsageAtom(provider)`
- **Reactivity keys**: Cache invalidation (`['account:context']`, `['github:auth']`)
- **TTL caching**: `Atom.setIdleTTL(Duration.minutes(5))`
- **Result<T, E>** types: Three states (`Initial`, `Success<T>`, `Failure<E>`)

**Result Error Handling** - Two recommended patterns:

1. **UI Rendering** with `Result.builder`:
```typescript
{Result.builder(usageResult)
  .onInitial(() => <div>Loading...</div>)
  .onErrorTag('AuthenticationError', (error: AuthenticationError) => (
    <div>Auth error: {error.message}</div>
  ))
  .onErrorTag('NetworkError', (error: NetworkError) => (
    <div>Network error</div>
  ))
  .onDefect((defect: unknown) => <div>Unexpected: {String(defect)}</div>)
  .onSuccess((data) => <div>{/* render data */}</div>)
  .render()}
```

2. **Side Effects** with `Result.matchWithError` (useEffect):
```typescript
React.useEffect(() => {
  if (result.waiting) return

  Result.matchWithError(result, {
    onInitial: () => {},
    onError: (error: MyError) => {
      if (error._tag === 'AuthenticationError') {
        setErrorMessage(error.message)
      }
    },
    onDefect: (defect: unknown) => console.error(defect),
    onSuccess: (data) => setData(data),
  })
}, [result])
```

**See comprehensive documentation:**
- `docs/RESULT_ERROR_HANDLING_PATTERNS.md`: Best practices and type-safe patterns
- `docs/RESULT_API_AND_ERROR_HANDLING.md`: Complete API reference

### Shared Schemas (`src/shared/schemas/`)

All data models use Effect Schema:
- **Account schemas**: `AccountContext`, `Account`, `AccountId`, `ProviderType` (`schemas/account-context.ts`)
- **GitHub schemas**: `GitHubUser`, `GitHubRepository`, `GitHubIssue`, `GitHubPullRequest`
- **AI schemas**: `AiProviderType`, `AiProviderSignInResult`, `AiUsageSnapshot`, `AiUsageMetric`
- **Error types**: `AuthenticationError`, `NetworkError`, `NotFoundError`
- **Tier errors**: `AccountLimitExceededError`, `FeatureNotAvailableError`
- Ensures runtime type safety and validation across all layers

## Key Patterns & Conventions

### 1. Hexagonal Architecture (Ports & Adapters)

**See "Layer-Based Hexagonal Architecture" section above** for complete pattern. Reference implementation: `src/main/ai/`

**Key steps**: Define port → Tag registry → Adapters as Layers → Compose AdaptersLayer → Registry captures adapters → Inject via MainLayer

### 2. Effect Generators
Use `Effect.gen` for all async operations:
```typescript
Effect.gen(function* () {
  const token = yield* getToken
  return yield* httpService.makeRequest(endpoint, token, schema)
})
```

### 3. Effect.Service Pattern
**⚠️ CRITICAL**: Dependencies array must match all `yield*` service uses. TypeScript won't catch mismatches!

### 4. Layer Memoization
Effect memoizes by **object reference**. Share infrastructure via module-level constants:
```typescript
// ✅ CORRECT
export const CoreInfrastructureLayer = Layer.mergeAll(/* services */)
// Use same constant everywhere
```

### 5. Typed Error Handling
Three-layer approach:
1. **Domain errors** (`Data.TaggedError`) → 2. **IPC mapping** (`error-mapper.ts`) → 3. **Shared schemas** (serializable)

### 6. Sensitive Data
Use `Redacted<T>` for tokens/secrets to prevent accidental logging

### 7. Type Safety
**NO `any` types**. Use `unknown` only at validation boundaries

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

### Adding a New Provider to Existing Domain

Example: Adding Gemini to AI providers

1. **Implement adapter** (`src/main/ai/gemini/adapter.ts`): Register tag, implement `AiProviderPort` as Layer
2. **Add to AdaptersLayer** (`adapters-layer.ts`): Merge with existing adapters
3. **Add domain errors** (if needed): `errors.ts` and `error-mapper.ts`

**That's it!** Registry auto-discovers it, IPC handlers work automatically, renderer can query via atoms.

### Adding a New Domain with Multi-Provider Support

Example: Email domain with Gmail/Outlook

1. **Port definition** (`provider-port.ts`): Interface + tag registry
2. **Adapters**: Implement each provider as Layer
3. **AdaptersLayer**: Compose all adapters
4. **Registry Service**: Captures adapters at construction
5. **Domain Service**: Business logic via registry
6. **MainLayer integration**: Inject adapters into services
7. **IPC contracts, handlers, atoms**: Follow existing domain patterns (see `src/main/ai/` or `src/main/github/`)

### Key Principles

1. **Hexagonal Architecture**: Ports & Adapters for multi-provider domains
2. **Layer Memoization**: Share infrastructure via module-level constants
3. **Type Safety**: Extract types from schemas, NO `any` types
4. **Domain Isolation**: Independent providers with own errors/services/schemas
5. **Contract-Based IPC**: Schema validation at process boundaries
6. **Effect Generators**: `Effect.gen` for all async operations

### File Structure Summary

```
src/
├── shared/                      # IPC contracts and schemas (cross-process types)
│   ├── tier-config.ts          # Tier configuration (Free/Pro limits)
│   ├── ipc-contracts.ts        # All IPC contract exports
│   └── schemas/
│       ├── errors.ts            # Shared error types
│       ├── account-context.ts   # AccountContext aggregate
│       ├── ai/                  # AI domain schemas
│       │   ├── provider.ts      # AiProviderType, AiUsageSnapshot, etc.
│       │   └── usage.ts         # AiUsageMetric
│       └── github/              # GitHub domain schemas
│
├── main/                        # Main process (Node.js, Effect services)
│   ├── core-infrastructure-layer.ts  # Shared services (memoized by reference)
│   │
│   ├── tier/                    # Tier management
│   │   └── tier-service.ts
│   │
│   ├── account/                 # Multi-account management
│   │   └── account-context-service.ts
│   │
│   ├── ai/                      # AI domain (Hexagonal)
│   │   ├── provider-port.ts     # Port definition + tag registry
│   │   ├── infrastructure-layer.ts  # Re-exports CoreInfrastructureLayer
│   │   ├── adapters-layer.ts    # Composes all AI adapters
│   │   ├── registry.ts          # Registry service (captures adapters)
│   │   ├── ai-provider-service.ts   # High-level orchestration
│   │   ├── openai/
│   │   │   └── browser-provider-adapter.ts  # OpenAI adapter (Layer)
│   │   ├── claude/
│   │   │   └── browser-provider-adapter.ts  # Claude adapter (Layer)
│   │   └── cursor/
│   │       └── browser-provider-adapter.ts  # Cursor adapter (Layer)
│   │
│   ├── github/                  # GitHub domain
│   │   ├── http-service.ts
│   │   ├── auth-service.ts
│   │   └── api-service.ts
│   │
│   └── ipc/                     # IPC handler registration
│       ├── ipc-handler-setup.ts
│       ├── error-mapper.ts
│       ├── account-handlers.ts
│       ├── github-handlers.ts
│       └── ai-provider-handlers.ts
│
├── renderer/                    # Renderer process (React + atoms)
│   ├── atoms/
│   │   ├── account-atoms.ts
│   │   ├── github-atoms.ts
│   │   └── ai-atoms.ts          # AI provider state atoms
│   ├── hooks/
│   │   ├── useGitHubAtoms.ts
│   │   └── useAiProviders.ts    # AI provider hooks
│   └── components/
│
└── preload/
    └── index.ts                 # IPC bridge (contextBridge)
```

## Architecture Documentation

**See comprehensive docs** for detailed patterns and rationale:

### Core Architecture
- `docs/EFFECT_ATOM_IPC_GUIDE.md`: Complete guide to Effect Atom + IPC integration, data flow, and patterns
- `docs/RESULT_ERROR_HANDLING_PATTERNS.md`: Type-safe error handling with Result.matchWithError and Result.builder
- `docs/RESULT_API_AND_ERROR_HANDLING.md`: Result.builder API reference and advanced error handling

### Hexagonal Architecture & Multi-Provider Patterns
- `docs/AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md`: Hexagonal architecture deep dive
- `docs/AI_PROVIDER_LIFECYCLE.md`: Provider lifecycle and memoization
- `docs/AI_LAYERS_HEXAGONAL_AGENTS_BENEFIT.md`: Multi-provider patterns for AI agents
