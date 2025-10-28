**# Conditional Atoms: Why They Don't Work (And Why That's Good)**

## Investigation Summary

We explored creating a "conditional atoms" pattern to handle nullable parameters while preserving error types for `Result.builder`. After extensive testing, we discovered that **this pattern is fundamentally incompatible with Effect's type system by design** - and this is actually a good thing that prevents logical errors.

## The Goal

Create a pattern where you can use atoms with nullable parameters and still get full `Result.builder` API:

```typescript
// What we wanted to achieve:
const dataResult = useAtomValue(selectDataAtom(id))  // id can be null

return Result.builder(dataResult)
  .onErrorTag('NotFoundError', ...)  // ✅ We wanted this to work
  .onErrorTag('NetworkError', ...)   // ✅ And this
  .onSuccess(...)
```

## What We Tried

### Approach 1: Type Casting

```typescript
type ResultType<T, E> = /* inferred type */ & { error?: E }

const emptyAtom = Atom.make(() =>
  Result.success(null) as unknown as ResultType<Data | null, MyErrors>
)

const selectAtom = (id: string | null) =>
  id ? realAtom(id) : emptyAtom
```

**Result:** TypeScript accepts it, but Result.builder still sees `Builder<never, T, never, never>` - no error types!

### Approach 2: Effect.gen with Conditional Failures

```typescript
const emptyAtom = sourceControlRuntime.atom(
  Effect.gen(function* () {
    if (Math.random() < 0) yield* Effect.fail(NotFoundError)  // Never executes
    if (Math.random() < 0) yield* Effect.fail(NetworkError)   // Never executes
    return null
  })
)
```

**Result:** Overly complex, and Effect optimizes away unreachable error branches.

### Approach 3: Custom Hook Wrapper

```typescript
function useNullableAtom<T, E>(param: string | null, atomFamily) {
  if (!param) return Result.success(null)  // Returns Result<T, never>
  return useAtomValue(atomFamily(param))
}
```

**Result:** Same problem - `Result.success()` always has error type `never`.

## Why It Doesn't Work

### The Fundamental Issue

**You cannot create a `Result<T, E>` with error type `E` unless the operation can actually fail with that error.**

This is by design in Effect:
- `Result.success(value)` → `Result<T, never>` (cannot fail)
- `Effect.succeed(value)` → `Effect<T, never>` (cannot fail)
- Only `Effect.gen` with potential `Effect.fail` can have error types

### Result.builder Type Inspection

`Result.builder` inspects the **actual error types** at compile time. Type assertions don't fool it:

```typescript
const fake = Result.success(null) as Result<Data, NetworkError>
// TypeScript: Result<Data, NetworkError> ✓
// Result.builder: Builder<never, Data, never, never> ✗
```

The builder sees through the cast and finds the real type: `never`.

## Why This Is Actually Good

This "limitation" is actually **correct type system design** that prevents logical errors:

```typescript
// ❌ BAD (what we were trying to do):
// Claim an operation can fail with NetworkError when it literally cannot
const emptyAtom = Result.success(null) as Result<Data, NetworkError>

// Result.builder would let us handle an error that can never occur!
Result.builder(result)
  .onErrorTag('NetworkError', (error) => {
    // This callback can NEVER execute - logical error!
  })
```

**Effect's type system correctly prevents this.** If you claim an operation can fail with certain errors, those errors must be possible in the actual implementation.

## The Right Pattern: Early Return

Instead of fighting the type system, embrace it:

```typescript
// ✅ CORRECT - Handle null before using atoms
function DataView({ id }: { id: string | null }) {
  // Early return for invalid input
  if (!id) {
    return <EmptyState message="No selection" />
  }

  // Now id is guaranteed non-null - use real atom
  const { dataResult } = useData(id)

  // Result.builder has full API because atom CAN fail with these errors
  return Result.builder(dataResult)
    .onErrorTag('NotFoundError', (error) => <NotFound />)
    .onErrorTag('NetworkError', (error) => <NetworkError />)
    .onSuccess((data) => <DataDisplay data={data} />)
    .render()
}

// Hook requires non-null parameter - enforces early return in components
export function useData(id: string) {
  const dataResult = useAtomValue(dataAtom(id))
  // ...
  return { dataResult }
}
```

## Pattern Comparison

| Pattern | Type Safe | Logical Correctness | DX | AI Understanding |
|---------|-----------|---------------------|-----|------------------|
| Conditional Atoms | ❌ Can't achieve | ❌ Claims impossible errors | ⚠️ Complex | ❌ Confusing |
| Early Return | ✅ Full | ✅ Accurate error types | ✅ Simple | ✅ Clear |

## Key Learnings

1. **Type casts don't affect Result.builder** - It inspects actual types, not assertions
2. **Error types must be possible** - You can't claim an operation fails with errors it can't produce
3. **Effect enforces logical correctness** - The type system prevents misleading error handling
4. **Early return is not a workaround** - It's the correct design pattern
5. **The type system is helping you** - It prevents bugs by ensuring error handlers match reality

## Recommendations

### For Components

✅ **Use early return pattern**
```typescript
function MyComponent({ id }: { id: string | null }) {
  if (!id) return <EmptyState />

  const { dataResult } = useMyData(id)
  return Result.builder(dataResult)...
}
```

### For Hooks

✅ **Require non-null parameters**
```typescript
/**
 * @param id - Must be non-null. Components should handle null with early returns.
 */
export function useMyData(id: string) {
  return useAtomValue(myDataAtom(id))
}
```

### For Documentation

✅ **Document the pattern**
```typescript
/**
 * IMPORTANT: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
```

## Conclusion

After exploring multiple approaches to conditional atoms, we discovered that:

1. **It's technically impossible** to fake error types in Results
2. **This is by design** to prevent logical errors
3. **The early return pattern is the correct solution** - not a workaround
4. **The type system is protecting you** from claiming operations can fail in ways they can't

**The early return pattern should be documented as the official approach**, and attempts to create conditional atoms should be understood as fighting against correct type system design.

---

**For AI assistants and developers:** When you see nullable parameters with atoms:
1. Handle null with early return in the component
2. Design hooks to require non-null parameters
3. Use JSDoc to document the requirement
4. Don't try to fake error types - embrace the type system's correctness
