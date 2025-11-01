# Effect Ports and Layers Pattern Guide

A comprehensive guide to implementing hexagonal architecture with Effect-TS, based on real-world implementations in the Geppetto codebase.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Port Definition Patterns](#port-definition-patterns)
   - [Understanding Context.Tag Patterns](#understanding-contexttag-patterns)
   - [Pattern 1: GenericTag (RECOMMENDED)](#pattern-1-generictag-recommended-for-ports)
   - [Pattern 2: Class extends Context.Tag (DEPRECATED for Ports)](#pattern-2-class-extends-contexttag-deprecated-for-ports)
   - [Pattern 3: Inline Interface](#pattern-3-inline-interface-for-services)
   - [Name Collision Anti-Pattern](#-anti-pattern-name-collision-with-class-extends-contexttag)
3. [Adapter Implementation Patterns](#adapter-implementation-patterns)
4. [Service Implementation Patterns](#service-implementation-patterns)
5. [Type Inference Patterns](#type-inference-patterns)
6. [Result API Patterns](#result-api-patterns)
   - [Result.matchWithError vs Result.builder](#understanding-resultmatchwitherror-vs-resultbuilder)
7. [Common Anti-Patterns](#common-anti-patterns)
8. [Real-World Examples](#real-world-examples)
9. [Migration Guide](#migration-guide)
10. [Testing Patterns](#testing-patterns)

## Core Concepts

### What is a Port?

A **Port** is an interface that defines the contract for external dependencies. It's the abstraction layer that allows your business logic to remain decoupled from implementation details.

```typescript
// Port: Abstract interface
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  kill: (processId: string) => Effect.Effect<void, TerminalError>
  // ... other methods
}
```

### What is an Adapter?

An **Adapter** is the concrete implementation of a Port. It's what actually does the work - whether that's calling an API, accessing the file system, or spawning processes.

```typescript
// Adapter: Concrete implementation
export const NodePtyTerminalAdapter = Layer.effect(
  TerminalPort,
  Effect.gen(function* () {
    // Actual implementation using node-pty
    const adapter: TerminalPort = {
      spawn: (config) => { /* ... */ },
      kill: (processId) => { /* ... */ }
    }
    return adapter
  })
)
```

### What is a Layer?

A **Layer** in Effect is a composable unit of dependency injection. It provides services to other layers and can depend on services from other layers.

## Port Definition Patterns

### Understanding Context.Tag Patterns

Effect provides three patterns for creating service tags. Understanding when to use each is **critical** for avoiding type errors.

#### Pattern 1: GenericTag (RECOMMENDED for Ports)

```typescript
// source-control/ports/secondary/provider-port.ts
import { Context } from 'effect'

// Step 1: Define the interface
export interface ProviderPortFactory {
  getProvider: (type: ProviderType) => ProviderPort
}

// Step 2: Create tag using GenericTag
export const ProviderPortFactory = Context.GenericTag<ProviderPortFactory>(
  'SourceControl/ProviderPortFactory'
)
```

**When to use:**
- ✅ For ports that use the same name for interface and tag
- ✅ When you want to avoid name collision issues
- ✅ Multi-provider systems (via tag registry pattern)

**Advantages:**
- No name collision between interface and tag
- Type annotation `const adapter: PortInterface = { ... }` works correctly
- Simpler mental model - separate interface + tag

#### Pattern 2: Class extends Context.Tag (DEPRECATED for Ports)

```typescript
// AVOID THIS PATTERN FOR PORTS - Can cause name collisions
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  kill: (processId: string) => Effect.Effect<void, TerminalError>
}

// ⚠️ NAME COLLISION RISK: Class has same name as interface
export class TerminalPort extends Context.Tag('TerminalPort')<
  TerminalPort,
  TerminalPort
>() {}

// This causes TypeScript to resolve to the CLASS instead of the INTERFACE!
const adapter: TerminalPort = { spawn, kill }  // ❌ Type error!
// Error: Type '{ spawn: ..., kill: ... }' is missing the following properties
// from type 'TerminalPort': Id, Type, [TagTypeId]
```

**Why this fails:**
- TypeScript resolves `TerminalPort` in type position to the **class**, not the interface
- The class has Context.Tag properties (Id, Type, [TagTypeId])
- Your adapter object doesn't have those properties → type error
- Using `satisfies` doesn't help - it also resolves to the class

**When to use:**
- ✅ For services where interface is defined inline in generics (KeyboardLayerManager pattern)
- ❌ **NEVER** for ports where interface and tag share the same name

#### Pattern 3: Inline Interface (for Services)

```typescript
// keyboard/keyboard-layer-manager.ts
export class KeyboardLayerManager extends Context.Tag('KeyboardLayerManager')<
  KeyboardLayerManager,
  {
    // Interface defined inline - no name collision possible
    readonly pushLayer: (layer: KeyboardLayer) => Effect.Effect<void>
    readonly popLayer: (layer: KeyboardLayer) => Effect.Effect<void>
    readonly getState: () => Effect.Effect<KeyboardLayerState>
  }
>() {
  static Live = (config: Config) => Layer.effect(/* ... */)
}
```

**When to use:**
- ✅ For Effect.Service implementations
- ✅ When service interface is simple and doesn't need separate definition
- ✅ When you want service and tag in single declaration

### ✅ CORRECT: Port with GenericTag (Recommended)

**Example from TerminalPort (after fix):**

```typescript
// terminal-port.ts
import { Context } from 'effect'

// Step 1: Define the interface
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  kill: (processId: string) => Effect.Effect<void, TerminalError>
  getState: (processId: string) => Effect.Effect<ProcessState, TerminalError>
  subscribe: (processId: string) => Stream.Stream<OutputChunk, TerminalError>
}

// Step 2: Create Context tag using GenericTag (NO name collision)
export const TerminalPort = Context.GenericTag<TerminalPort>('TerminalPort')
```

**Why this works:**
- Clean separation between interface (type) and tag (value)
- No name collision - tag is a const, interface is a type
- Type annotations work correctly: `const adapter: TerminalPort = { ... }`
- TypeScript resolves correctly in both type and value positions

**Adapter implementation:**

```typescript
export const NodePtyTerminalAdapter = Layer.effect(
  TerminalPort,  // The tag
  Effect.gen(function* () {
    // Implementation
    const adapter: TerminalPort = {  // ✅ Resolves to interface, not tag
      spawn,
      kill,
      getState,
      subscribe
    }
    return adapter
  })
)
```

### ❌ ANTI-PATTERN: Name Collision with Class extends Context.Tag

**What we had before (caused type errors):**

```typescript
// terminal-port.ts
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  // ... other methods
}

// ❌ WRONG: Class has same name as interface
export class TerminalPort extends Context.Tag('TerminalPort')<
  TerminalPort,
  TerminalPort
>() {}

// In adapter file:
const adapter: TerminalPort = {  // ❌ TypeScript resolves to CLASS!
  spawn,
  kill,
  // ... other methods
}
// ERROR: Type '{ spawn: ..., kill: ... }' is missing the following properties
// from type 'TerminalPort': Id, Type, [TagTypeId]

return adapter  // Still errors even without type annotation!

// Even 'satisfies' doesn't work:
return {
  spawn,
  kill
} satisfies TerminalPort  // ❌ Still resolves to class!
```

**Error Pattern Recognition:**

If you see this error:
```
Type '{ ... }' is missing the following properties from type 'YourPort':
Id, Type, [TagTypeId]
```

**Root Cause**: You have a name collision between an interface and a class that extends Context.Tag.

**Solution**: Change to GenericTag pattern.

### Migration: Class extends Context.Tag → GenericTag

```typescript
// BEFORE (with name collision)
export interface MyPort {
  method1: () => Effect.Effect<Result, Error>
}

export class MyPort extends Context.Tag('MyPort')<MyPort, MyPort>() {}

// AFTER (no collision)
export interface MyPort {
  method1: () => Effect.Effect<Result, Error>
}

export const MyPort = Context.GenericTag<MyPort>('MyPort')
```

**Changes needed:**
1. Change `export class` to `export const`
2. Change `extends Context.Tag('MyPort')<MyPort, MyPort>()` to `Context.GenericTag<MyPort>('MyPort')`
3. All usage sites remain the same - no changes needed!

### ❌ ANTI-PATTERN: Mixing Service Definition with Port

```typescript
// DON'T DO THIS
export class TerminalPort extends Effect.Service<TerminalPort>()(
  'TerminalPort',
  {
    effect: Effect.gen(function* () {
      // Implementation here - WRONG!
      // Ports should be abstract, not contain implementation
    })
  }
) {}
```

**Why this is wrong:**
- Ports should define contracts, not implementations
- Couples abstraction with concrete implementation
- Makes testing and swapping implementations difficult

## Adapter Implementation Patterns

### ✅ CORRECT: Layer.effect for Adapter Implementation

```typescript
// node-pty/adapter.ts
import { Layer, Effect } from 'effect'
import { TerminalPort, ProcessConfig, ProcessState } from '../terminal-port'

export const NodePtyTerminalAdapter = Layer.effect(
  TerminalPort,  // The tag we're providing
  Effect.gen(function* () {
    // Dependencies can be yielded here if needed
    // const someService = yield* SomeOtherService

    // Implementation details
    const processes = yield* Ref.make(HashMap.empty<ProcessId, ProcessInstance>())

    const spawn = (config: ProcessConfig) => Effect.gen(function* () {
      // Actual spawn implementation using node-pty
      const ptyProcess = yield* Effect.try({
        try: () => ptyModule.spawn(config.shell, [...config.args], {
          // options
        })
      })
      // ... rest of implementation
      return state
    })

    const kill = (processId: string) => Effect.gen(function* () {
      // Implementation
    })

    // Return object that satisfies TerminalPort interface
    const adapter: TerminalPort = {
      spawn,
      kill,
      getState,
      subscribe
    }

    return adapter
  })
)
```

**Why this works:**
- Clear implementation of the Port interface
- Proper Layer composition
- Can easily swap implementations by providing different Layer

### ❌ ANTI-PATTERN: Effect.Service for Adapters

```typescript
// DON'T DO THIS - This was our initial mistake
export class NodePtyTerminalAdapter extends Effect.Service<NodePtyTerminalAdapter>()(
  'NodePtyTerminalAdapter',
  {
    effect: Effect.gen(function* () {
      // Implementation
      return { spawn, kill } satisfies TerminalPort
    })
  }
) {}

// Then trying to use it as a Layer
export const NodePtyTerminalAdapterLayer = Layer.succeed(
  TerminalPort,
  NodePtyTerminalAdapter  // TYPE ERROR!
)
```

**Why this is wrong:**
- Effect.Service creates its own service, not an implementation of TerminalPort
- Type mismatch when trying to provide as TerminalPort
- Adds unnecessary abstraction layer

## Service Implementation Patterns

### ✅ CORRECT: Interface Constraint Pattern for Type Inference

When implementing Effect services that orchestrate ports, use the interface constraint pattern to preserve type inference:

```typescript
// terminal-service.ts
interface TerminalServiceMethods {
  spawnAiWatcher(config: WatcherConfig): Effect.Effect<
    { processId: string; state: ProcessState },
    TerminalError,
    never
  >
  killWatcher(processId: string): Effect.Effect<void, TerminalError, never>
  listActiveWatchers(): Effect.Effect<ReadonlyArray<WatcherInfo>, never, never>
}

export class TerminalService extends Effect.Service<TerminalService>()(
  'TerminalService',
  {
    effect: Effect.gen(function* () {
      const registry = yield* TerminalRegistry
      const activeWatchers = yield* Ref.make(HashMap.empty<string, WatcherConfig>())

      // USE INTERFACE CONSTRAINT - This preserves type inference!
      const spawnAiWatcher: TerminalServiceMethods['spawnAiWatcher'] = (config) =>
        Effect.gen(function* () {
          const adapter = yield* registry.getDefaultAdapter()
          const state = yield* adapter.spawn(processConfig)
          yield* Ref.update(activeWatchers, HashMap.set(processId, config))
          return { processId, state }
        })

      const killWatcher: TerminalServiceMethods['killWatcher'] = (processId) =>
        Effect.gen(function* () {
          const adapter = yield* registry.getDefaultAdapter()
          yield* adapter.kill(processId)
          yield* Ref.update(activeWatchers, HashMap.remove(processId))
        })

      return {
        spawnAiWatcher,
        killWatcher,
        listActiveWatchers
      } satisfies TerminalServiceMethods
    })
  }
) {}
```

### ❌ ANTI-PATTERN: Explicit Type Annotations

```typescript
// DON'T DO THIS - Breaks type inference!
const spawnAiWatcher = (config: WatcherConfig): Effect.Effect<
  { processId: string; state: ProcessState },
  TerminalError,
  never
> => Effect.gen(function* () {
  // TypeScript loses type inference here!
  // You'll get "Type 'unknown' is not assignable to type 'TerminalError'"
})

// Also DON'T DO THIS - Using 'any' to fix type errors
const killWatcher = (processId: string) =>
  Effect.gen(function* (): Generator<any, void, any> {  // NO!
    // Using 'any' defeats type safety
  })
```

**Why interface constraints work:**
- TypeScript can infer types from the interface definition
- No need for explicit Generator type annotations
- Maintains full type safety without `any`

## Type Inference Patterns

### ✅ CORRECT: Handling Branded Types

**CRITICAL**: Always extract branded types from Effect Schema. Never manually define them.

```typescript
// ✅ CORRECT - Extract type from schema (like repository.ts)
// Step 1: Create the schema
export const ProcessIdSchema = S.String.pipe(S.brand('ProcessId'))

// Step 2: Extract the type from the schema
export type ProcessId = S.Schema.Type<typeof ProcessIdSchema>

// Step 3: Use the schema in classes
export class ProcessConfig extends S.Class<ProcessConfig>('ProcessConfig')({
  id: ProcessIdSchema,  // Use the schema, not S.String.pipe(S.brand(...))
  command: S.String,
  // ...
}) {}

// Step 4: Use the extracted type in your code
const processes = yield* Ref.make(HashMap.empty<ProcessId, ProcessInstance>())

const kill = (processId: string) => Effect.gen(function* () {
  // Cast plain string to branded type at HashMap operations
  const instance = yield* pipe(
    Ref.get(processes),
    Effect.map(HashMap.get(processId as ProcessId)),  // Now types match!
    Effect.flatMap(/* ... */)
  )
})
```

**Why this works**: `S.Schema.Type<typeof Schema>` extracts the exact TypeScript type that Effect Schema uses internally, including the proper `Brand<"ProcessId">` structure.

### ❌ ANTI-PATTERN: Manual Branded Type Definition

```typescript
// ❌ WRONG - Manual type definition conflicts with Effect Schema
export type ProcessId = string & { readonly ProcessId: unique symbol }

export class ProcessConfig extends S.Class<ProcessConfig>('ProcessConfig')({
  id: S.String.pipe(S.brand('ProcessId')),  // Different brand type!
  // This creates: string & Brand<"ProcessId">
  // But ProcessId is: string & { readonly ProcessId: unique symbol }
  // These are INCOMPATIBLE!
})
```

**Why this fails**: You've created TWO different branded type systems:
- Manual TypeScript brand: `string & { readonly ProcessId: unique symbol }`
- Effect Schema brand: `string & Brand<"ProcessId">`

These are incompatible types and will cause compilation errors throughout your codebase.

## Result API Patterns

### Understanding Result.matchWithError vs Result.builder

The `@effect-atom/atom-react` library provides two APIs for handling Result types. Understanding the difference is critical for proper type handling.

#### ✅ CORRECT: Result.matchWithError with Success Wrapper

When using `Result.matchWithError`, the `onSuccess` callback receives a **Success wrapper object**, not the unwrapped data.

```typescript
// terminal/TerminalPanel.tsx
import type { WatcherInfo } from '../../../shared/schemas/terminal'

useEffect(() => {
  Result.matchWithError(watchersResult, {
    onSuccess: (data) => {
      // ✅ data is Success<readonly WatcherInfo[], NetworkError>
      // Access actual data via data.value
      if (data && data.value.length > 0 && !activeProcessId) {
        setActiveProcessId(data.value[0].processId)  // Use .value
      }
    },
    onError: (error) => {
      // error is the actual error type (NetworkError)
    },
    onDefect: (defect) => {
      // defect is unknown
    },
    onInitial: () => {
      // Initial state
    }
  })
}, [watchersResult, activeProcessId])
```

**Key Points:**
- `onSuccess` receives: `Success<T, E>` (wrapper object with `.value` property)
- `onError` receives: `E` (the actual error type)
- `onDefect` receives: `unknown` (unexpected errors)
- Access actual data via `data.value`, not just `data`

#### ✅ CORRECT: Result.builder with Unwrapped Data

When using `Result.builder`, the `.onSuccess()` callback receives the **unwrapped data** directly.

```typescript
// From repository carousel
{Result.builder(repos)
  .onSuccess(repositories => {  // repositories is T, not Success<T, E>
    const total = repositories.length  // Direct access, no .value needed
    if (total === 0) {
      return <div>No repositories yet</div>
    }
    return <RepositoryGrid repositories={repositories} />
  })
  .onErrorTag('AuthenticationError', error => (
    <ErrorAlert error={error} />
  ))
  .onInitial(() => <LoadingSpinner />)
  .render()}
```

**Key Points:**
- `.onSuccess()` receives: `T` (unwrapped data, no `.value` needed)
- `.onErrorTag()` receives: specific error type
- `.onError()` receives: all error types
- `.onInitial()` receives: nothing

### ❌ ANTI-PATTERN: Adding Type Annotations to Result Callbacks

```typescript
// ❌ WRONG - Type annotation breaks inference
Result.matchWithError(watchersResult, {
  onSuccess: (data: readonly WatcherInfo[]) => {  // Type mismatch!
    // TypeScript error: Type '(data: readonly WatcherInfo[]) => void' is not
    // assignable to type '(_: Success<readonly WatcherInfo[], NetworkError>) => void'
  }
})

// ✅ CORRECT - Let TypeScript infer the type
Result.matchWithError(watchersResult, {
  onSuccess: (data) => {  // TypeScript infers Success<readonly WatcherInfo[], NetworkError>
    if (data && data.value.length > 0) {  // Use .value
      // ...
    }
  }
})
```

**Why this matters:**
- `Result.matchWithError` expects `Success<T, E>` wrapper in `onSuccess`
- Adding explicit type annotation `T` creates a type mismatch
- TypeScript can't reconcile `T` with `Success<T, E>`
- Let TypeScript infer the type - it knows the correct wrapper type

### Quick Reference: Result API Differences

| API | `onSuccess` receives | Data access pattern | Use case |
|-----|---------------------|---------------------|----------|
| `Result.matchWithError` | `Success<T, E>` wrapper | `data.value.property` | useEffect, side effects |
| `Result.builder` | `T` (unwrapped) | `data.property` | JSX rendering |

**Rule of thumb:**
- In `useEffect` or callbacks → use `Result.matchWithError` → access via `.value`
- In JSX rendering → use `Result.builder` → direct access

## Common Anti-Patterns

### Anti-Pattern 1: Not Memoizing Shared Infrastructure

```typescript
// ❌ WRONG - Creates new instances each time
const MainLayer = Layer.mergeAll(
  Layer.mergeAll(SessionService.Default, StoreService.Default),  // New instance!
  MyDomainService.Default
)

const AnotherLayer = Layer.mergeAll(
  Layer.mergeAll(SessionService.Default, StoreService.Default),  // Different instance!
  AnotherDomainService.Default
)
```

```typescript
// ✅ CORRECT - Share via module-level constant
export const CoreInfrastructureLayer = Layer.mergeAll(
  SessionService.Default,
  StoreService.Default
)

const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,  // Same instance
  MyDomainService.Default
)

const AnotherLayer = Layer.mergeAll(
  CoreInfrastructureLayer,  // Same instance
  AnotherDomainService.Default
)
```

### Anti-Pattern 2: Lazy Loading Native Modules Incorrectly

```typescript
// ❌ WRONG - Top-level import causes immediate loading
import * as pty from 'node-pty'  // Loads at service construction time!

export const NodePtyAdapter = Layer.effect(
  TerminalPort,
  Effect.gen(function* () {
    // Service construction fails because node-pty is already loaded
  })
)
```

```typescript
// ✅ CORRECT - Lazy load in Effect context
const getPty = () => Effect.sync(() => require('node-pty') as typeof pty)

export const NodePtyAdapter = Layer.effect(
  TerminalPort,
  Effect.gen(function* () {
    const ptyModule = yield* getPty()  // Loads only when needed
    // Now safe to use ptyModule
  })
)
```

### Anti-Pattern 3: Wrong Dependencies Declaration

```typescript
// ❌ WRONG - Using raw tags for service dependencies
export class TerminalRegistry extends Effect.Service<TerminalRegistry>()(
  'TerminalRegistry',
  {
    effect: Effect.gen(function* () {
      const adapter = yield* TerminalPort
      // ...
    }),
    dependencies: [TerminalPort]  // WRONG! TerminalPort is a tag, not a layer
  }
) {}
```

```typescript
// ✅ CORRECT - No dependencies when using injected port
export class TerminalRegistry extends Effect.Service<TerminalRegistry>()(
  'TerminalRegistry',
  {
    effect: Effect.gen(function* () {
      const adapter = yield* TerminalPort  // Injected via Layer.provide
      // ...
    }),
    dependencies: []  // Adapter provided externally via Layer.provide
  }
) {}

// Then compose with Layer.provide
const TerminalLayer = Layer.provide(
  Layer.mergeAll(TerminalRegistry.Default, TerminalService.Default),
  NodePtyTerminalAdapter  // Provides TerminalPort to services
)
```

## Multi-Provider Pattern: Registry vs Direct Access

When you have **multiple adapters implementing the same port**, you face a choice: use a registry service or access adapters directly via tags.

### Pattern 1: Registry Service (For Multi-Provider Orchestration)

**When to use:**
- ✅ Need dynamic runtime selection of providers
- ✅ Need to iterate over all available providers
- ✅ Complex orchestration (fallback, A/B testing, cost optimization)
- ✅ IPC handlers need adapter access with minimal context
- ✅ Frequent lookups in loops/iterations

**Architecture:**

```typescript
// 1. Port Interface (same as always)
export interface AiProviderPort {
  readonly provider: AiProviderType
  signIn(): Effect.Effect<AiProviderSignInResult, AiProviderAuthenticationError>
  getUsage(accountId: AiAccountId): Effect.Effect<AiUsageSnapshot, AiProviderUsageError>
}

// 2. Tag Registry (GenericTag management)
export class AiProviderTags {
  private static tags = new Map<AiProviderType, Context.Tag<AiProviderPort, AiProviderPort>>()

  static register(provider: AiProviderType) {
    const tag = Context.GenericTag<AiProviderPort>(`AiProvider:${provider}`)
    this.tags.set(provider, tag)
    return tag
  }

  static all() {
    return Array.from(this.tags.values())
  }
}

// 3. Adapters (Layer implementations)
const OpenAiProviderTag = AiProviderTags.register('openai')
export const OpenAiBrowserProviderAdapter = Layer.effect(
  OpenAiProviderTag,
  Effect.gen(function* () {
    const adapter: AiProviderPort = {
      provider: 'openai',
      signIn: () => { /* ... */ },
      getUsage: (accountId) => { /* ... */ }
    }
    return adapter
  })
)

// 4. Registry Service (Adapter capture & lookup)
export class AiProviderRegistryService extends Effect.Service<...>() {
  effect: Effect.gen(function* () {
    // ✅ Capture adapters at construction time
    const tags = AiProviderTags.all()
    const adaptersMap = new Map<AiProviderType, AiProviderPort>()

    for (const tag of tags) {
      const adapter = yield* tag  // Context available NOW
      adaptersMap.set(adapter.provider, adapter)
    }

    // ✅ Methods access Map - no context needed at call time
    return {
      getAdapter: (provider) =>
        Effect.gen(function* () {
          const adapter = adaptersMap.get(provider)
          if (!adapter) return yield* Effect.fail(new Error(`Provider ${provider} not found`))
          return adapter
        }),
      listAdapters: () => Effect.succeed(Array.from(adaptersMap.values()))
    }
  })
}

// 5. Usage - Clean and context-free
const agent = Effect.gen(function* () {
  const registry = yield* AiProviderRegistryService

  // Dynamic selection
  const provider = selectBestProvider(criteria)
  const adapter = yield* registry.getAdapter(provider)

  // Iteration
  const all = yield* registry.listAdapters()
  const results = yield* Effect.forEach(all, a => a.getUsage(accountId))
})
```

**Benefits:**
- Adapters captured once at construction
- No context propagation at call sites
- Clean iteration and dynamic selection
- IPC handlers only need registry

**See detailed multi-provider patterns:** [AI Layers Hexagonal Agents Benefit](./AI_LAYERS_HEXAGONAL_AGENTS_BENEFIT.md)

---

### Pattern 2: Direct Port Access (For Single/Static Providers)

**When to use:**
- ✅ Single adapter per port
- ✅ Static, compile-time adapter selection
- ✅ No iteration or multi-provider logic needed

**Architecture:**

```typescript
// 1. Port Interface
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  kill: (processId: string) => Effect.Effect<void, TerminalError>
}

// 2. Tag (GenericTag)
export const TerminalPort = Context.GenericTag<TerminalPort>('TerminalPort')

// 3. Adapter (Layer implementation)
export const NodePtyTerminalAdapter = Layer.effect(
  TerminalPort,
  Effect.gen(function* () {
    const adapter: TerminalPort = {
      spawn: (config) => { /* ... */ },
      kill: (processId) => { /* ... */ }
    }
    return adapter
  })
)

// 4. Usage - Direct access
const service = Effect.gen(function* () {
  // ✅ Direct access - no registry needed
  const terminal = yield* TerminalPort
  yield* terminal.spawn(config)
})
```

**Benefits:**
- Simpler - no registry abstraction
- Direct access to adapter
- Clear single implementation

---

### Comparison: Registry vs Direct Access

| Aspect | Registry Pattern | Direct Access |
|--------|-----------------|---------------|
| **Use Case** | Multiple providers, dynamic selection | Single provider, static selection |
| **Context Requirements** | Registry only (adapters captured) | Adapter layer needed |
| **Dynamic Selection** | ✅ Easy | ❌ Not possible |
| **Iteration** | ✅ `registry.listAdapters()` | ❌ Not applicable |
| **IPC Handlers** | ✅ Minimal context | ⚠️ Need adapter layer |
| **Complexity** | Higher (2 abstractions) | Lower (direct) |
| **Performance** | Better (cached lookups) | Slightly worse (yields each time) |
| **When to Use** | Multi-provider orchestration | Single adapter simplicity |

**Decision Rule:**
- **2+ adapters + (dynamic selection OR iteration OR orchestration)** → Use Registry
- **Single adapter OR static selection** → Use Direct Access

---

## Real-World Examples

### Example 1: Multi-Provider AI Domain (Registry Pattern)

```typescript
// ai/provider-port.ts
export interface AiProviderPort {
  readonly provider: AiProviderType
  signIn(): Effect.Effect<AiProviderSignInResult, AiProviderAuthenticationError>
  getUsage(accountId: AiAccountId): Effect.Effect<AiUsageSnapshot, AiProviderUsageError>
}

// Tag registry for multiple providers
export class AiProviderTags {
  private static tags = new Map<AiProviderType, Context.Tag<AiProviderPort, AiProviderPort>>()

  static register(provider: AiProviderType): Context.Tag<AiProviderPort, AiProviderPort> {
    const existing = this.tags.get(provider)
    if (existing) return existing

    const tag = Context.GenericTag<AiProviderPort>(`AiProvider:${provider}`)
    this.tags.set(provider, tag)
    return tag
  }
}

// openai/adapter.ts
const OpenAiProviderTag = AiProviderTags.register('openai')

export const OpenAiAdapter = Layer.effect(
  OpenAiProviderTag,
  Effect.gen(function* () {
    const browserAuth = yield* BrowserAuthService

    const adapter: AiProviderPort = {
      provider: 'openai',
      signIn: () => Effect.gen(function* () {
        // Implementation
      }),
      getUsage: (accountId) => Effect.gen(function* () {
        // Implementation
      })
    }

    return adapter
  })
)
```

### Example 2: Terminal Domain with Single Adapter (Direct Access Pattern)

```typescript
// terminal/terminal-port.ts
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  kill: (processId: string) => Effect.Effect<void, TerminalError>
  subscribe: (processId: string) => Stream.Stream<OutputChunk, TerminalError>
}

// Use GenericTag to avoid name collision
export const TerminalPort = Context.GenericTag<TerminalPort>('TerminalPort')

// terminal/node-pty/adapter.ts
export const NodePtyTerminalAdapter = Layer.effect(
  TerminalPort,
  Effect.gen(function* () {
    const processes = yield* Ref.make(HashMap.empty<ProcessId, ProcessInstance>())

    const spawn = (config: ProcessConfig) => Effect.gen(function* () {
      const ptyModule = yield* getPty()  // Lazy load native module
      const ptyProcess = yield* Effect.try({
        try: () => ptyModule.spawn(config.shell, [...config.args], {
          name: 'xterm-256color',
          cols: config.cols || 80,
          rows: config.rows || 24,
          cwd: config.cwd,
          env: { ...process.env, ...config.env }
        })
      })

      // Set up process tracking
      yield* Ref.update(processes, HashMap.set(config.id, instance))
      return state
    })

    const adapter: TerminalPort = { spawn, kill, subscribe }
    return adapter
  })
)

// terminal/terminal-service.ts - Direct port access (NO REGISTRY)
export class TerminalService extends Effect.Service<TerminalService>()(
  'TerminalService',
  {
    effect: Effect.gen(function* () {
      // ✅ Direct access to port - no registry needed
      const terminal = yield* TerminalPort
      const activeWatchers = yield* Ref.make(HashMap.empty<string, WatcherConfig>())

      return {
        spawnAiWatcher: (config) => Effect.gen(function* () {
          // Use terminal directly
          const state = yield* terminal.spawn(processConfig)
          yield* Ref.update(activeWatchers, HashMap.set(processId, config))
          return { processId, state }
        }),

        killWatcher: (processId) => Effect.gen(function* () {
          // Use terminal directly
          yield* terminal.kill(processId)
          yield* Ref.update(activeWatchers, HashMap.remove(processId))
        })
      }
    }),
    dependencies: []  // Terminal provided via Layer.provide
  }
) {}

// main/index.ts - Layer composition (no registry needed)
const TerminalLayer = Layer.provide(
  TerminalService.Default,
  NodePtyTerminalAdapter  // Provides TerminalPort directly
)
```

**Why no registry?**
- Single adapter (NodePty)
- No dynamic selection needed
- No iteration over multiple adapters
- Direct access is simpler and sufficient

## Migration Guide

### Migrating from Effect.Service to Layer.effect

If you have an adapter using Effect.Service pattern:

```typescript
// OLD PATTERN
export class MyAdapter extends Effect.Service<MyAdapter>()(
  'MyAdapter',
  {
    effect: Effect.gen(function* () {
      return { method1, method2 } satisfies MyPort
    })
  }
) {}

// Attempting to provide as port fails
Layer.succeed(MyPort, MyAdapter)  // TYPE ERROR!
```

Migrate to Layer.effect:

```typescript
// NEW PATTERN
export const MyAdapter = Layer.effect(
  MyPort,  // The port tag
  Effect.gen(function* () {
    // Implementation
    const adapter: MyPort = { method1, method2 }
    return adapter
  })
)

// Now it works!
Layer.provide(ServiceLayer, MyAdapter)  // ✅
```

### Migrating Service Methods with Type Issues

If you have service methods losing type inference:

```typescript
// OLD - Type inference breaks
const myMethod = (param: string): Effect.Effect<Result, MyError, never> =>
  Effect.gen(function* () {
    // Type 'unknown' is not assignable to type 'MyError'
  })
```

Migrate to interface constraint pattern:

```typescript
// NEW - Type inference works
interface MyServiceMethods {
  myMethod(param: string): Effect.Effect<Result, MyError, never>
}

const myMethod: MyServiceMethods['myMethod'] = (param) =>
  Effect.gen(function* () {
    // Types properly inferred!
  })
```

## Testing Patterns

### Testing with Mock Adapters

```typescript
// test/mocks/terminal-adapter.mock.ts
export const MockTerminalAdapter = Layer.effect(
  TerminalPort,
  Effect.gen(function* () {
    const mockProcesses = new Map<string, ProcessState>()

    const adapter: TerminalPort = {
      spawn: (config) => Effect.succeed(
        new ProcessState({ status: 'running', pid: 1234 })
      ),
      kill: (processId) => Effect.void,
      subscribe: (processId) => Stream.empty
    }

    return adapter
  })
)

// In tests
const TestLayer = Layer.provide(
  TerminalService.Default,
  MockTerminalAdapter  // Swap real adapter for mock
)
```

## Best Practices Summary

1. **Ports define contracts** - Keep them abstract, no implementation
2. **Use GenericTag for ports** - Avoid name collisions with `Context.GenericTag<Interface>('name')` pattern
3. **Adapters implement ports** - Use Layer.effect, not Effect.Service
4. **Services orchestrate** - Use interface constraint pattern for type inference
5. **Share infrastructure** - Memoize via module-level constants
6. **Lazy-load native modules** - Use Effect.sync(() => require(...))
7. **Extract branded types from schemas** - Always use `S.Schema.Type<typeof Schema>` pattern, never manually define branded types
8. **Result.matchWithError uses wrappers** - Access data via `data.value`, not `data`
9. **Don't add type annotations to Result callbacks** - Let TypeScript infer wrapper types
10. **Test with mock adapters** - Easy to swap via Layer.provide

### Quick Decision Tree

**Creating a Port?**
- Use `Context.GenericTag<PortInterface>('PortName')` pattern
- Separate interface definition from tag
- Avoids name collision issues

**Multiple Adapters for Same Port?**
- YES → Consider registry pattern
  - Need dynamic selection? → Use registry
  - Need iteration? → Use registry
  - Need orchestration (fallback, A/B testing)? → Use registry
  - Simple static use? → Direct tag access is fine
- NO (single adapter) → Use direct port access, skip registry

**Creating a Service?**
- Use `class Service extends Context.Tag` with inline interface
- Or use `Effect.Service` pattern with interface constraint

**Implementing an Adapter?**
- Use `Layer.effect(PortTag, Effect.gen(...))`
- Return object with explicit type: `const adapter: PortInterface = { ... }`

**Working with Result types?**
- `Result.matchWithError` → access via `.value` in `onSuccess`
- `Result.builder` → direct access in `.onSuccess()`
- Never add explicit type annotations to callbacks

**Dealing with TypeScript errors?**
- See error "missing Id, Type, [TagTypeId]"? → Name collision, use GenericTag
- See error "Type 'unknown' not assignable"? → Use interface constraint pattern
- See error with branded types? → Extract type from schema with `S.Schema.Type<typeof Schema>`

## Related Documentation

- [AI Adapters Hexagonal Architecture](./AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md) - Deep dive into hexagonal architecture
- [AI Layers Hexagonal Agents Benefit](./AI_LAYERS_HEXAGONAL_AGENTS_BENEFIT.md) - **Multi-provider registry pattern with real-world AI agent examples**
- [Effect Atom IPC Guide](./EFFECT_ATOM_IPC_GUIDE.md) - IPC communication patterns
- [AI Watcher XTerm Progress](./ai-watcher-xterm-progress.md) - Real implementation timeline with issues encountered

## Debugging History

This guide was refined through real-world debugging sessions:

**TerminalPort GenericTag Migration** (2025-01-XX):
- **Problem**: 11 TypeScript errors with "missing Id, Type, [TagTypeId]" when using `class TerminalPort extends Context.Tag`
- **Root Cause**: Name collision between `interface TerminalPort` and `class TerminalPort` - TypeScript resolved type annotations to the class instead of interface
- **Solution**: Migrated to `Context.GenericTag<TerminalPort>('TerminalPort')` pattern (following `ProviderPortFactory` example)
- **Key Insight**: Using `satisfies` or removing type annotations didn't help - the issue was the class/interface name collision itself
- **References**: See src/main/terminal/terminal-port.ts:92, src/main/source-control/ports/secondary/provider-port.ts
- **All 11 terminal-related TypeScript errors fixed** ✅

**Result.matchWithError Wrapper Types** (2025-01-XX):
- **Problem**: Type errors when adding explicit type annotations to `onSuccess` callbacks
- **Root Cause**: `Result.matchWithError.onSuccess` receives `Success<T, E>` wrapper, not unwrapped `T`
- **Solution**: Let TypeScript infer types, access data via `data.value`
- **Key Learning**: Different from `Result.builder.onSuccess` which receives unwrapped `T`
- **References**: src/renderer/components/terminal/TerminalPanel.tsx, src/renderer/components/terminal/XTerminal.tsx

These debugging sessions demonstrated the importance of:
1. Following established codebase patterns (grep for similar code when stuck)
2. Understanding TypeScript's type resolution in the presence of name collisions
3. Letting TypeScript infer complex wrapper types instead of fighting it with annotations
4. Reading Effect library source code when documentation is unclear