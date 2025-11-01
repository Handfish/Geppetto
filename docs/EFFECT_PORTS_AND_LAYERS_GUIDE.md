# Effect Ports and Layers Pattern Guide

A comprehensive guide to implementing hexagonal architecture with Effect-TS, based on real-world implementations in the Geppetto codebase.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Port Definition Patterns](#port-definition-patterns)
3. [Adapter Implementation Patterns](#adapter-implementation-patterns)
4. [Service Implementation Patterns](#service-implementation-patterns)
5. [Type Inference Patterns](#type-inference-patterns)
6. [Common Anti-Patterns](#common-anti-patterns)
7. [Real-World Examples](#real-world-examples)
8. [Migration Guide](#migration-guide)

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

### ✅ CORRECT: Port as Interface + Context Tag

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

// Step 2: Create Context tag for dependency injection
export class TerminalPort extends Context.Tag('TerminalPort')<
  TerminalPort,
  TerminalPort
>() {}
```

**Why this works:**
- Clean separation between interface (contract) and tag (DI mechanism)
- The class extension pattern allows both type and value usage
- Context.Tag creates proper Effect service identification

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

## Real-World Examples

### Example 1: Multi-Provider AI Domain

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

### Example 2: Terminal Domain with Single Adapter

```typescript
// terminal/terminal-port.ts
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  kill: (processId: string) => Effect.Effect<void, TerminalError>
  subscribe: (processId: string) => Stream.Stream<OutputChunk, TerminalError>
}

export class TerminalPort extends Context.Tag('TerminalPort')<
  TerminalPort,
  TerminalPort
>() {}

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

// main/index.ts - Layer composition
const TerminalLayer = Layer.provide(
  Layer.mergeAll(
    TerminalRegistry.Default,
    TerminalService.Default
  ),
  NodePtyTerminalAdapter  // Provides TerminalPort
)
```

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
2. **Adapters implement ports** - Use Layer.effect, not Effect.Service
3. **Services orchestrate** - Use interface constraint pattern for type inference
4. **Share infrastructure** - Memoize via module-level constants
5. **Lazy-load native modules** - Use Effect.sync(() => require(...))
6. **Extract branded types from schemas** - Always use `S.Schema.Type<typeof Schema>` pattern, never manually define branded types
7. **Test with mock adapters** - Easy to swap via Layer.provide

## Related Documentation

- [AI Adapters Hexagonal Architecture](./AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md)
- [Effect Atom IPC Guide](./EFFECT_ATOM_IPC_GUIDE.md)
- [AI Watcher XTerm Progress](./ai-watcher-xterm-progress.md) - Real implementation timeline with issues encountered