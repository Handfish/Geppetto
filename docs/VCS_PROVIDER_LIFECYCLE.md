# VCS Provider Lifecycle & Memoization Tracing

**Date:** 2025-10-26
**Purpose:** Trace how a VCS provider is created, memoized, and used throughout the application

---

## Overview

This document traces the complete lifecycle of a VCS provider (GitHub, GitLab, Bitbucket, Gitea) from initial definition through memoization to actual usage in the application.

---

## Step-by-Step Provider Lifecycle

### Step 1: Port Definition - The Contract

**File:** `src/main/providers/provider-port.ts`

```typescript
// Define the contract that ALL VCS providers must implement
export interface VcsProviderPort {
  readonly provider: ProviderType
  readonly supportsRepositories: boolean
  readonly supportsIssues: boolean
  readonly supportsPullRequests: boolean

  signIn(): Effect.Effect<ProviderSignInResult, ...>
  signOut(accountId: AccountId): Effect.Effect<void, ...>
  checkAuth(accountId: AccountId): Effect.Effect<ProviderAuthStatus, ...>
  getRepositories(accountId: AccountId): Effect.Effect<ReadonlyArray<ProviderRepository>, ...>
}

// Create a unique Context.Tag for each provider
export const makeVcsProviderService = (provider: ProviderType) => {
  return Context.GenericTag<VcsProviderPort>(`VcsProvider:${provider}`)
}

// Registry to track all provider tags
export class VcsProviderTags {
  private static tags = new Map<ProviderType, Context.Tag<VcsProviderPort, VcsProviderPort>>()

  static register(provider: ProviderType): Context.Tag<...> {
    const tag = makeVcsProviderService(provider)
    this.tags.set(provider, tag)
    return tag
  }
  // ... more methods
}
```

**What happens:**
1. Define `VcsProviderPort` interface - the contract
2. Create factory to make unique tags per provider
3. Registry to track all registered provider tags

---

### Step 2: Adapter Implementation - The Concrete Provider

**File:** `src/main/github/browser-provider-adapter.ts`

```typescript
const PROVIDER: 'github' = 'github'

// Step 2a: Register this provider and get its unique tag
const GitHubProviderTag = VcsProviderTags.register(PROVIDER)
//    ↑
//    This tag is: Context.GenericTag<VcsProviderPort>(`VcsProvider:github`)

// Step 2b: Create the adapter Layer
export const GitHubBrowserProviderAdapter = Layer.effect(
  GitHubProviderTag,  // ← This is what Effect uses to store/retrieve the service
  Effect.gen(function* () {
    // Access infrastructure services (available because we'll provide them)
    const authService = yield* GitHubAuthService
    const apiService = yield* GitHubApiService

    // Return the adapter implementation
    const adapter: VcsProviderPort = {
      provider: PROVIDER,
      supportsRepositories: true,
      supportsIssues: true,
      supportsPullRequests: true,
      signIn: () => { /* implementation */ },
      signOut: (accountId) => Effect.void,
      checkAuth: (accountId) => { /* implementation */ },
      getRepositories: (accountId) => { /* implementation */ },
    }

    return adapter
  })
).pipe(
  // Step 2c: Provide the infrastructure dependencies
  Layer.provide(
    Layer.mergeAll(
      GitHubAuthService.Default,
      GitHubApiService.Default
    )
  )
)
```

**What happens:**
1. Register provider → get unique tag (`GitHubProviderTag`)
2. Create Layer with `Layer.effect(tag, effect)`
3. Effect accesses infrastructure services via `yield*`
4. Returns adapter object implementing `VcsProviderPort`
5. Pipe to `Layer.provide` to make dependencies available

