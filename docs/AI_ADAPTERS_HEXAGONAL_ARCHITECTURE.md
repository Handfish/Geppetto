# AI Adapters Hexagonal Architecture

**Date:** 2025-10-26
**Status:** ✅ Implemented
**Reference:** `docs/effect_ports_migration_guide.md`

---

## Overview

The AI Adapters layer has been refactored to follow a proper **Hexagonal (Ports & Adapters) Architecture** using the **Effectful Ports pattern**. This enables:

✅ **Hot-swappable providers** - Swap implementations at runtime for testing/mocking
✅ **Multi-instance support** - Run multiple providers simultaneously (both Claude and OpenAI usage bars)
✅ **Type-safe contracts** - All adapters implement the same `AiProviderPort` interface
✅ **Isolated testing** - Each adapter can be tested independently
✅ **Clear boundaries** - Ports define contracts, adapters implement, services consume

---

## Architecture Components

### 1. Port Definition (`src/main/ai/provider-port.ts`)

The `AiProviderPort` interface defines the contract that all AI providers must implement:

```typescript
export interface AiProviderPort {
  readonly provider: AiProviderType
  readonly supportsUsage: boolean

  signIn(): Effect.Effect<AiProviderSignInResult, ...>
  signOut(accountId: AiAccountId): Effect.Effect<void, ...>
  checkAuth(accountId: AiAccountId): Effect.Effect<AiProviderAuthStatus, ...>
  getUsage(accountId: AiAccountId): Effect.Effect<AiUsageSnapshot, ...>
}
```

### 2. Provider Tags (`AiProviderTags`)

Each provider gets a unique Context.Tag for dependency injection:

```typescript
const OpenAiProviderTag = AiProviderTags.register('openai')
const ClaudeProviderTag = AiProviderTags.register('claude')
const CursorProviderTag = AiProviderTags.register('cursor')
```

### 3. Adapter Implementations

Each provider is now a **Layer** that implements the `AiProviderPort`:

- **OpenAI**: `OpenAiBrowserProviderAdapter` (`src/main/ai/openai/browser-provider-adapter.ts`)
- **Claude**: `ClaudeBrowserProviderAdapter` (`src/main/ai/claude/browser-provider-adapter.ts`)
- **Cursor**: `CursorBrowserProviderAdapter` (`src/main/ai/cursor/browser-provider-adapter.ts`)

**Example adapter structure:**

```typescript
export const OpenAiBrowserProviderAdapter = Layer.effect(
  OpenAiProviderTag,
  Effect.gen(function* () {
    const browserAuth = yield* BrowserAuthService
    const usagePage = yield* CookieUsagePageAdapter
    const sessionService = yield* ElectronSessionService

    const adapter: AiProviderPort = {
      provider: 'openai',
      supportsUsage: true,
      signIn: () => { /* implementation */ },
      // ... other methods
    }

    return adapter
  })
).pipe(Layer.provide(/* dependencies */))
```

### 4. AiAdaptersLayer Composition

All adapters are composed into a single layer:

```typescript
// src/main/ai/adapters-layer.ts
export const AiAdaptersLayer = Layer.mergeAll(
  OpenAiBrowserProviderAdapter,
  ClaudeBrowserProviderAdapter,
  CursorBrowserProviderAdapter
)
```

### 5. Layer Dependency Injection (CRITICAL)

The adapters must be **provided** to the services that need them, not just merged alongside them:

```typescript
// ❌ WRONG: Merging at same level doesn't provide adapters to services
const MainLayer = Layer.mergeAll(
  AiAdaptersLayer,
  AiProviderRegistryService.Default,  // Can't access adapters!
  AiProviderService.Default,
)

// ✅ CORRECT: Provide adapters to services that depend on them
const MainLayer = Layer.mergeAll(
  // ... other services
  Layer.provide(
    Layer.mergeAll(
      AiAccountContextService.Default,
      AiProviderRegistryService.Default,    // Can now access adapters!
      AiProviderService.Default,
      AiWatchersLayer
    ),
    AiAdaptersLayer  // Provides adapters to all services above
  ),
  // ... more services
)
```

