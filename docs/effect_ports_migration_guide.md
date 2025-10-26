# 🧭 Migration Guide: Effectful Ports in Effect-TS

**Date:** 2025-10-26

---

## Overview

This guide is for developers or agents tasked with migrating an existing Effect-TS codebase from a manually implemented “Ports & Adapters” architecture (using TypeScript interfaces) to a fully **Effectful Port** design powered by `Effect.Service`, `Layer`, and `Context.Reference`.

This migration improves composability, testability, and dynamic service swapping while reducing boilerplate and dependency leaks.

---

## 🎯 Migration Goals

1. Replace `interface`-based ports with `Effect.Service` definitions.
2. Convert live adapters to `Layer.succeed` or `Layer.effect` implementations.
3. Refactor dependent services to yield dependencies via `yield* Tag`.
4. Replace global layer merges with dependency-based co-location.
5. Introduce `Layer.override` for testing and `Context.Reference` for runtime flexibility.

---

## 1️⃣ Before: Interface-Based Ports

```ts
export interface GitCommandRunnerPort {
  execute(
    request: GitCommandRequest
  ): Effect.Effect<GitCommandExecutionHandle, GitCommandDomainError, Scope.Scope>;
}

export class GitCommandService extends Effect.Service<GitCommandService>()(
  'GitCommandService',
  {
    dependencies: [NodeGitCommandRunner.Default],
    effect: Effect.gen(function* () {
      const runner = yield* NodeGitCommandRunner;

      const runToCompletion = (request: GitCommandRequest) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* runner.execute(request);
            return yield* handle.awaitResult;
          })
        );

      return { runToCompletion };
    }),
  }
) {}
```

Issues:
- Ports are plain TS interfaces.
- No memoization or lifecycle control.
- Dependency graphs must be rebuilt manually.

---

## 2️⃣ After: Effectful Port Definition

```ts
export class GitCommandRunner extends Effect.Service<GitCommandRunner>()(
  "GitCommandRunner",
  {
    effect: Effect.gen(function* () {
      return {
        execute: (
          request: GitCommandRequest
        ): Effect.Effect<GitCommandExecutionHandle, GitCommandDomainError, Scope.Scope> =>
          Effect.fail(new Error("unimplemented")),
      };
    }),
  }
) {}
```

✅ The service itself defines the tag, default layer, and inferred shape.

---

## 3️⃣ Implementing Adapters

```ts
export const NodeGitCommandRunner = Layer.succeed(
  GitCommandRunner,
  GitCommandRunner.make({
    execute: (request) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawnGitProcess(request);
          return handle;
        })
      ),
  })
);
```

---

## 4️⃣ Updating Dependent Services

```ts
export class GitCommandService extends Effect.Service<GitCommandService>()(
  "GitCommandService",
  {
    dependencies: [GitCommandRunner.Default],
    effect: Effect.gen(function* () {
      const runner = yield* GitCommandRunner;

      const runToCompletion = (request: GitCommandRequest) =>
        Effect.scoped(
          Effect.gen(function* () {
            const execution = yield* runner.execute(request);
            return yield* execution.awaitResult;
          })
        );

      return { runToCompletion };
    }),
  }
) {}
```

---

## 5️⃣ Swapping Ports (Mocks / Tests)

```ts
const MockGitCommandRunner = Layer.succeed(
  GitCommandRunner,
  GitCommandRunner.make({
    execute: (request) =>
      Effect.succeed({
        request,
        events: Stream.fromIterable([]),
        awaitResult: Effect.succeed({ result: "ok" }),
        terminate: Effect.succeed(undefined),
      }),
  })
);

Effect.runPromise(
  Effect.provideLayer(GitCommandService.Default.pipe(Layer.provide(MockGitCommandRunner)))
);
```

---

## 6️⃣ Composing the Application Layer

```ts
const CoreAdapters = Layer.mergeAll(
  NodeFileSystemAdapter.Default,
  NodeGitCommandRunner
);

const DomainServices = Layer.mergeAll(
  GitCommandService.Default,
  CommitGraphService.Default,
  RepositoryService.Default
);

const ApplicationLayer = Layer.mergeAll(CoreAdapters, DomainServices);
```

---

## 7️⃣ Runtime Hot-Swapping (Optional)

```ts
const CurrentRunner = Context.Reference<GitCommandRunner>()("CurrentRunner", {
  defaultValue: () => GitCommandRunner.Default,
});

const swapToMock = (mock: Layer.Layer<any, any, any>) =>
  CurrentRunner.set(mock);
```

---

## ✅ Migration Checklist

| Step | Action | Result |
|------|--------|--------|
| 1 | Replace `interface` ports with `Effect.Service` | Unified service definition |
| 2 | Convert “live” implementations to `Layer` | Enables memoization |
| 3 | Use `yield* Tag` to access dependencies | Type-safe injection |
| 4 | Use local dependency provision | Simplified composition |
| 5 | Use `Layer.override` for testing | Swappable ports |
| 6 | Use `Context.Reference` for runtime flexibility | Dynamic swapping |

---

## 🔮 End State

```ts
const AppLive = Layer.mergeAll(
  GitCommandRunner.Default,
  GitCommandService.Default,
  CommitGraphService.Default,
  WorkspaceService.Default,
);

Effect.runPromise(Effect.provideLayer(AppLive));
```

---

## 💡 Key Takeaways

- Each port becomes a **first-class Effect Service**.
- Adapters are defined as **Layers**.
- Dependency injection is **type-safe and composable**.
- Lifecycle and memoization are **automatic**.
- Tests and runtime overrides are **trivial**.

---

**Author:** Internal Migration Agent  
**Purpose:** Transition Effect-TS codebase to Effectful Ports model  
**Version:** v1.0  