**Stub Adapters (GitLab, Bitbucket, Gitea):**
```typescript
// For providers not yet implemented, use Layer.succeed with stubs
const GitLabProviderTag = VcsProviderTags.register('gitlab')

export const GitLabBrowserProviderAdapter = Layer.succeed(
  GitLabProviderTag,
  {
    provider: 'gitlab',
    supportsRepositories: false,
    supportsIssues: false,
    supportsPullRequests: false,
    signIn: () => unsupported('authentication'),
    signOut: () => unsupported('authentication'),
    checkAuth: () => unsupported('authentication'),
    getRepositories: () => unsupported('repositories'),
  } satisfies VcsProviderPort
)
```

---

### Step 3: Adapters Layer - Composition

**File:** `src/main/providers/adapters-layer.ts`

```typescript
export const VcsAdaptersLayer = Layer.mergeAll(
  GitHubBrowserProviderAdapter,   // ← References the constant
  GitLabBrowserProviderAdapter,   // ← References the constant
  BitbucketBrowserProviderAdapter, // ← References the constant
  GiteaBrowserProviderAdapter      // ← References the constant
)
```

**What happens:**
1. Merges all provider adapters into one layer
2. Each adapter is a module-level constant (exported from its file)
3. Effect will construct all adapters when this layer is built
4. All adapters share their infrastructure via Layer.provide

---

### Step 4: Registry Service - Dynamic Lookup

**File:** `src/main/providers/provider-registry.ts`

```typescript
export class ProviderRegistryService extends Effect.Service<...>()(..., {
  effect: Effect.gen(function* () {
    // Step 4a: CAPTURE adapters at construction time
    const tags = VcsProviderTags.all()  // Get all registered provider tags
    const adaptersMap = new Map<ProviderType, VcsProviderPort>()

    for (const tag of tags) {
      // Retrieve adapter from context via its tag
      const adapter = yield* Effect.orElse(tag, () => Effect.succeed(null))
      if (adapter) {
        adaptersMap.set(adapter.provider, adapter)
      }
    }

    // Step 4b: Return methods that use the captured adapters
    return {
      getAdapter: (provider: ProviderType) =>
        Effect.gen(function* () {
          const adapter = adaptersMap.get(provider)  // ← No context needed!
          if (!adapter) {
            return yield* Effect.fail(new ProviderNotRegisteredError({ provider }))
          }
          return adapter
        }),

      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values())),
    }
  })
})
```

**What happens:**
1. When service is constructed, adapters are in context (provided by VcsAdaptersLayer)
2. Loop through all provider tags and capture adapters in a Map
3. Methods return Effects that access the Map (no context needed at call time)

**Why this matters:**
- Adapters captured ONCE during service construction
- Methods don't require `VcsProviderPort` in context at call time
- IPC handlers can use the service without context propagation

---

### Step 5: MainLayer Composition - Wiring It All Together

**File:** `src/main/index.ts`

```typescript
const MainLayer = Layer.mergeAll(
  // Core Adapters
  NodeGitCommandRunner.Default,
  NodeFileSystemAdapter.Default,

  // Core Infrastructure (constructed ONCE)
  CoreInfrastructureLayer,  // ← Module-level reference

  // VCS Domain with proper dependency injection
  Layer.provide(
    Layer.mergeAll(
      ProviderRegistryService.Default,  // ← Will capture adapters
      VcsProviderService.Default,
      ProviderFactoryService.Default,
    ),
    VcsAdaptersLayer  // ← Provides all provider adapters to services above
  ),

  // VCS domain services (needed by adapters)
  GitHubHttpService.Default,
  GitHubAuthService.Default,
  GitHubApiService.Default,
  AccountContextService.Default,

  // Other services...
)
```

**What happens:**
1. `CoreInfrastructureLayer` added to MainLayer (constructed once)
2. `VcsAdaptersLayer` provided to VCS domain services
3. When `ProviderRegistryService` is constructed:
   - Adapters are in context (from `VcsAdaptersLayer`)
   - Registry captures them in its Map
   - Registry service is memoized (constructed once)

---

## Complete Memoization Flow

