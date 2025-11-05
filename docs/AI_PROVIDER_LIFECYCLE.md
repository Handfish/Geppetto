# AI Provider Lifecycle & Memoization Tracing

**Date:** 2025-10-26
**Purpose:** Trace how an AI provider is created, memoized, and used throughout the application

---

## Overview

This document traces the complete lifecycle of an AI provider (OpenAI, Claude, Cursor) from initial definition through memoization to actual usage in the application.

---

## Step-by-Step Provider Lifecycle

### Step 1: Port Definition - The Contract

**File:** `src/main/ai-provider-usage-webscraper/provider-port.ts`

```typescript
// Define the contract that ALL providers must implement
export interface AiProviderPort {
  readonly provider: AiProviderType
  readonly supportsUsage: boolean

  signIn(): Effect.Effect<AiProviderSignInResult, ...>
  signOut(accountId: AiAccountId): Effect.Effect<void, ...>
  checkAuth(accountId: AiAccountId): Effect.Effect<AiProviderAuthStatus, ...>
  getUsage(accountId: AiAccountId): Effect.Effect<AiUsageSnapshot, ...>
}

// Create a unique Context.Tag for each provider
export const makeAiProviderService = (provider: AiProviderType) => {
  return Context.GenericTag<AiProviderPort>(`AiProvider:${provider}`)
}

// Registry to track all provider tags
export class AiProviderTags {
  private static tags = new Map<AiProviderType, Context.Tag<AiProviderPort, AiProviderPort>>()

  static register(provider: AiProviderType): Context.Tag<...> {
    const tag = makeAiProviderService(provider)
    this.tags.set(provider, tag)
    return tag
  }
  // ... more methods
}
```

**What happens:**
1. Define `AiProviderPort` interface - the contract
2. Create factory to make unique tags per provider
3. Registry to track all registered provider tags

---

### Step 2: Infrastructure Layer - Shared Dependencies

**File:** `src/main/core-infrastructure-layer.ts`

```typescript
// ✅ CRITICAL: Created ONCE as a module-level constant
export const CoreInfrastructureLayer = Layer.mergeAll(
  ElectronSessionService.Default,     // ← Called ONCE here
  BrowserAuthService.Default,          // ← Called ONCE here
  CookieUsagePageAdapter.Default,      // ← Called ONCE here
  SecureStoreService.Default,
  TierService.Default
)
```

**What happens:**
1. Module loads → `.Default` methods called → Layer instances created
2. Stored in `CoreInfrastructureLayer` constant
3. This constant is a **reference** that can be reused everywhere
4. Effect will memoize by this reference

**File:** `src/main/ai-provider-usage-webscraper/infrastructure-layer.ts`

```typescript
// Re-export to ensure same reference is used
export const AiInfrastructureLayer = CoreInfrastructureLayer
```

**What happens:**
- `AiInfrastructureLayer` is just an alias
- Points to the SAME reference as `CoreInfrastructureLayer`
- Ensures all adapters use the same infrastructure

---

### Step 3: Adapter Implementation - The Concrete Provider

**File:** `src/main/ai-provider-usage-webscraper/openai/browser-provider-adapter.ts`

```typescript
const PROVIDER: 'openai' = 'openai'

// Step 3a: Register this provider and get its unique tag
const OpenAiProviderTag = AiProviderTags.register(PROVIDER)
//    ↑
//    This tag is: Context.GenericTag<AiProviderPort>(`AiProvider:openai`)

// Step 3b: Create the adapter Layer
export const OpenAiBrowserProviderAdapter = Layer.effect(
  OpenAiProviderTag,  // ← This is what Effect uses to store/retrieve the service
  Effect.gen(function* () {
    // Access infrastructure services (available because we'll provide them below)
    const browserAuth = yield* BrowserAuthService
    const usagePage = yield* CookieUsagePageAdapter
    const sessionService = yield* ElectronSessionService

    // Return the adapter implementation
    const adapter: AiProviderPort = {
      provider: PROVIDER,
      supportsUsage: true,
      signIn: () => { /* implementation */ },
      signOut: () => Effect.void,
      checkAuth: (accountId) => { /* implementation */ },
      getUsage: (accountId) => { /* implementation */ },
    }

    return adapter
  })
).pipe(
  // Step 3c: Provide the infrastructure dependencies
  Layer.provide(AiInfrastructureLayer)  // ← Uses the shared reference!
)
```

**What happens:**
1. Register provider → get unique tag (`OpenAiProviderTag`)
2. Create Layer with `Layer.effect(tag, effect)`
3. Effect accesses infrastructure services via `yield*`
4. Returns adapter object implementing `AiProviderPort`
5. Pipe to `Layer.provide(AiInfrastructureLayer)` → provides infrastructure

**Memoization Key:**
- `AiInfrastructureLayer` is a shared reference
- All adapters use the SAME reference
- Effect sees the SAME layer object → constructs infrastructure ONCE

---

### Step 4: Adapters Layer - Composition

