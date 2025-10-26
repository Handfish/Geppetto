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

**CRITICAL: This codebase uses the Effectful Ports pattern (Layer-based hexagonal architecture) for multi-provider orchestration, NOT the old Effect.Service registry pattern.**

The application implements hexagonal architecture (Ports & Adapters) using Effect's Layer system for AI providers and VCS providers. This enables:
- **Hot-swappable adapters**: Replace implementations at runtime for testing/mocking
- **Multi-provider orchestration**: Access multiple providers (OpenAI, Claude, Cursor) simultaneously
- **Clean dependency injection**: Adapters captured at construction time, no context propagation
- **Zero coupling**: Agent logic depends on abstract ports, not concrete implementations

#### AI Provider Architecture

**Port Definition** (`src/main/ai/provider-port.ts`):
```typescript
// The contract all AI providers must implement
export interface AiProviderPort {
  readonly provider: AiProviderType
  readonly supportsUsage: boolean

  signIn(): Effect.Effect<AiProviderSignInResult, ...>
  getUsage(accountId: AiAccountId): Effect.Effect<AiUsageSnapshot, ...>
  // ... other methods
}

// Tag-based registry for hot-swapping
export class AiProviderTags {
  static register(provider: AiProviderType): Context.Tag<AiProviderPort, AiProviderPort> {
    const tag = Context.GenericTag<AiProviderPort>(`AiProvider:${provider}`)
    this.tags.set(provider, tag)
    return tag
  }
  // ... registry methods
}
```

**Adapter Implementation** (`src/main/ai/openai/browser-provider-adapter.ts`):
```typescript
// Register provider and get unique tag
const OpenAiProviderTag = AiProviderTags.register('openai')

// Implement adapter as Layer
export const OpenAiBrowserProviderAdapter = Layer.effect(
  OpenAiProviderTag,
  Effect.gen(function* () {
    // Access infrastructure services
    const browserAuth = yield* BrowserAuthService
    const usagePage = yield* CookieUsagePageAdapter

    // Return adapter implementing AiProviderPort
    const adapter: AiProviderPort = {
      provider: 'openai',
      supportsUsage: true,
      signIn: () => { /* implementation */ },
      getUsage: (accountId) => { /* implementation */ },
    }
    return adapter
  })
).pipe(
  Layer.provide(AiInfrastructureLayer)  // Shared infrastructure
)
```

**Layer Composition** (`src/main/ai/adapters-layer.ts`):
```typescript
// Compose all AI provider adapters
export const AiAdaptersLayer = Layer.mergeAll(
  OpenAiBrowserProviderAdapter,
  ClaudeBrowserProviderAdapter,
  CursorBrowserProviderAdapter
)
```

**Registry Service** (`src/main/ai/registry.ts`):
```typescript
// Registry captures adapters at construction time
export class AiProviderRegistryService extends Effect.Service<...>()(...) {
  effect: Effect.gen(function* () {
    // Capture ALL adapters during construction
    const tags = AiProviderTags.all()
    const adaptersMap = new Map<AiProviderType, AiProviderPort>()

    for (const tag of tags) {
      const adapter = yield* tag  // Context available NOW
      adaptersMap.set(adapter.provider, adapter)
    }

    // Methods access Map (no context needed at call time)
    return {
      getAdapter: (provider) => Effect.gen(function* () {
        const adapter = adaptersMap.get(provider)  // No yield* needed!
        if (!adapter) {
          return yield* Effect.fail(new AiProviderNotRegisteredError({ provider }))
        }
        return adapter
      }),

      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values()))
    }
  })
}
```

**Dependency Injection** (`src/main/index.ts`):
```typescript
const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,  // Shared services (memoized by reference)

  // AI Domain with proper dependency injection
  Layer.provide(
    Layer.mergeAll(
      AiProviderRegistryService.Default,  // Captures adapters
      AiProviderService.Default,
      AiWatchersLayer
    ),
    AiAdaptersLayer  // Provides all adapters to services
  )
)
```