**Why this matters:**
- `Layer.mergeAll(A, B, C)` - Layers constructed side-by-side, don't provide to each other
- `C.pipe(Layer.provide(A))` or `Layer.provide(C, A)` - Layer A's services available in C's context
- Without `Layer.provide`, the registry service can't access adapters via `yield* tag`

### 6. Registry Service (`src/main/ai/registry.ts`)

The registry **captures adapters at construction time** to avoid context requirements at call time:

```typescript
export class AiProviderRegistryService extends Effect.Service<AiProviderRegistryService>()('AiProviderRegistryService', {
  effect: Effect.gen(function* () {
    // Capture adapters from context at construction time
    const tags = AiProviderTags.all()
    const adaptersMap = new Map<AiProviderType, AiProviderPort>()

    for (const tag of tags) {
      const adapter = yield* Effect.orElse(tag, () => Effect.succeed(null))
      if (adapter) {
        adaptersMap.set(adapter.provider, adapter)
      }
    }

    return {
      getAdapter: (provider: AiProviderType) =>
        Effect.gen(function* () {
          const adapter = adaptersMap.get(provider)  // No context needed!
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

**Why capture at construction time?**
- ✅ Methods return `Effect<T, E, never>` - no context requirements
- ✅ IPC handlers work without propagating context
- ✅ Service remains hot-swappable (swap happens at construction, not call time)

---

## Usage Examples

### Example 1: Fetching Usage for Both OpenAI and Claude

```typescript
Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // Get adapters for both providers
  const openai = yield* registry.getAdapter('openai')
  const claude = yield* registry.getAdapter('claude')

  // Fetch usage concurrently
  const [openaiUsage, claudeUsage] = yield* Effect.all([
    openai.getUsage(openaiAccountId),
    claude.getUsage(claudeAccountId)
  ], { concurrency: 'unbounded' })

  // Now you have both usage bars!
  return { openaiUsage, claudeUsage }
}).pipe(Effect.provide(MainLayer))
```

### Example 2: Hot-Swapping for Tests

```typescript
// Create a mock adapter
const MockOpenAiAdapter = Layer.succeed(
  AiProviderTags.getOrCreate('openai'),
  {
    provider: 'openai',
    supportsUsage: true,
    signIn: () => Effect.succeed(mockSignInResult),
    signOut: () => Effect.void,
    checkAuth: () => Effect.succeed(mockAuthStatus),
    getUsage: () => Effect.succeed(mockUsage),
  }
)

// Override just the OpenAI adapter for testing
const TestLayer = MainLayer.pipe(
  Layer.provide(MockOpenAiAdapter)
)

// Run tests with mock adapter
Effect.runPromise(
  myTestEffect.pipe(Effect.provide(TestLayer))
)
```

### Example 3: Adding a New Provider

To add a new AI provider (e.g., Gemini):

1. **Create the adapter layer** (`src/main/ai/gemini/browser-provider-adapter.ts`):

```typescript
const PROVIDER: 'gemini' = 'gemini'
const GeminiProviderTag = AiProviderTags.register(PROVIDER)

export const GeminiBrowserProviderAdapter = Layer.effect(
  GeminiProviderTag,
  Effect.gen(function* () {
    // ... implementation
    const adapter: AiProviderPort = {
      provider: PROVIDER,
      supportsUsage: true,
      signIn: () => { /* ... */ },
      // ... other methods
    }
    return adapter
  })
)
```

2. **Add to AiAdaptersLayer** (`src/main/ai/adapters-layer.ts`):

```typescript
export const AiAdaptersLayer = Layer.mergeAll(
  OpenAiBrowserProviderAdapter,
  ClaudeBrowserProviderAdapter,
  CursorBrowserProviderAdapter,
  GeminiBrowserProviderAdapter  // Add new adapter
)
```

That's it! The new provider is now available throughout the application.

---

## Benefits Achieved

### 1. Hot-Swappable Providers

Providers can be replaced at runtime without changing code. Perfect for:
- **Testing**: Mock providers without touching production code
- **Development**: Test with fake adapters before implementing real ones
- **Debugging**: Swap in logging/tracing adapters

### 2. Multi-Instance Support

Multiple providers can operate simultaneously:
- Display Claude usage bar alongside OpenAI usage bar
- Compare usage across providers
- Parallel authentication flows

### 3. Clear Separation of Concerns

```
┌─────────────────┐
│  AiProviderPort │  ← Contract (what)
└─────────────────┘
        ↑
        │ implements
        │