**File:** `src/main/ai-provider-usage-webscraper/adapters-layer.ts`

```typescript
export const AiAdaptersLayer = Layer.mergeAll(
  OpenAiBrowserProviderAdapter,   // ← References the constant
  ClaudeBrowserProviderAdapter,   // ← References the constant
  CursorBrowserProviderAdapter    // ← References the constant
)
```

**What happens:**
1. Merges all provider adapters into one layer
2. Each adapter is a module-level constant (exported from its file)
3. Effect will construct all adapters when this layer is built
4. All adapters share the same `AiInfrastructureLayer` reference

---

### Step 5: Registry Service - Dynamic Lookup

**File:** `src/main/ai-provider-usage-webscraper/registry.ts`

```typescript
export class AiProviderRegistryService extends Effect.Service<...>()(..., {
  effect: Effect.gen(function* () {
    // Step 5a: CAPTURE adapters at construction time
    const tags = AiProviderTags.all()  // Get all registered provider tags
    const adaptersMap = new Map<AiProviderType, AiProviderPort>()

    for (const tag of tags) {
      // Retrieve adapter from context via its tag
      const adapter = yield* Effect.orElse(tag, () => Effect.succeed(null))
      if (adapter) {
        adaptersMap.set(adapter.provider, adapter)
      }
    }

    // Step 5b: Return methods that use the captured adapters
    return {
      getAdapter: (provider: AiProviderType) =>
        Effect.gen(function* () {
          const adapter = adaptersMap.get(provider)  // ← No context needed!
          if (!adapter) {
            return yield* Effect.fail(new AiProviderNotRegisteredError({ provider }))
          }
          return adapter
        }),

      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values())),
    }
  })
})
```

**What happens:**
1. When service is constructed, adapters are in context (provided by AiAdaptersLayer)
2. Loop through all provider tags and capture adapters in a Map
3. Methods return Effects that access the Map (no context needed at call time)

**Why this matters:**
- Adapters captured ONCE during service construction
- Methods don't require `AiProviderPort` in context at call time
- IPC handlers can use the service without context propagation

---

### Step 6: MainLayer Composition - Wiring It All Together

**File:** `src/main/index.ts`

```typescript
const MainLayer = Layer.mergeAll(
  // Other adapters...
  NodeGitCommandRunner.Default,
  NodeFileSystemAdapter.Default,

  // Step 6a: Shared infrastructure (constructed ONCE)
  CoreInfrastructureLayer,  // ← Module-level reference

  // Other domain services...
  AccountContextService.Default,
  // ...

  // Step 6b: AI Domain with proper dependency injection
  Layer.provide(
    Layer.mergeAll(
      AiAccountContextService.Default,
      AiProviderRegistryService.Default,  // ← Will capture adapters
      AiProviderService.Default,
      AiRunnersLayer
    ),
    AiAdaptersLayer  // ← Provides all provider adapters to services above
  ),

  // Other services...
)
```

**What happens:**
1. `CoreInfrastructureLayer` added to MainLayer (constructed once)
2. `AiAdaptersLayer` provided to AI domain services
3. When `AiProviderRegistryService` is constructed:
   - Adapters are in context (from `AiAdaptersLayer`)
   - Registry captures them in its Map
   - Registry service is memoized (constructed once)

---

## Complete Memoization Flow

### Initial Application Startup

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Module Loading Phase                                      │
├─────────────────────────────────────────────────────────────┤
│ • core-infrastructure-layer.ts loads                         │
│   → CoreInfrastructureLayer = Layer.mergeAll(...)           │
│   → Stored as module-level constant                          │
│                                                              │
│ • openai/browser-provider-adapter.ts loads                   │
│   → OpenAiProviderTag = AiProviderTags.register('openai')   │
│   → OpenAiBrowserProviderAdapter = Layer.effect(...)        │
│   → Stored as module-level constant                          │
│                                                              │
│ • claude/browser-provider-adapter.ts loads (same pattern)    │
│ • cursor/browser-provider-adapter.ts loads (same pattern)    │
│                                                              │
│ • adapters-layer.ts loads                                    │
│   → AiAdaptersLayer = Layer.mergeAll(                       │
│       OpenAiBrowserProviderAdapter,  // References constant  │
│       ClaudeBrowserProviderAdapter,  // References constant  │
│       CursorBrowserProviderAdapter   // References constant  │
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
│       AiProviderRegistryService.Default,                     │
│       AiProviderService.Default,                             │
│       ...                                                    │
│     ),                                                       │
│     AiAdaptersLayer            // ← SAME reference           │
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
│ Build CoreInfrastructureLayer:                               │
│   • Check MemoMap[CoreInfrastructureLayer] → not found      │
│   • Construct:                                               │
│     - ElectronSessionService.Default → construct             │
│     - BrowserAuthService.Default → construct                 │
│     - CookieUsagePageAdapter.Default → construct             │
│     - SecureStoreService.Default → construct                 │
│     - TierService.Default → construct                        │
│   • Store in MemoMap[CoreInfrastructureLayer] = services    │
│                                                              │
│ Build AiAdaptersLayer:                                       │
│   • AiAdaptersLayer needs AiInfrastructureLayer              │
│   • AiInfrastructureLayer = CoreInfrastructureLayer          │
│   • Check MemoMap[CoreInfrastructureLayer] → FOUND! ✅       │
│   • Reuse services (no reconstruction)                       │
│   • Construct OpenAiBrowserProviderAdapter with services     │
│   • Construct ClaudeBrowserProviderAdapter with services     │
│   • Construct CursorBrowserProviderAdapter with services     │
│   • All adapters share SAME infrastructure services          │
│                                                              │
│ Build AiProviderRegistryService:                             │
│   • Adapters are in context (from AiAdaptersLayer)           │
│   • Capture adapters in Map during construction              │
│   • Service is memoized (constructed once)                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Runtime Usage                                             │
├─────────────────────────────────────────────────────────────┤
│ IPC Call: aiProvider:getProviderUsage('openai')             │
│   ↓                                                          │
│ AiProviderService.getUsageByProvider('openai')              │
│   ↓                                                          │
│ registry.getAdapter('openai')                                │
│   ↓                                                          │
│ Returns OpenAI adapter from Map (no context needed)          │
│   ↓                                                          │
│ adapter.getUsage(accountId)                                  │
│   ↓                                                          │
│ Uses BrowserAuthService (the SAME instance for all)          │
│ Uses CookieUsagePageAdapter (the SAME instance for all)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Memoization Points