**Critical Memoization Pattern** (`src/main/core-infrastructure-layer.ts`):
```typescript
// ✅ CORRECT: Module-level constant ensures single construction
export const CoreInfrastructureLayer = Layer.mergeAll(
  ElectronSessionService.Default,
  BrowserAuthService.Default,
  CookieUsagePageAdapter.Default,
  SecureStoreService.Default,
  TierService.Default
)

// All adapters reference this same constant
export const AiInfrastructureLayer = CoreInfrastructureLayer
```

**Why Effect memoizes by reference:**
- Each call to `.Default` creates a new Layer instance
- Effect's MemoMap uses object reference as key
- Sharing a module-level constant ensures services are constructed once
- All adapters sharing `AiInfrastructureLayer` share the same service instances

#### Benefits for AI Agents

This architecture enables sophisticated AI agent patterns:

**Multi-Provider Query**:
```typescript
const agent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // Get all providers
  const adapters = yield* registry.listAdapters()

  // Query all in parallel
  const results = yield* Effect.forEach(
    adapters,
    adapter => adapter.getUsage(getAccountId(adapter.provider)),
    { concurrency: 'unbounded' }
  )

  // Agent can compare, merge, or choose best response
  return selectBestResponse(results)
})
```

**Intelligent Fallback Chain**:
```typescript
const agentWithFallback = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService
  const fallbackChain = ['cursor', 'openai', 'claude']

  for (const providerName of fallbackChain) {
    const adapter = yield* registry.getAdapter(providerName)
    const result = yield* adapter.getUsage(accountId).pipe(
      Effect.catchAll(() => Effect.succeed(null))
    )
    if (result !== null) return result
  }
})
```

**Hot-Swappable Testing**:
```typescript
// Mock any provider for testing
const MockOpenAiAdapter = Layer.succeed(
  AiProviderTags.getOrCreate('openai'),
  {
    provider: 'openai',
    supportsUsage: true,
    getUsage: () => Effect.succeed(mockUsage),
  } satisfies AiProviderPort
)

// Agent code is identical, just swap the layer
const testResult = await Effect.runPromise(
  agentLogic().pipe(
    Effect.provide(Layer.mergeAll(
      Layer.provide(
        AiProviderRegistryService.Default,
        MockOpenAiAdapter  // Hot-swap!
      )
    ))
  )
)
```

**See `docs/AI_LAYERS_HEXAGONAL_AGENTS_BENEFIT.md` for comprehensive agent patterns and use cases.**

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

### Effect-Based Service Architecture

The application uses Effect's dependency injection via services and layers following hexagonal architecture principles.

**Main Process Services** (`src/main/`):

**Core Infrastructure** (shared across domains):
- `CoreInfrastructureLayer`: Module-level constant for shared services
- `ElectronSessionService`: Cookie-isolated session management
- `BrowserAuthService`: Browser authentication orchestration
- `CookieUsagePageAdapter`: Usage data extraction from cookies
- `SecureStoreService`: Encrypted credential storage using `electron-store`
- `TierService`: Feature gating and tier limit enforcement

**VCS Domain** (`src/main/github/`):
- `GitHubHttpService`: HTTP client for GitHub API requests
- `GitHubAuthService`: OAuth flow with custom protocol (`geppetto://`)
- `GitHubApiService`: High-level GitHub operations (repos, issues, PRs)
- `GitHubProviderAdapter`: VCS provider adapter implementation

**AI Domain** (`src/main/ai/`):
- `AiProviderPort`: Abstract interface for all AI providers
- `OpenAiBrowserProviderAdapter`: OpenAI implementation (Layer)
- `ClaudeBrowserProviderAdapter`: Claude implementation (Layer)
- `CursorBrowserProviderAdapter`: Cursor implementation (Layer)
- `AiAdaptersLayer`: Composition of all AI adapters
- `AiProviderRegistryService`: Dynamic provider lookup and discovery
- `AiProviderService`: High-level AI operations with multi-account support
- `AiAccountContextService`: AI account management with tier validation