┌─────────────────┐
│     Adapters    │  ← Implementation (how)
│  OpenAI/Claude  │
└─────────────────┘
        ↑
        │ uses
        │
┌─────────────────┐
│    Services     │  ← Business Logic (why)
│ AiProviderSvc   │
└─────────────────┘
```

### 4. Type Safety

All operations are fully typed:
- Input/output types enforced by Effect Schema
- Error types tracked in Effect's error channel
- Context requirements explicit in type signatures

### 5. Testability

Each layer can be tested in isolation:
- **Unit tests**: Mock individual adapter methods
- **Integration tests**: Replace entire adapter layer
- **E2E tests**: Use real adapters with test accounts

---

## Migration from Old Architecture

### Before (Effect.Service classes)

```typescript
export class OpenAiBrowserProviderAdapter extends Effect.Service<OpenAiBrowserProviderAdapter>()(
  'OpenAiBrowserProviderAdapter',
  {
    dependencies: [/* hardcoded */],
    effect: Effect.gen(function* () {
      const adapter: AiProviderAdapter = { /* ... */ }
      return adapter
    })
  }
) {}

// Registry hardcodes all adapters
export class AiProviderRegistryService extends Effect.Service<AiProviderRegistryService>()(
  'AiProviderRegistryService',
  {
    dependencies: [
      OpenAiBrowserProviderAdapter.Default,  // ❌ Hardcoded dependency
      ClaudeBrowserProviderAdapter.Default,
    ],
    // ...
  }
) {}
```

**Problems:**
- ❌ Can't hot-swap adapters (hardcoded dependencies)
- ❌ Registry tightly coupled to specific implementations
- ❌ Multiple instances difficult (shared service instance)

### After (Hexagonal Ports & Adapters)

```typescript
// Port-based adapter
export const OpenAiBrowserProviderAdapter = Layer.effect(
  OpenAiProviderTag,  // ✅ Tagged for dynamic lookup
  Effect.gen(function* () {
    const adapter: AiProviderPort = { /* ... */ }
    return adapter
  })
)