### ✅ Point 1: Module-Level Constants

```typescript
// ❌ WRONG - Creates new layer each time function is called
export function getInfrastructureLayer() {
  return Layer.mergeAll(
    BrowserAuthService.Default,  // New call each time
    // ...
  )
}

// ✅ CORRECT - Created once when module loads
export const CoreInfrastructureLayer = Layer.mergeAll(
  BrowserAuthService.Default,  // Called once at module load
  // ...
)
```

**Why:** Effect memoizes by reference. Module-level constants ensure same reference everywhere.

---

### ✅ Point 2: Shared References Across Adapters

```typescript
// ❌ WRONG - Each adapter calls .Default independently
export const OpenAiAdapter = Layer.effect(...).pipe(
  Layer.provide(Layer.mergeAll(
    BrowserAuthService.Default,  // New reference
  ))
)
export const ClaudeAdapter = Layer.effect(...).pipe(
  Layer.provide(Layer.mergeAll(
    BrowserAuthService.Default,  // Another new reference
  ))
)

// ✅ CORRECT - All adapters use the same reference
const SharedInfra = Layer.mergeAll(
  BrowserAuthService.Default,  // Called once
)

export const OpenAiAdapter = Layer.effect(...).pipe(
  Layer.provide(SharedInfra)  // References same layer
)
export const ClaudeAdapter = Layer.effect(...).pipe(
  Layer.provide(SharedInfra)  // References same layer
)
```

**Why:** Same reference → Effect sees it's already constructed → reuses services.

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
// Result: Effect<Adapter, Error, AiProviderPort> ← Context required

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
Infrastructure Layer (core-infrastructure-layer.ts)
  [Created ONCE as module constant]
         ↓
         ├─→ AiInfrastructureLayer (re-export)
         │
Adapter Implementation (openai/browser-provider-adapter.ts)
  [Uses AiInfrastructureLayer reference]
         ↓
Adapters Layer (adapters-layer.ts)
  [Merges all adapters]
         ↓
Registry Service (registry.ts)
  [Captures adapters at construction]
         ↓
MainLayer (index.ts)
  [Provides AiAdaptersLayer to registry]
         ↓
Effect Runtime
  [Memoizes by reference]
         ↓
IPC Handlers → Services → Registry → Adapters
  [All using SAME infrastructure instances]
```

---

## Quick Reference: Finding Provider Usage

### Where to look for each step:

| Step | File | What to look for |
|------|------|------------------|
| **Port definition** | `src/main/ai-provider-usage-webscraper/provider-port.ts` | `AiProviderPort` interface, `AiProviderTags` class |
| **Infrastructure** | `src/main/core-infrastructure-layer.ts` | `CoreInfrastructureLayer` constant |
| **Adapter implementation** | `src/main/ai-provider-usage-webscraper/openai/browser-provider-adapter.ts` | `OpenAiBrowserProviderAdapter` constant |
| **Adapters composition** | `src/main/ai-provider-usage-webscraper/adapters-layer.ts` | `AiAdaptersLayer` constant |
| **Registry** | `src/main/ai-provider-usage-webscraper/registry.ts` | `AiProviderRegistryService` class |
| **Wiring** | `src/main/index.ts` | `MainLayer` with `Layer.provide` |
| **Usage** | `src/main/ipc/ai-provider-handlers.ts` | IPC handlers calling service methods |

---

**Author:** AI Assistant
**Date:** 2025-10-26
**Purpose:** Developer reference for understanding AI provider lifecycle
