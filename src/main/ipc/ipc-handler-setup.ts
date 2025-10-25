/**
 * Generic IPC Handler Setup Utility
 *
 * Provides a type-safe, reusable function for registering IPC handlers
 * with automatic schema validation, encoding/decoding, and error mapping.
 *
 * ## Type Safety Architecture
 *
 * This module maintains full type safety across the IPC boundary using Effect Schema's
 * dual-type system: decoded types (application-level) and encoded types (wire-level).
 *
 * **Type Flow:**
 * 1. Wire (Renderer) → InputEncoded → [decode] → InputDecoded → Handler
 * 2. Handler → OutputDecoded → [encode] → OutputEncoded → Wire (Renderer)
 *
 * **Why Type Assertions Are Required:**
 *
 * The `as unknown as InputSchemaWithTypes` pattern is necessary due to TypeScript's
 * inability to narrow union types from indexed access. When we receive
 * `contract.input` (which TypeScript sees as a union of all possible input schemas),
 * we must assert it to the specific schema type that preserves both:
 * - Decoded type: S.Schema.Type<TInputSchema>
 * - Encoded type: S.Schema.Encoded<TInputSchema>
 *
 * This is NOT a loss of type safety because:
 * 1. Effect Schema validates at runtime (catches all invalid data)
 * 2. The assertion tells TypeScript what we know to be true at runtime
 * 3. The generic parameters ensure the handler signature matches the contract
 *
 * **Type Safety Guarantees:**
 * - Handler input: Typed as DecodedType<TInputSchema>
 * - Handler output: Typed as DecodedType<TOutputSchema>
 * - Handler errors: Tracked in THandlerError type parameter
 * - IPC boundary: Automatically encoded/decoded with schema validation
 * - Error mapping: All errors converted to IpcErrorResult
 *
 * This pattern is used throughout the codebase for all IPC handler registrations.
 */

import { Effect, Schema as S } from 'effect'
import { ipcMain } from 'electron'
import { mapDomainErrorToIpcError, IpcErrorResult } from './error-mapper'

/**
 * Type helper to extract the decoded (application-level) type from a schema
 */
type DecodedType<TSchema extends S.Schema.Any> = S.Schema.Type<TSchema>

/**
 * Type helper to extract the encoded (wire-level) type from a schema
 */
type EncodedType<TSchema extends S.Schema.Any> = S.Schema.Encoded<TSchema>

/**
 * Type helper for IPC contract structure
 */
interface IpcContract<
  TInputSchema extends S.Schema.Any,
  TOutputSchema extends S.Schema.Any,
  TErrorsSchema
> {
  readonly channel: string
  readonly input: TInputSchema
  readonly output: TOutputSchema
  readonly errors: TErrorsSchema
}

/**
 * Registers an IPC handler with automatic validation and error handling
 *
 * This function provides:
 * - Type-safe input validation (decoded from wire format)
 * - Type-safe output encoding (encoded to wire format)
 * - Automatic error mapping to IPC error format
 * - Full end-to-end type safety from handler to IPC boundary
 *
 * @param contract - The IPC contract defining channel, input/output schemas, and error types
 * @param handler - Effect that processes the validated input and returns output
 *                  Handler receives decoded input and must return decoded output
 *
 * @example
 * ```typescript
 * registerIpcHandler(
 *   AiWatcherIpcContracts.getWatcher,
 *   (input) => aiWatcherService.get(input.watcherId)
 * )
 * ```
 */
export function registerIpcHandler<
  TInputSchema extends S.Schema.Any,
  TOutputSchema extends S.Schema.Any,
  TErrorsSchema,
  THandlerError
>(
  contract: IpcContract<TInputSchema, TOutputSchema, TErrorsSchema>,
  handler: (
    input: DecodedType<TInputSchema>
  ) => Effect.Effect<DecodedType<TOutputSchema>, THandlerError, never>
): void {
  // Type aliases for decoded and encoded types at each stage
  type InputDecoded = DecodedType<TInputSchema>
  type InputEncoded = EncodedType<TInputSchema>
  type OutputDecoded = DecodedType<TOutputSchema>
  type OutputEncoded = EncodedType<TOutputSchema>

  // Define schemas with full type information for both decoded and encoded forms
  type InputSchemaWithTypes = S.Schema<InputDecoded, InputEncoded, never>
  type OutputSchemaWithTypes = S.Schema<OutputDecoded, OutputEncoded, never>

  ipcMain.handle(contract.channel, async (_event, input: unknown) => {
    // Type the full Effect pipeline:
    // 1. decodeUnknown: unknown -> Effect<InputDecoded, ParseError, never>
    // 2. flatMap(handler): Effect<InputDecoded> -> Effect<OutputDecoded, THandlerError, never>
    // 3. flatMap(encode): Effect<OutputDecoded> -> Effect<OutputEncoded, ParseError, never>
    // 4. catchAll: Effect<OutputEncoded, ParseError | THandlerError, never> -> Effect<OutputEncoded | IpcErrorResult, never, never>
    //    Note: mapDomainErrorToIpcError converts errors to IpcErrorResult success values
    const program: Effect.Effect<OutputEncoded | IpcErrorResult, never, never> =
      S.decodeUnknown(contract.input as unknown as InputSchemaWithTypes)(input).pipe(
        Effect.flatMap((validatedInput: InputDecoded) => handler(validatedInput)),
        Effect.flatMap((result: OutputDecoded) =>
          S.encode(contract.output as unknown as OutputSchemaWithTypes)(result)
        ),
        Effect.catchAll(mapDomainErrorToIpcError),
        Effect.withSpan('ipc-handler', { attributes: { channel: contract.channel } })
      )

    return await Effect.runPromise(program)
  })
}