// Registry uses tags for dynamic lookup
export class AiProviderRegistryService extends Effect.Service<AiProviderRegistryService>()(
  'AiProviderRegistryService',
  {
    effect: Effect.gen(function* () {
      return {
        getAdapter: (provider) => {
          const tag = AiProviderTags.get(provider)  // ✅ Dynamic lookup
          return yield* tag
        }
      }
    })
  }
) {}
```

**Benefits:**
- ✅ Hot-swappable (adapters resolved from Context)
- ✅ Registry decoupled from implementations
- ✅ Multiple instances supported (each provider has unique tag)

---

## Files Changed

### Created
- `src/main/ai/provider-port.ts` - Port definition and tag registry
- `src/main/ai/adapters-layer.ts` - Layer composition
- `src/main/ai/infrastructure-layer.ts` - AI infrastructure layer (re-exports CoreInfrastructureLayer)
- `src/main/core-infrastructure-layer.ts` - **CRITICAL:** Shared infrastructure services for memoization
- `docs/AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md` - This document

### Modified
- `src/main/ai/openai/browser-provider-adapter.ts` - Converted to Layer + uses shared infrastructure
- `src/main/ai/claude/browser-provider-adapter.ts` - Converted to Layer + uses shared infrastructure
- `src/main/ai/cursor/browser-provider-adapter.ts` - Converted to Layer + uses shared infrastructure
- `src/main/ai/registry.ts` - Dynamic tag-based lookup + captures adapters at construction time
- `src/main/ai/ai-provider-service.ts` - Removed narrow type annotations
- `src/main/ai/ports.ts` - Deprecated, re-exports for compatibility
- `src/main/index.ts` - Uses `CoreInfrastructureLayer` and `AiAdaptersLayer` with proper memoization

### Memoization Improvements
- ✅ Shared `CoreInfrastructureLayer` prevents duplicate service construction
- ✅ All adapters reference the same infrastructure layer
- ✅ MainLayer uses shared infrastructure reference
- ✅ Services constructed once, shared across all domains

### Unchanged (Backward Compatible)
- All IPC handlers continue to work
- All renderer code continues to work
- All schemas continue to work

---

## Next Steps (Future Work)

### 1. Complete Layer Separation

Continue the layer separation plan outlined in `src/main/index.ts`:

```typescript
const AiAdaptersLayer      // ✅ DONE
const AiDomainLayer        // TODO: Extract core infrastructure
const CoreInfrastructureLayer  // TODO: BrowserAuthService, etc.
```

### 2. Apply Same Pattern to VCS Providers

Apply the hexagonal pattern to VCS providers (GitHub, GitLab, Bitbucket):
- Create `VcsProviderPort`
- Convert adapters to Layers
- Create `VcsAdaptersLayer`

### 3. Create Mock Adapters for Testing

Build a library of mock adapters for all providers:
- `MockOpenAiAdapter`
- `MockClaudeAdapter`
- `MockCursorAdapter`

### 4. Runtime Provider Configuration

Allow providers to be configured at runtime via config files:
- Enable/disable specific providers
- Configure provider-specific settings
- Support custom provider implementations

---

## Troubleshooting

### Error: "Service not found: AiProvider:openai"

**Problem:** The adapter services are not available in the context when the registry tries to access them.

**Cause:** Using `Layer.mergeAll` instead of `Layer.provide` - adapters must be provided to services that depend on them.

**Solution:**
```typescript
// ❌ WRONG
Layer.mergeAll(AiAdaptersLayer, AiProviderRegistryService.Default)

// ✅ CORRECT
Layer.provide(
  AiProviderRegistryService.Default,
  AiAdaptersLayer
)
```

### Error: IPC handler type mismatch - context requirements

**Problem:** IPC handlers expect `Effect<T, E, never>` but service methods return `Effect<T, E, AiProviderPort>`.

**Cause:** Registry service dynamically accesses adapters via `yield* tag` at call time, requiring adapters in context.

**Solution:** Capture adapters at service construction time instead:
```typescript
// ❌ WRONG - Accesses adapters at call time
effect: Effect.gen(function* () {
  return {
    getAdapter: (provider) => Effect.gen(function* () {
      const tag = AiProviderTags.get(provider)
      return yield* tag  // Requires context at call time!
    })
  }
})

// ✅ CORRECT - Captures adapters at construction time
effect: Effect.gen(function* () {
  // Capture once during construction
  const adaptersMap = new Map()
  for (const tag of AiProviderTags.all()) {
    const adapter = yield* tag  // Context available during construction
    adaptersMap.set(adapter.provider, adapter)
  }

  return {
    getAdapter: (provider) => Effect.gen(function* () {
      return adaptersMap.get(provider)  // No context needed at call time
    })
  }
})
```

### Error: Type mismatch with Effect<A, never, never>

**Problem:** Effect return types are too narrow - they don't include error or context requirements.

**Cause:** Explicitly typing Effect returns as `Effect.Effect<T>` defaults to `Effect<T, never, never>`.

**Solution:** Remove narrow type annotations and let TypeScript infer the full type:
```typescript
// ❌ WRONG
getUsage: (id: string): Effect.Effect<Usage> => { /* ... */ }