### Initial Application Startup

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Module Loading Phase                                      │
├─────────────────────────────────────────────────────────────┤
│ • github/browser-provider-adapter.ts loads                   │
│   → GitHubProviderTag = VcsProviderTags.register('github')  │
│   → GitHubBrowserProviderAdapter = Layer.effect(...)        │
│   → Stored as module-level constant                          │
│                                                              │
│ • gitlab/browser-provider-adapter.ts loads (same pattern)    │
│ • bitbucket/browser-provider-adapter.ts loads (same pattern) │
│ • gitea/browser-provider-adapter.ts loads (same pattern)     │
│                                                              │
│ • adapters-layer.ts loads                                    │
│   → VcsAdaptersLayer = Layer.mergeAll(                      │
│       GitHubBrowserProviderAdapter,  // References constant  │
│       GitLabBrowserProviderAdapter,  // References constant  │
│       BitbucketBrowserProviderAdapter, // References constant│
│       GiteaBrowserProviderAdapter    // References constant  │
│     )                                                        │
│   → Stored as module-level constant                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. MainLayer Construction (when app.whenReady() fires)      │
├─────────────────────────────────────────────────────────────┤
│ MainLayer = Layer.mergeAll(                                  │
│   CoreInfrastructureLayer,     // ← SAME reference           │
│   Layer.provide(                                             │
│     Layer.mergeAll(                                          │
│       ProviderRegistryService.Default,                       │
│       VcsProviderService.Default,                            │
│       ...                                                    │
│     ),                                                       │
│     VcsAdaptersLayer            // ← SAME reference          │
│   ),                                                         │
│   ...                                                        │
│ )                                                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Layer Building (Effect.runPromise with MainLayer)        │
├─────────────────────────────────────────────────────────────┤
│ Effect creates MemoMap:                                      │
│   Map<LayerReference, ConstructedService>                    │
│                                                              │
│ Build VcsAdaptersLayer:                                      │
│   • Construct GitHubBrowserProviderAdapter:                  │
│     - Provides GitHubAuthService, GitHubApiService           │
│     - Constructs adapter implementing VcsProviderPort        │
│   • Construct GitLabBrowserProviderAdapter (stub)            │
│   • Construct BitbucketBrowserProviderAdapter (stub)         │
│   • Construct GiteaBrowserProviderAdapter (stub)             │
│                                                              │
│ Build ProviderRegistryService:                               │
│   • Adapters are in context (from VcsAdaptersLayer)          │
│   • Capture adapters in Map during construction              │
│   • Service is memoized (constructed once)                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Runtime Usage                                             │
├─────────────────────────────────────────────────────────────┤
│ IPC Call: provider:signIn('github')                         │
│   ↓                                                          │
│ VcsProviderService.signIn('github')                         │
│   ↓                                                          │
│ registry.getAdapter('github')                                │
│   ↓                                                          │
│ Returns GitHub adapter from Map (no context needed)          │
│   ↓                                                          │
│ adapter.signIn()                                             │
│   ↓                                                          │
│ Uses GitHubAuthService, GitHubApiService, etc.               │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Memoization Points

### ✅ Point 1: Module-Level Constants

```typescript
// ❌ WRONG - Creates new layer each time function is called
export function getGitHubAdapter() {
  return Layer.effect(GitHubProviderTag, ...)  // New Layer each time
}

// ✅ CORRECT - Created once when module loads
export const GitHubBrowserProviderAdapter = Layer.effect(
  GitHubProviderTag,
  // ...
)
```

**Why:** Effect memoizes by reference. Module-level constants ensure same reference everywhere.

---

### ✅ Point 2: Layer.provide vs Layer.mergeAll

```typescript
// ❌ WRONG - Adapters not available to services
Layer.mergeAll(
  VcsAdaptersLayer,
  ProviderRegistryService.Default,
)

// ✅ CORRECT - Provide adapters to services
Layer.provide(
  Layer.mergeAll(
    ProviderRegistryService.Default,
    VcsProviderService.Default,
  ),
  VcsAdaptersLayer  // Provides adapters to services above
)
```

