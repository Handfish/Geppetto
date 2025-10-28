# Result Error Handling Patterns

Best practices for handling errors from @effect-atom/atom-react Results with full type safety.

## Pattern 1: Side Effects with `Result.matchWithError` ✅ RECOMMENDED

**Use Case**: When you need to perform side effects (like setting state) based on specific error types in useEffect or event handlers.

**Why**: Provides direct, type-safe access to the error without needing to unwrap Option. TypeScript correctly narrows the error type.

```typescript
import { Result } from '@effect-atom/atom-react'

type MyError =
  | AuthenticationError
  | NetworkError
  | ValidationError

React.useEffect(() => {
  if (result.waiting) return

  Result.matchWithError(result, {
    onInitial: () => {
      // Handle initial state
    },
    onError: (error: MyError) => {
      // TypeScript knows the exact error union type here!
      if (error._tag === 'AuthenticationError') {
        // error is now narrowed to AuthenticationError
        setErrorMessage(error.message)
      } else if (error._tag === 'ValidationError') {
        // error is now narrowed to ValidationError
        setFieldErrors(error.fields)
      }
    },
    onDefect: (defect: unknown) => {
      // Handle unexpected errors
      console.error('Unexpected error:', defect)
    },
    onSuccess: (data) => {
      // Handle success
      setData(data)
    },
  })
}, [result])
```

**Benefits**:
- ✅ Direct error access without Option unwrapping
- ✅ Full TypeScript type narrowing with error._tag checks
- ✅ Separates expected errors (onError) from unexpected errors (onDefect)
- ✅ Clean, declarative pattern
- ✅ No type assertions needed

## Pattern 2: UI Rendering with `Result.builder` ✅ RECOMMENDED

**Use Case**: When rendering different UI based on Result state.

**Why**: Exhaustive error handling with builder pattern ensures all error cases are handled.

```typescript
import { Result } from '@effect-atom/atom-react'
import type { NetworkError, NotFoundError } from '../../shared/schemas/errors'

type MyError = NetworkError | NotFoundError

function MyComponent() {
  const dataResult = useAtomValue(myAtom)

  return (
    <div>
      {Result.builder(dataResult)
        .onInitial(() => (
          <LoadingSpinner />
        ))
        .onErrorTag('NetworkError', (error: NetworkError) => (
          <ErrorAlert
            message={error.message}
            action={<RetryButton />}
          />
        ))
        .onErrorTag('NotFoundError', (error: NotFoundError) => (
          <ErrorAlert message={error.message} />
        ))
        .onDefect((defect: unknown) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((data) => (
          <DataDisplay data={data} />
        ))
        .render()}
    </div>
  )
}
```

**Benefits**:
- ✅ Type-safe error tag matching with `.onErrorTag()`
- ✅ Exhaustive error handling - TypeScript ensures all error tags are handled
- ✅ Clean separation of error types in UI
- ✅ Explicit type annotations for clarity

## Pattern 3: Manual Error Extraction with `Result.error()` (Less Common)

**Use Case**: When you need fine-grained control over error extraction.

**Why**: Sometimes you need to extract just the error without matching all states.

```typescript
import { Result } from '@effect-atom/atom-react'
import { Option } from 'effect'

type MyError = AuthenticationError | NetworkError

const errorOption = Result.error(result)

if (Option.isSome(errorOption)) {
  const error = errorOption.value as MyError

  if (error._tag === 'AuthenticationError') {
    // Handle auth error
  }
}
```

**Note**: This pattern requires a type assertion (`as MyError`) and is more verbose. **Prefer Pattern 1 or Pattern 2 instead.**

## Pattern 4: Simple Success/Failure Check

**Use Case**: When you only care about success vs failure, not specific error types.

```typescript
import { Result } from '@effect-atom/atom-react'

if (Result.isSuccess(result)) {
  const data = result.value
  // Use data
}

if (Result.isFailure(result)) {
  // Generic error handling
  showErrorToast('Operation failed')
}
```

## Anti-Patterns to Avoid ❌

### ❌ Using `as any` or unsafe type casts
```typescript
// BAD: Type safety lost
const error = (result as any).error
```

### ❌ Manual Result.match with type assertions
```typescript
// BAD: Verbose and requires manual type assertion
const error = Result.match(result, {
  onSuccess: () => null,
  onFailure: (data) => (data as unknown as { error: any }).error,
  onInitial: () => null,
})
```

**Use Pattern 1 (Result.matchWithError) instead!**

### ❌ Forgetting to handle all states
```typescript
// BAD: Only handling error, forgetting Initial state
Result.matchWithError(result, {
  onError: (error) => { ... },
  onSuccess: (data) => { ... },
  // Missing onInitial!
  // Missing onDefect!
})
```

## Type Definitions

Always define your error union types for clarity:

```typescript
// Define error unions at the component level
type SignInError =
  | AuthenticationError
  | NetworkError
  | ProviderUnavailableError

type UsageError =
  | AuthenticationError
  | NetworkError
  | UsageUnavailableError
```

Then use these types in your error handlers:

```typescript
onError: (error: SignInError) => {
  // TypeScript knows exact error types
  if (error._tag === 'AuthenticationError') {
    // Correctly narrowed
  }
}
```

## Summary

1. **Side effects in useEffect**: Use `Result.matchWithError()` with explicit error type
2. **UI rendering**: Use `Result.builder()` with `.onErrorTag()`
3. **Type annotations**: Always annotate error parameters for proper TypeScript narrowing
4. **Avoid**: Manual Result.match with type assertions, `as any`, skipping onDefect/onInitial

These patterns ensure full type safety while maintaining clean, readable code.
