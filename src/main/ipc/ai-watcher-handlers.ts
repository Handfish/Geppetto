/**
 * AI Watcher IPC Handlers
 *
 * Handles IPC communication for AI watcher management.
 *
 * Note: This file uses individual handlers instead of the generic setupHandler pattern
 * due to TypeScript's inability to properly infer types from the union of AI Watcher contracts.
 * This is a known limitation when working with complex Schema.Class types in union contexts.
 */

import { Effect, Schema as S } from 'effect'
import { ipcMain } from 'electron'
import { AiWatcherIpcContracts } from '../../shared/ipc-contracts'
import { AiWatcherService } from '../ai-watchers/ai-watcher-service'
import { TmuxSessionManager } from '../ai-watchers/tmux-session-manager'
import { mapDomainErrorToIpcError } from './error-mapper'

/**
 * Setup AI Watcher IPC handlers
 */
export const setupAiWatcherIpcHandlers = Effect.gen(function* () {
  const aiWatcherService = yield* AiWatcherService
  const tmuxManager = yield* TmuxSessionManager

  // createWatcher handler
  ipcMain.handle(
    AiWatcherIpcContracts.createWatcher.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          AiWatcherIpcContracts.createWatcher.input
        )(input)

        const result = yield* aiWatcherService.create({
          type: validatedInput.type,
          name: validatedInput.name,
          workingDirectory: validatedInput.workingDirectory,
          env: validatedInput.env,
          command: validatedInput.command,
          args: validatedInput.args,
        })

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.createWatcher.output
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )

  // attachToTmuxSession handler
  ipcMain.handle(
    AiWatcherIpcContracts.attachToTmuxSession.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          AiWatcherIpcContracts.attachToTmuxSession.input
        )(input)

        const handle = yield* tmuxManager.attachToSession(
          validatedInput.sessionName
        )
        const result = yield* aiWatcherService.create({
          type: 'custom',
          name: `tmux:${validatedInput.sessionName}`,
          workingDirectory: '/tmp',
          processHandle: handle,
        })

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.attachToTmuxSession.output
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )

  // listWatchers handler
  ipcMain.handle(
    AiWatcherIpcContracts.listWatchers.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        yield* S.decodeUnknown(AiWatcherIpcContracts.listWatchers.input)(input)

        const result = yield* aiWatcherService.listAll()

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.listWatchers.output
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )

  // getWatcher handler
  ipcMain.handle(
    AiWatcherIpcContracts.getWatcher.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          AiWatcherIpcContracts.getWatcher.input
        )(input)

        const result = yield* aiWatcherService.get(validatedInput.watcherId)

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.getWatcher.output
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )

  // stopWatcher handler
  ipcMain.handle(
    AiWatcherIpcContracts.stopWatcher.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          AiWatcherIpcContracts.stopWatcher.input
        )(input)

        const watcher = yield* aiWatcherService.get(validatedInput.watcherId)
        yield* aiWatcherService.stop(watcher)

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.stopWatcher.output
        )(undefined)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )

  // startWatcher handler
  ipcMain.handle(
    AiWatcherIpcContracts.startWatcher.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          AiWatcherIpcContracts.startWatcher.input
        )(input)

        const watcher = yield* aiWatcherService.get(validatedInput.watcherId)
        yield* aiWatcherService.start(watcher)

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.startWatcher.output
        )(undefined)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )

  // getWatcherLogs handler
  ipcMain.handle(
    AiWatcherIpcContracts.getWatcherLogs.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          AiWatcherIpcContracts.getWatcherLogs.input
        )(input)

        const result = yield* aiWatcherService.getLogs(
          validatedInput.watcherId,
          validatedInput.limit
        )

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.getWatcherLogs.output
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )

  // listTmuxSessions handler
  ipcMain.handle(
    AiWatcherIpcContracts.listTmuxSessions.channel,
    async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        yield* S.decodeUnknown(AiWatcherIpcContracts.listTmuxSessions.input)(
          input
        )

        const result = yield* tmuxManager.listSessions()

        const encoded = yield* S.encode(
          AiWatcherIpcContracts.listTmuxSessions.output
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    }
  )
})