**Why:** `Layer.provide` makes the adapters available in the context of the services, enabling them to capture the adapters during construction.

---

### ✅ Point 3: Capture Dependencies at Construction

```typescript
// ❌ WRONG - Requires context at call time
export class Registry extends Effect.Service<Registry>()(..., {
  effect: Effect.gen(function* () {
    return {
      getAdapter: (provider) => Effect.gen(function* () {
        const tag = Tags.get(provider)
        return yield* tag  // ← Requires context NOW
      })
    }
  })
})
// Result: Effect<Adapter, Error, VcsProviderPort> ← Context required

// ✅ CORRECT - Captures during construction
export class Registry extends Effect.Service<Registry>()(..., {
  effect: Effect.gen(function* () {
    const map = new Map()
    for (const tag of Tags.all()) {
      const adapter = yield* tag  // ← Context available NOW
      map.set(adapter.provider, adapter)
    }

    return {
      getAdapter: (provider) => Effect.gen(function* () {
        return map.get(provider)  // ← No context needed
      })
    }
  })
})
// Result: Effect<Adapter, Error, never> ← No context required
```

**Why:** Capturing at construction prevents context requirements from propagating to call sites.

---

## Visual Summary

```
Port Definition (provider-port.ts)
         ↓
Adapter Implementation (github/browser-provider-adapter.ts)
  [Layer with unique tag]
         ↓
Adapters Layer (adapters-layer.ts)
  [Merges all adapters]
         ↓
Registry Service (provider-registry.ts)
  [Captures adapters at construction]
         ↓
MainLayer (index.ts)
  [Provides VcsAdaptersLayer to registry]
         ↓
Effect Runtime
  [Memoizes by reference]
         ↓
IPC Handlers → Services → Registry → Adapters
  [All using SAME provider instances]
```

---

## Quick Reference: Finding Provider Usage

### Where to look for each step:

| Step | File | What to look for |
|------|------|------------------|
| **Port definition** | `src/main/providers/provider-port.ts` | `VcsProviderPort` interface, `VcsProviderTags` class |
| **Adapter implementation** | `src/main/github/browser-provider-adapter.ts` | `GitHubBrowserProviderAdapter` constant |
| **Adapters composition** | `src/main/providers/adapters-layer.ts` | `VcsAdaptersLayer` constant |
| **Registry** | `src/main/providers/provider-registry.ts` | `ProviderRegistryService` class |
| **Wiring** | `src/main/index.ts` | `MainLayer` with `Layer.provide` |
| **Usage** | `src/main/ipc/provider-handlers.ts` | IPC handlers calling service methods |

---

## Differences from AI Provider Architecture

Both VCS and AI domains follow the same hexagonal pattern, with minor differences:

| Aspect | AI Providers | VCS Providers |
|--------|--------------|---------------|
| **Port Name** | `AiProviderPort` | `VcsProviderPort` |
| **Tag Registry** | `AiProviderTags` | `VcsProviderTags` |
| **Adapters Layer** | `AiAdaptersLayer` | `VcsAdaptersLayer` |
| **Registry Service** | `AiProviderRegistryService` | `ProviderRegistryService` |
| **Infrastructure** | `AiInfrastructureLayer` | GitHub services directly |
| **Providers** | OpenAI, Claude, Cursor | GitHub, GitLab, Bitbucket, Gitea |
| **Stub Pattern** | Not used (all implemented) | Used for GitLab, Bitbucket, Gitea |

**Key similarity:** Both use **construction-time capture** in registry, ensuring no context propagation at call time.

---

**Author:** AI Assistant
**Date:** 2025-10-26
**Purpose:** Developer reference for understanding VCS provider lifecycle
