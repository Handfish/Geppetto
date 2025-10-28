/**
 * Minimal Example: useNullableAtom Hook
 *
 * This demonstrates:
 * ✅ What the hook CAN do
 * ❌ What it CANNOT do (error paths and defects)
 */

import { Result } from "@effect-atom/atom-react";
import { Atom } from "@effect-atom/atom";
import { useNullableAtom } from "../../hooks/useNullableAtom";

// ============================================================================
// Setup: Mock atom and types for demonstration
// ============================================================================

interface UserData {
  id: string;
  name: string;
  email: string;
}

type UserErrors =
  | { _tag: "NotFoundError"; message: string }
  | { _tag: "NetworkError"; message: string };

// Mock atom that can fail with errors
const userDataAtom = Atom.family((userId: string) =>
  Atom.make(() => {
    // Simulate real atom that can fail
    if (userId === "error") {
      return Result.fail({
        _tag: "NotFoundError" as const,
        message: "User not found",
      });
    }
    return Result.success({
      id: userId,
      name: "John Doe",
      email: "john@example.com",
    } as UserData);
  }),
);

// ============================================================================
// Example 1: Using the hook - Shows what DOESN'T work
// ============================================================================

interface Example1Props {
  userId: string | null;
}

export function Example1_DoesNotWork({ userId }: Example1Props) {
  const userResult = useNullableAtom<string, UserData, UserErrors>(
    userId,
    userDataAtom,
  );

  // ❌ THIS DOES NOT WORK - Result.builder doesn't have .onErrorTag()
  // The hook returns Result<UserData | null, never> when userId is null
  // Even though the real atom can fail, the type system sees 'never'

  // Uncommenting this would cause TypeScript errors:
  /*
  return Result.builder(userResult)
    .onInitial(() => <div>Loading...</div>)
    .onErrorTag('NotFoundError', (error) => <div>Not found</div>)  // ❌ Error!
    .onErrorTag('NetworkError', (error) => <div>Network error</div>)  // ❌ Error!
    .onSuccess((user) => user ? <div>{user.name}</div> : <div>No user</div>)
    .render()
  */

  // You'd get: Property 'onErrorTag' does not exist on type 'Builder<...>'
  return <div>See commented code above</div>;
}

// ============================================================================
// Example 2: Manual pattern matching - Works but loses type safety
// ============================================================================

export function Example2_ManualMatching({ userId }: Example1Props) {
  const userResult = useNullableAtom<string, UserData>(userId, userDataAtom);

  // ✅ This WORKS but you lose typed error handling
  if (Result.isInitial(userResult)) {
    return <div className="p-4">Loading...</div>;
  }

  if (Result.isFailure(userResult)) {
    // ❌ Can't access specific error tags easily
    // Would need to manually check error._tag
    return <div className="p-4 text-red-400">Failed to load user</div>;
  }

  if (Result.isSuccess(userResult)) {
    const user = Result.getOrElse(userResult, () => null) as UserData | null;

    if (!user) {
      return <div className="p-4 text-gray-400">No user selected</div>;
    }

    return (
      <div className="p-4">
        <h3 className="font-semibold text-white">{user.name}</h3>
        <p className="text-sm text-gray-400">{user.email}</p>
      </div>
    );
  }

  // Handle defects (unexpected errors)
  return <div className="p-4 text-red-500">Unexpected error occurred</div>;
}

// ============================================================================
// Example 3: RECOMMENDED - Early Return Pattern
// ============================================================================

export function Example3_EarlyReturn({ userId }: Example1Props) {
  // Handle null BEFORE using atoms - this is the key!
  if (!userId) {
    return (
      <div className="p-4 text-gray-400">
        No user selected. Please select a user to view details.
      </div>
    );
  }

  // Now userId is guaranteed non-null - use real atom directly
  // For this demo, we'll just show the pattern without actual atom usage
  // In real code: const userResult = useAtomValue(userDataAtom(userId))

  // ✅ Result.builder would have FULL API - all error handlers available!
  // For this example, just show the success case
  return (
    <div className="p-4 space-y-2">
      <h3 className="text-lg font-semibold text-white">User View</h3>
      <p className="text-sm text-gray-400">
        With early return pattern, Result.builder has full API:
      </p>
      <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
        <li>.onInitial() - handles loading state</li>
        <li>.onErrorTag('NotFoundError') - handles not found errors</li>
        <li>.onErrorTag('NetworkError') - handles network errors</li>
        <li>.onDefect() - handles unexpected errors</li>
        <li>.onSuccess() - handles success with typed data</li>
      </ul>
    </div>
  );
}

/*
// This is what Example 3 would look like with real atom usage:

export function Example3_WithRealAtom({ userId }: Example1Props) {
  if (!userId) {
    return <div className="p-4 text-gray-400">No user selected</div>
  }

  const userResult = useAtomValue(userDataAtom(userId))

  return Result.builder(userResult)
    .onInitial(() => (
      <div className="p-4">
        <div className="animate-pulse">Loading user...</div>
      </div>
    ))
    .onErrorTag('NotFoundError', (error) => (
      <div className="p-4 text-red-400">
        <p className="font-semibold">User Not Found</p>
        <p className="text-sm">{error.message}</p>
      </div>
    ))
    .onErrorTag('NetworkError', (error) => (
      <div className="p-4 text-red-400">
        <p className="font-semibold">Network Error</p>
        <p className="text-sm">{error.message}</p>
      </div>
    ))
    .onDefect((defect: unknown) => (
      <div className="p-4 text-red-500">
        <p className="font-semibold">Unexpected Error</p>
        <p className="text-sm">{String(defect)}</p>
      </div>
    ))
    .onSuccess((user: UserData) => (
      <div className="p-4 space-y-2">
        <h3 className="text-lg font-semibold text-white">{user.name}</h3>
        <p className="text-sm text-gray-400">{user.email}</p>
        <p className="text-xs text-gray-500">ID: {user.id}</p>
      </div>
    ))
    .render()
}
*/

// ============================================================================
// Summary Table
// ============================================================================

/*
┌──────────────────────────────────────────────────────────────────────────┐
│ Approach              │ Error Paths │ Defects │ Type Safety │ Recommended│
├──────────────────────────────────────────────────────────────────────────┤
│ useNullableAtom       │ ❌ No       │ ❌ No   │ ❌ Lost     │ ❌ No      │
│ (Example 1)           │             │         │             │            │
├──────────────────────────────────────────────────────────────────────────┤
│ Manual Matching       │ ⚠️ Partial  │ ✅ Yes  │ ⚠️ Partial  │ ❌ No      │
│ (Example 2)           │             │         │             │            │
├──────────────────────────────────────────────────────────────────────────┤
│ Early Return Pattern  │ ✅ Full     │ ✅ Yes  │ ✅ Full     │ ✅ YES     │
│ (Example 3)           │             │         │             │            │
└──────────────────────────────────────────────────────────────────────────┘

KEY TAKEAWAY:
The useNullableAtom hook CANNOT handle error paths and defects with type safety.
The early return pattern is the only approach that gives you full Result.builder
API with typed error handlers and defect handling.
*/