**Layer Composition** (`src/main/index.ts`):
```typescript
const MainLayer = Layer.mergeAll(
  // Core Adapters
  NodeGitCommandRunner.Default,
  NodeFileSystemAdapter.Default,

  // Core Infrastructure (memoized by reference)
  CoreInfrastructureLayer,

  // VCS Adapters
  GitHubProviderAdapter.Default,
  GitLabProviderAdapter.Default,
  // ...

  // VCS Domain Services
  GitHubHttpService.Default,
  GitHubAuthService.Default,
  AccountContextService.Default,
  // ...

  // AI Domain with dependency injection
  Layer.provide(
    Layer.mergeAll(
      AiProviderRegistryService.Default,  // Captures adapters
      AiProviderService.Default,
      AiWatchersLayer
    ),
    AiAdaptersLayer  // Provides adapters to services
  )
)
```

**Renderer Services** (`src/renderer/lib/`):
- `ElectronIpcClient`: Type-safe IPC communication
- `GitHubClient`: Renderer-side API wrapper
- `AiProviderClient`: Renderer-side AI provider wrapper

### Type-Safe IPC with Effect Schema

All IPC communication is contract-based via domain-specific contract files in `src/shared/`:
- `ipc-contracts.ts` exports all contracts: `AccountIpcContracts`, `GitHubIpcContracts`, `AiProviderIpcContracts`
- Each contract defines: `channel`, `input` schema, `output` schema, and `errors` schema
- Uses Effect Schema for runtime validation at process boundaries
- Handlers in `src/main/ipc/{domain}-handlers.ts` auto-decode/encode messages
- Error mapping in `src/main/ipc/error-mapper.ts` transforms domain errors (including tier errors) to IPC errors
- Ensures end-to-end type safety across process boundary

