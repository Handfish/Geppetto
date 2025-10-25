  I've successfully resolved the TypeScript type issues with the AI Watcher IPC handlers. The problem had multiple
  layers:

  Root Causes Identified:

  1. Import Mismatch: The AI Watcher schemas were using import * as S from '@effect/schema/Schema' while the rest of
  the codebase uses import { Schema as S } from 'effect'. This created incompatible schema types.
  2. TypeScript Union Type Limitation: When using the generic setupHandler pattern with ContractInput<K> and
  ContractOutput<K>, TypeScript couldn't properly narrow the union types for the AI Watcher contracts, resulting in
  never types.

  Solutions Implemented:

  1. Fixed the Import: Changed the import in /src/shared/schemas/ai-watchers/index.ts to use import { Schema as S }
  from 'effect' for consistency.
  2. Individual Handler Pattern: Instead of using the generic setupHandler function, I implemented individual handlers
   for each AI Watcher IPC contract. This avoids the union type inference problem entirely.

  Key Takeaways:

  - The generic IPC handler pattern works well for most contracts but can fail with complex Schema.Class types in
  union contexts
  - When TypeScript's type inference fails with generic patterns, explicit individual handlers provide a reliable
  fallback
  - Consistent imports across the codebase are crucial for schema compatibility
  - The as unknown as Schema type assertion pattern documented in CLAUDE.md is correct but sometimes the simpler
  individual handler approach is more maintainable

  The AI Watcher handlers now compile without any TypeScript errors and maintain full type safety through Effect
  Schema validation at runtime.




---------
  2. TypeScript Union Type Limitation: When using the generic setupHandler pattern with ContractInput<K> and
  ContractOutput<K>, TypeScript couldn't properly narrow the union types for the AI Watcher contracts, resulting in
  never types.

