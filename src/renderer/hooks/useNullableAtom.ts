/**
 * Nullable Atom Hook Pattern - Demonstration of Limitations
 *
 * This hook shows a working pattern for nullable parameters,
 * BUT demonstrates why it cannot preserve error types for Result.builder.
 */

import { useAtomValue } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import { useMemo } from 'react'
import { Atom } from '@effect-atom/atom'

/**
 * Hook that accepts nullable parameter and returns a Result
 *
 * ✅ What it DOES:
 * - Handles null parameters gracefully
 * - Returns Result.success(null) when param is null
 * - Returns real atom result when param is non-null
 *
 * ❌ What it CANNOT DO:
 * - Preserve error types for Result.builder
 * - Enable .onErrorTag() when param is null
 * - Fake error types (Result.success always has error type 'never')
 *
 * @example
 * ```typescript
 * const result = useNullableAtom(userId, userDataAtom)
 *
 * // When userId is null:
 * //   result = Result.success(null) // Result<T | null, never>
 *
 * // When userId is non-null:
 * //   result = <whatever userDataAtom(userId) returns>
 * ```
 */
export function useNullableAtom<TParam, TValue, TError = never>(
  param: TParam | null,
  atomFamily: (param: NonNullable<TParam>) => Atom.Atom<any>
): ReturnType<typeof Result.success<TValue | null>> | any {
  // Memoize atom based on parameter
  const atom = useMemo(() => {
    if (!param) return null
    return atomFamily(param as NonNullable<TParam>)
  }, [param, atomFamily])

  // Get result from atom if we have one
  const result = useAtomValue(atom ?? Atom.make(() => Result.success(null as TValue | null)))

  return result
}

/**
 * THE FUNDAMENTAL LIMITATION:
 *
 * When param is null, we return Result.success(null), which has type:
 * Result<T | null, never>
 *                 ^^^^^
 *                 Error type is ALWAYS 'never'
 *
 * This means Result.builder will NOT have .onErrorTag() available!
 *
 * You CANNOT create a Result<T, E> with error type E unless the
 * operation can actually fail with that error.
 *
 * This is by design in Effect's type system.
 */

/**
 * Demonstration: What works and what doesn't
 */

// Example usage that shows the limitation:
/*
function MyComponent({ userId }: { userId: string | null }) {
  const userResult = useNullableAtom(userId, userAtom)

  // ❌ DOES NOT WORK - .onErrorTag() not available when userId is null
  return Result.builder(userResult)
    .onErrorTag('NotFoundError', ...)  // Error: Property doesn't exist
    .onSuccess((user) => user ? <View /> : <Empty />)

  // ✅ WORKS - Manual pattern matching
  if (Result.isInitial(userResult)) {
    return <LoadingSpinner />
  }

  if (Result.isFailure(userResult)) {
    // But you lose typed error handling!
    return <ErrorAlert message="Failed to load user" />
  }

  if (Result.isSuccess(userResult)) {
    const user = Result.getOrElse(userResult, () => null)
    return user ? <UserView user={user} /> : <EmptyState />
  }

  // Handle defects
  return <UnexpectedError />
}
*/

/**
 * RECOMMENDED ALTERNATIVE: Early Return Pattern
 *
 * Instead of using this hook, handle null in your component:
 *
 * ```typescript
 * function MyComponent({ userId }: { userId: string | null }) {
 *   // Handle null BEFORE calling hooks
 *   if (!userId) {
 *     return <EmptyState message="No user selected" />
 *   }
 *
 *   // Hook requires non-null - uses real atom
 *   const { userResult } = useUser(userId)
 *
 *   // Result.builder has FULL API
 *   return Result.builder(userResult)
 *     .onInitial(() => <LoadingSpinner />)
 *     .onErrorTag('NotFoundError', (error) => <NotFound />)  // ✅ Works!
 *     .onErrorTag('NetworkError', (error) => <NetworkError />)  // ✅ Works!
 *     .onDefect((defect) => <UnexpectedError defect={defect} />)
 *     .onSuccess((user) => <UserView user={user} />)
 *     .render()
 * }
 * ```
 */