**IPC Contract Structure:**
```typescript
export const AiProviderIpcContracts = {
  signIn: {
    channel: 'aiProvider:signIn' as const,
    input: S.Struct({ provider: AiProviderType }),
    output: AiProviderSignInResult,
    errors: S.Union(AuthenticationError, FeatureNotAvailableError),
  },
  getProviderUsage: {
    channel: 'aiProvider:getProviderUsage' as const,
    input: S.Struct({ provider: AiProviderType }),
    output: S.Array(AiUsageSnapshot),
    errors: S.Union(AuthenticationError, NetworkError, NotFoundError),
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
import { AiProviderIpcContracts } from '../../shared/ipc-contracts'

export const setupAiProviderIpcHandlers = Effect.gen(function* () {
  const aiProviderService = yield* AiProviderService

  // Register handlers with automatic type safety
  registerIpcHandler(
    AiProviderIpcContracts.signIn,
    (input) => aiProviderService.signIn(input.provider)
  )

  registerIpcHandler(
    AiProviderIpcContracts.getProviderUsage,
    (input) => aiProviderService.getUsageByProvider(input.provider)
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

**This pattern applies to ALL IPC handler files:** `github-handlers.ts`, `account-handlers.ts`, `ai-provider-handlers.ts`, and any future domain handlers.

### Reactive State Management with Effect Atoms

Uses `@effect-atom/atom-react` to replace React Query/Zustand patterns:
- **Atoms** defined in `src/renderer/atoms/` integrate Effect runtime with React
  - `account-atoms.ts`: Account management (`accountContextAtom`, `activeAccountAtom`, `tierLimitsAtom`)
  - `github-atoms.ts`: GitHub data (`reposAtom`, `issuesAtom`, etc.)
  - `ai-atoms.ts`: AI provider data (`aiProvidersAtom`, `aiUsageAtom`, etc.)
- **Atom families** for parameterized queries (similar to React Query keys): `reposAtom(username)`, `aiUsageAtom(provider)`
- **Reactivity keys** for cache invalidation: `['account:context']`, `['github:auth']`, `['ai:provider:auth']`
- **TTL caching**: `Atom.setIdleTTL(Duration.minutes(5))` for automatic cache expiration
- **Result<T, E>** types for typed error handling in components
- **Result.builder** pattern for rendering UI based on Result state
- **Custom hooks** (`src/renderer/hooks/`) wrap atoms for clean React integration

Example: `aiUsageAtom` family caches usage per provider for 5 minutes and invalidates on auth changes.

**Result.builder Pattern for Components:**

All atoms return `Result<T, E>` types which represent async operations with three possible states:
- `Initial`: Operation hasn't started or is loading
- `Success<T>`: Operation completed successfully with data of type T
- `Failure<E>`: Operation failed with typed error E

Use the **Result.builder** pattern in React components to handle all states declaratively:

```typescript
export function AiProviderUsage({ provider }: { provider: AiProviderType }) {
  const { usageResult } = useAiProviderUsage(provider)

  return (
    <div>
      {Result.builder(usageResult)
        .onInitial(() => (
          <div>Loading usage data...</div>
        ))
        .onErrorTag('AuthenticationError', (error) => (
          <div>Please authenticate with {provider}: {error.message}</div>
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
        .onSuccess((usageSnapshots) => (
          <div>
            {usageSnapshots.map(snapshot => (
              <UsageBar key={snapshot.accountId} snapshot={snapshot} />
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

**For comprehensive details, see `docs/RESULT_API_AND_ERROR_HANDLING.md`**

### Shared Schemas (`src/shared/schemas/`)

All data models use Effect Schema:
- **Account schemas**: `AccountContext`, `Account`, `AccountId`, `ProviderType` (`schemas/account-context.ts`)
- **GitHub schemas**: `GitHubUser`, `GitHubRepository`, `GitHubIssue`, `GitHubPullRequest`
- **AI schemas**: `AiProviderType`, `AiProviderSignInResult`, `AiUsageSnapshot`, `AiUsageMetric`
- **Error types**: `AuthenticationError`, `NetworkError`, `NotFoundError`
- **Tier errors**: `AccountLimitExceededError`, `FeatureNotAvailableError`
- Ensures runtime type safety and validation across all layers

## Key Patterns & Conventions

### 1. Layer-Based Hexagonal Architecture (Ports & Adapters)

**CRITICAL: Use this pattern for all multi-provider domains (AI, VCS, etc.)**

**Step 1: Define the Port (Interface)**
```typescript
// src/main/{domain}/port.ts
export interface ProviderPort {
  readonly provider: ProviderType

  method1(): Effect.Effect<Result1, Error1>
  method2(input: Input2): Effect.Effect<Result2, Error2>
}
```

**Step 2: Create Tag Registry**
```typescript
export class ProviderTags {
  private static tags = new Map<ProviderType, Context.Tag<ProviderPort, ProviderPort>>()

  static register(provider: ProviderType): Context.Tag<ProviderPort, ProviderPort> {
    const tag = Context.GenericTag<ProviderPort>(`Provider:${provider}`)
    this.tags.set(provider, tag)
    return tag
  }

  static all(): ReadonlyArray<Context.Tag<ProviderPort, ProviderPort>> {
    return Array.from(this.tags.values())
  }
}
```

**Step 3: Implement Adapters as Layers**
```typescript
// src/main/{domain}/provider-a/adapter.ts
const ProviderATag = ProviderTags.register('provider-a')

export const ProviderAAdapter = Layer.effect(
  ProviderATag,
  Effect.gen(function* () {
    // Access infrastructure services
    const infraService = yield* InfrastructureService

    // Return adapter implementing port
    const adapter: ProviderPort = {
      provider: 'provider-a',
      method1: () => { /* implementation */ },
      method2: (input) => { /* implementation */ },
    }
    return adapter
  })
).pipe(
  Layer.provide(SharedInfrastructureLayer)  // Use shared reference!
)
```

**Step 4: Compose Adapters Layer**
```typescript
// src/main/{domain}/adapters-layer.ts
export const AdaptersLayer = Layer.mergeAll(
  ProviderAAdapter,
  ProviderBAdapter,
  ProviderCAdapter
)
```

**Step 5: Registry Service Captures Adapters**
```typescript
// src/main/{domain}/registry.ts
export class ProviderRegistryService extends Effect.Service<...>()(...) {
  effect: Effect.gen(function* () {
    // Capture adapters at construction time
    const tags = ProviderTags.all()
    const adaptersMap = new Map<ProviderType, ProviderPort>()

    for (const tag of tags) {
      const adapter = yield* tag
      adaptersMap.set(adapter.provider, adapter)
    }

    // Methods access Map (no context needed at call time)
    return {
      getAdapter: (provider) => Effect.gen(function* () {
        const adapter = adaptersMap.get(provider)
        if (!adapter) {
          return yield* Effect.fail(new ProviderNotFoundError({ provider }))
        }
        return adapter
      }),

      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values()))
    }
  })
}
```

**Step 6: Dependency Injection in MainLayer**
```typescript
// src/main/index.ts
const MainLayer = Layer.mergeAll(
  SharedInfrastructureLayer,  // Memoized by reference

  Layer.provide(
    Layer.mergeAll(
      ProviderRegistryService.Default,  // Captures adapters
      ProviderService.Default,
    ),
    AdaptersLayer  // Provides adapters to services
  )
)
```

**Benefits:**
- ✅ **Hot-swappable**: Replace adapters via `Layer.provide` for testing
- ✅ **Multi-provider**: Access all providers via `registry.listAdapters()`
- ✅ **No context propagation**: Adapters captured at construction time
- ✅ **Type-safe**: All adapters implement the same port interface
- ✅ **Testable**: Easily mock adapters with `Layer.succeed(tag, mockImpl)`

### 2. Effect Generators for Async Flows
All async operations use Effect generators (`Effect.gen`) for composable, type-safe flows:
```typescript
Effect.gen(function* () {
  const token = yield* getToken
  return yield* httpService.makeAuthenticatedRequest(endpoint, token, schema)
})
```

### 3. Effect.Service for Domain Services

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

### 4. Layer Memoization by Reference

**CRITICAL: Effect memoizes layers by object reference, not by service tag.**

```typescript
// ❌ WRONG - Each call creates new instance
const MainLayer = Layer.mergeAll(
  BrowserAuthService.Default,  // Instance 1
  // ...
)
const AiLayer = Layer.mergeAll(
  BrowserAuthService.Default,  // Instance 2 - DUPLICATE!
)

// ✅ CORRECT - Store in module-level constant
export const CoreInfrastructureLayer = Layer.mergeAll(
  BrowserAuthService.Default,  // Instance 1 - the ONLY instance
)

const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,  // References same instance
  // ...
)
const AiLayer = Layer.provide(
  someDomainServices,
  CoreInfrastructureLayer  // References same instance
)
```

**Why this matters:**
- Effect's MemoMap uses layer reference as key
- Same reference → constructed once → shared across all dependents
- Different references → constructed multiple times → wasted resources

### 5. Typed Error Handling

All errors are typed and tracked through Effect's error channel using a three-layer approach:

**Layer 1: Domain Errors** (`src/main/{domain}/errors.ts`)
- Domain-specific error classes using `Data.TaggedError`
- Examples: `AiProviderAuthenticationError`, `AiProviderUsageError`, `GitHubAuthError`
- Contain domain-specific context (provider, accountId, etc.)
- Used within services for precise error handling

**Layer 2: IPC Error Mapping** (`src/main/ipc/error-mapper.ts`)
- Maps domain errors to shared error types that cross process boundaries
- Handles tier errors: `AccountLimitExceededError`, `FeatureNotAvailableError`
- Uses `instanceof` checks with actual error classes (not string tags)
- Type-safe error transformation with `mapDomainErrorToIpcError`

**Layer 3: Shared Error Types** (`src/shared/schemas/errors.ts`)
- Process-boundary-safe error schemas: `AuthenticationError`, `NetworkError`, `NotFoundError`
- Serializable with Effect Schema
- Renderer receives `Result<T, E>` types for typed error handling in UI

**Error Flow:**
```
Service Error (AiProviderAuthenticationError)
  → mapDomainErrorToIpcError
  → IPC Error (AuthenticationError)
  → Renderer (typed Result<T, E>)
```

### 6. Redacted<T> for Sensitive Data
Sensitive data uses `Redacted` type to prevent accidental logging:
```typescript
const token = Redacted.make(tokenString)
const value = Redacted.value(token)  // explicit unwrap required
```
Used throughout for tokens in storage, IPC contracts, and API calls.

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

When adding a new provider to an existing domain (e.g., adding Gemini to AI providers):

**1. Implement Adapter** (`src/main/ai/gemini/browser-provider-adapter.ts`)
```typescript
const GeminiProviderTag = AiProviderTags.register('gemini')

export const GeminiBrowserProviderAdapter = Layer.effect(
  GeminiProviderTag,
  Effect.gen(function* () {
    const browserAuth = yield* BrowserAuthService
    const usagePage = yield* CookieUsagePageAdapter

    const adapter: AiProviderPort = {
      provider: 'gemini',
      supportsUsage: true,
      signIn: () => { /* Gemini-specific implementation */ },
      getUsage: (accountId) => { /* Gemini-specific implementation */ },
      // ... other methods
    }
    return adapter
  })
).pipe(Layer.provide(AiInfrastructureLayer))
```

**2. Add to Adapters Layer** (`src/main/ai/adapters-layer.ts`)
```typescript
export const AiAdaptersLayer = Layer.mergeAll(
  OpenAiBrowserProviderAdapter,
  ClaudeBrowserProviderAdapter,
  CursorBrowserProviderAdapter,
  GeminiBrowserProviderAdapter  // Add new adapter
)
```

**3. Update Domain Errors** (`src/main/ai/errors.ts`)
```typescript
// If Gemini needs specific error types, add them here
export class GeminiSpecificError extends Data.TaggedError('GeminiSpecificError')<{
  readonly provider: 'gemini'
  readonly message: string
}> {}
```

**4. Update Error Mapper** (if needed, `src/main/ipc/error-mapper.ts`)
```typescript
// Add Gemini error handling if it has unique error types
```

**That's it!** The rest of the system automatically discovers and uses the new provider:
- Registry finds it via `AiProviderTags.all()`
- IPC handlers work via existing `AiProviderService`
- Renderer can query it via `aiUsageAtom('gemini')`
- Agents can access it via `registry.getAdapter('gemini')`

**Benefits of this pattern:**
- ✅ Zero changes to existing code
- ✅ Zero changes to registry or service logic
- ✅ Zero changes to IPC handlers
- ✅ Zero changes to renderer atoms
- ✅ New provider automatically available everywhere

### Adding a New Domain with Multi-Provider Support

To add a completely new domain (e.g., Email Providers):

**1. Define Port** (`src/main/email/provider-port.ts`)
```typescript
export interface EmailProviderPort {
  readonly provider: EmailProviderType

  connect(): Effect.Effect<EmailConnection, EmailConnectionError>
  sendEmail(params: EmailParams): Effect.Effect<EmailSent, EmailSendError>
}

export class EmailProviderTags {
  private static tags = new Map<EmailProviderType, Context.Tag<EmailProviderPort, EmailProviderPort>>()

  static register(provider: EmailProviderType): Context.Tag<EmailProviderPort, EmailProviderPort> {
    const tag = Context.GenericTag<EmailProviderPort>(`EmailProvider:${provider}`)
    this.tags.set(provider, tag)
    return tag
  }

  static all(): ReadonlyArray<Context.Tag<EmailProviderPort, EmailProviderPort>> {
    return Array.from(this.tags.values())
  }
}
```

**2. Implement Adapters**
```typescript
// src/main/email/gmail/adapter.ts
const GmailProviderTag = EmailProviderTags.register('gmail')

export const GmailProviderAdapter = Layer.effect(
  GmailProviderTag,
  Effect.gen(function* () {
    // Implementation
    const adapter: EmailProviderPort = { /* ... */ }
    return adapter
  })
).pipe(Layer.provide(EmailInfrastructureLayer))

// src/main/email/outlook/adapter.ts
const OutlookProviderTag = EmailProviderTags.register('outlook')

export const OutlookProviderAdapter = Layer.effect(
  OutlookProviderTag,
  Effect.gen(function* () {
    // Implementation
    const adapter: EmailProviderPort = { /* ... */ }
    return adapter
  })
).pipe(Layer.provide(EmailInfrastructureLayer))
```

**3. Compose Adapters Layer**
```typescript
// src/main/email/adapters-layer.ts
export const EmailAdaptersLayer = Layer.mergeAll(
  GmailProviderAdapter,
  OutlookProviderAdapter
)
```

**4. Registry Service**
```typescript
// src/main/email/registry.ts
export class EmailProviderRegistryService extends Effect.Service<...>()(...) {
  effect: Effect.gen(function* () {
    const tags = EmailProviderTags.all()
    const adaptersMap = new Map<EmailProviderType, EmailProviderPort>()

    for (const tag of tags) {
      const adapter = yield* tag
      adaptersMap.set(adapter.provider, adapter)
    }

    return {
      getAdapter: (provider) => Effect.gen(function* () {
        const adapter = adaptersMap.get(provider)
        if (!adapter) {
          return yield* Effect.fail(new EmailProviderNotFoundError({ provider }))
        }
        return adapter
      }),
      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values()))
    }
  })
}
```

**5. Domain Service**
```typescript
// src/main/email/email-service.ts
export class EmailService extends Effect.Service<EmailService>()('EmailService', {
  dependencies: [EmailProviderRegistryService.Default],
  effect: Effect.gen(function* () {
    const registry = yield* EmailProviderRegistryService

    return {
      sendEmail: (provider: EmailProviderType, params: EmailParams) =>
        Effect.gen(function* () {
          const adapter = yield* registry.getAdapter(provider)
          return yield* adapter.sendEmail(params)
        })
    }
  })
}) {}
```

**6. Add to MainLayer**
```typescript
const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,

  // ... other domains

  // Email Domain
  Layer.provide(
    Layer.mergeAll(
      EmailProviderRegistryService.Default,
      EmailService.Default
    ),
    EmailAdaptersLayer
  )
)
```

**7. Create IPC Contracts, Handlers, Atoms** (follow existing patterns)

### Key Principles

1. **Hexagonal Architecture First**: Always use Ports & Adapters for multi-provider domains
2. **Layer Memoization**: Share infrastructure via module-level constants
3. **Construction-Time Capture**: Registry captures adapters during construction
4. **Type Safety First**: Use `S.Schema.Type<>` and `S.Schema.Encoded<>` to extract types from schemas
5. **No `any` Types**: Use `unknown` with runtime validation where TypeScript can't infer
6. **Domain Isolation**: Each provider is independent with its own errors, services, and schemas
7. **Centralized Error Mapping**: All domain errors funnel through `error-mapper.ts`
8. **Contract-Based IPC**: All cross-process communication validated by schemas
9. **Effect Generators**: Use `Effect.gen` for all async operations

### Testing Approach

- **Adapter Testing**: Hot-swap adapters with `Layer.succeed(tag, mockImpl)`
- **Service Testing**: Use Effect's testing utilities with mock layers
- **IPC Testing**: Contract testing between processes using Effect Schema
- **Atom Testing**: Test atoms independently from React components
- **Agent Testing**: Test multi-provider orchestration with various adapter configurations

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

### Architecture Decisions & Rationale

**Why Layer-Based Hexagonal Architecture?**
- **AI Agent Enablement**: Agents can orchestrate multiple providers (OpenAI, Claude, Cursor) dynamically
- **Hot-Swappable Testing**: Easy to mock providers for testing agent logic
- **Zero Coupling**: Agent code depends on abstract ports, not concrete implementations
- **Scalability**: Adding new providers requires zero changes to existing code
- **Multi-Provider Orchestration**: Access all providers via unified interface

**Why Construction-Time Capture in Registry?**
- **No Context Propagation**: IPC handlers work without complex context management
- **Cleaner Effect Signatures**: Methods return `Effect<T, E, never>` instead of `Effect<T, E, AiProviderPort>`
- **Better Type Inference**: TypeScript infers types correctly without context requirements
- **Simpler Testing**: Test code doesn't need to provide adapter context

**Why Layer Memoization by Reference?**
- **Resource Efficiency**: Services constructed once and shared across all adapters
- **Consistent State**: All adapters see the same service instances
- **Effect Best Practice**: Follows Effect's intended layer memoization design
- **Prevents Bugs**: Eliminates issues from duplicate service construction

**See comprehensive architecture documentation:**
- `docs/AI_PROVIDER_LIFECYCLE.md`: Step-by-step provider lifecycle and memoization
- `docs/AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md`: Hexagonal architecture deep dive
- `docs/AI_LAYERS_HEXAGONAL_AGENTS_BENEFIT.md`: Benefits for AI agents with concrete examples
