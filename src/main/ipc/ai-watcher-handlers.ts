import * as Effect from 'effect/Effect'
import * as S from '@effect/schema/Schema'
import { ipcMain } from 'electron'
import { AiWatcherIpcContracts } from '../../shared/ipc-contracts'
import { AiWatcherService } from '../ai-watchers/ai-watcher-service'
import { TmuxSessionManager } from '../ai-watchers/tmux-session-manager'
import { mapDomainErrorToIpcError } from './error-mapper'

/**
 * Setup AI Watcher IPC handlers with type-safe pattern from CLAUDE.md
 *
 * CRITICAL: This follows the required type-safe pattern for IPC handlers.
 * DO NOT use `unknown` or `any` types - use proper type definitions.
 */
export const setupAiWatcherIpcHandlers = Effect.gen(function* () {
  const aiWatcherService = yield* AiWatcherService
  const tmuxManager = yield* TmuxSessionManager

  // Extract types from contracts using Schema.Type
  type ContractInput<K extends keyof typeof AiWatcherIpcContracts> = S.Schema.Type<
    (typeof AiWatcherIpcContracts)[K]['input']
  >
  type ContractOutput<K extends keyof typeof AiWatcherIpcContracts> = S.Schema.Type<
    (typeof AiWatcherIpcContracts)[K]['output']
  >

  /**
   * Setup a typed IPC handler for a specific contract
   *
   * This function preserves full type safety:
   * 1. Decodes input from wire format to app type
   * 2. Executes handler with properly typed input
   * 3. Encodes output from app type to wire format
   * 4. Maps domain errors to IPC errors
   */
  const setupHandler = <K extends keyof typeof AiWatcherIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = AiWatcherIpcContracts[key]

    // Define dual-type schemas preserving both decoded and encoded types
    // This is REQUIRED - see CLAUDE.md for explanation
    type InputSchema = S.Schema<
      ContractInput<K>,
      S.Schema.Encoded<(typeof AiWatcherIpcContracts)[K]['input']>
    >
    type OutputSchema = S.Schema<
      ContractOutput<K>,
      S.Schema.Encoded<(typeof AiWatcherIpcContracts)[K]['output']>
    >

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        // Decode: validates and transforms from encoded (wire format) to decoded (app type)
        const validatedInput = yield* S.decodeUnknown(
          contract.input as unknown as InputSchema
        )(input)

        // Execute handler - validatedInput is now properly typed as ContractInput<K>
        const result = yield* handler(validatedInput)

        // Encode: transforms from decoded type to encoded (serializable) type for IPC
        const encoded = yield* S.encode(contract.output as unknown as OutputSchema)(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    })
  }

  // Register all AI Watcher IPC handlers

  setupHandler('createWatcher', (input) =>
    aiWatcherService.create({
      type: input.type,
      name: input.name,
      workingDirectory: input.workingDirectory,
      env: input.env,
      command: input.command,
      args: input.args,
    })
  )

  setupHandler('attachToTmuxSession', (input) =>
    Effect.gen(function* () {
      const handle = yield* tmuxManager.attachToSession(input.sessionName)

      return yield* aiWatcherService.create({
        type: 'custom',
        name: `tmux:${input.sessionName}`,
        workingDirectory: '/tmp', // Default, will be overridden by actual process
        processHandle: handle,
      })
    })
  )

  setupHandler('listWatchers', () => aiWatcherService.listAll())

  setupHandler('getWatcher', (input) => aiWatcherService.get(input.watcherId))

  setupHandler('stopWatcher', (input) =>
    Effect.gen(function* () {
      const watcher = yield* aiWatcherService.get(input.watcherId)
      return yield* aiWatcherService.stop(watcher)
    })
  )

  setupHandler('startWatcher', (input) =>
    Effect.gen(function* () {
      const watcher = yield* aiWatcherService.get(input.watcherId)
      return yield* aiWatcherService.start(watcher)
    })
  )

  setupHandler('getWatcherLogs', (input) =>
    aiWatcherService.getLogs(input.watcherId, input.limit)
  )

  setupHandler('listTmuxSessions', () => tmuxManager.listSessions())
})