// ✅ CORRECT
getUsage: (id: string) => { /* ... */ }
```

## Layer Memoization: Critical for Performance

### How Effect Memoizes Layers

**CRITICAL:** Effect memoizes layers by **REFERENCE**, not by service tag!

Each call to `.Default()` creates a **new layer instance**, even if it produces the same service:

```typescript
// ❌ WRONG - Creates DUPLICATE services
const MainLayer = Layer.mergeAll(
  BrowserAuthService.Default,        // Instance 1
  // ... other services
)

const AiAdapter = Layer.effect(...).pipe(
  Layer.provide(
    Layer.mergeAll(
      BrowserAuthService.Default,    // Instance 2 - DUPLICATE!
    )
  )
)
```

**Result:** `BrowserAuthService` is constructed TWICE (once in MainLayer, once in adapter) ❌

### The Solution: Shared Module-Level References

Store layers in variables and reuse the same reference everywhere:

```typescript
// ✅ CORRECT - Create ONE shared reference
const CoreInfrastructureLayer = Layer.mergeAll(
  BrowserAuthService.Default,        // Created ONCE
  CookieUsagePageAdapter.Default,
  ElectronSessionService.Default,
)

const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,           // References same instance
  // ... other services
)

const AiAdapter = Layer.effect(...).pipe(
  Layer.provide(CoreInfrastructureLayer)  // References same instance
)
```

**Result:** All services in `CoreInfrastructureLayer` are constructed ONCE and shared ✅

### Our Implementation

**File: `src/main/core-infrastructure-layer.ts`**
```typescript
export const CoreInfrastructureLayer = Layer.mergeAll(
  ElectronSessionService.Default,
  BrowserAuthService.Default,
  CookieUsagePageAdapter.Default,
  SecureStoreService.Default,
  TierService.Default
)
```

**File: `src/main/ai/infrastructure-layer.ts`**
```typescript
// Re-export CoreInfrastructureLayer - ensures same reference
export const AiInfrastructureLayer = CoreInfrastructureLayer
```

**File: `src/main/ai/adapters-layer.ts`**
```typescript
// All adapters use the same infrastructure reference
export const OpenAiBrowserProviderAdapter = Layer.effect(...).pipe(
  Layer.provide(AiInfrastructureLayer)  // Shared reference
)
```

**File: `src/main/index.ts`**
```typescript
const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,  // Single reference used here too
  // ...
)
```

### Benefits

✅ **No Duplicate Construction**: Services are built once, shared everywhere
✅ **Better Performance**: Avoids unnecessary initialization overhead
✅ **Consistent State**: All code uses the same service instance
✅ **Resource Efficiency**: Single connection pools, caches, etc.

### When to Use Shared References

Use shared module-level references when:
- A service is used by multiple domains/layers
- A service is expensive to construct (DB connections, session managers)
- A service maintains state that should be shared (caches, registries)

## Key Learnings

1. **Effectful Ports > Interface Ports**: Using `Effect.Service` for ports enables memoization, lifecycle management, and dependency injection out of the box.

2. **Tags Enable Hot-Swapping**: `Context.Tag` allows runtime service replacement without code changes.

3. **Let TypeScript Infer**: Don't narrow Effect return types - let TypeScript infer the full `Effect<A, E, R>` including errors and context.

4. **Layer.provide vs Layer.mergeAll**: `Layer.mergeAll` combines layers side-by-side; `Layer.provide` makes one layer's services available to another. Use `Layer.provide` for dependency injection!

5. **Capture Dependencies at Construction, Not Call Time**: When a service needs to access dependencies dynamically (via tags), capture them in a closure during service construction. This prevents context requirements from propagating to method return types, making the service easier to use.

6. **Layer Memoization by Reference**: Effect memoizes layers by reference, not by tag. Always store layers in variables and reuse the same reference to avoid duplicate construction.

7. **Layer Composition is Powerful**: Layers can be composed, overridden, and provided incrementally, enabling flexible architecture.

8. **Migration Can Be Gradual**: Old code continues to work via re-exports while new code uses the improved architecture.

---

**Author:** AI Assistant
**Reviewer:** Ken Udovic
**Date:** 2025-10-26
