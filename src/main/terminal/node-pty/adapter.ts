import { Effect, Layer, Stream, HashMap, Ref, PubSub, Duration, pipe } from 'effect'
import type * as pty from 'node-pty'
import { TerminalPort, ProcessConfig, ProcessState, OutputChunk, ProcessEvent, TerminalError, ProcessId } from '../terminal-port'

// Lazy import of node-pty to avoid loading native module at startup
const getPty = () => Effect.sync(() => require('node-pty') as typeof pty)

interface ProcessInstance {
  config: ProcessConfig
  ptyProcess: pty.IPty
  state: Ref.Ref<ProcessState>
  outputStream: PubSub.PubSub<OutputChunk>
  eventStream: PubSub.PubSub<ProcessEvent>
  idleTimer: Ref.Ref<number | null>
}

// Export as Layer
export const NodePtyTerminalAdapter = Layer.effect(
  TerminalPort,
  Effect.gen(function* () {
    // Process registry
    const processes = yield* Ref.make(HashMap.empty<ProcessId, ProcessInstance>())

    // Helper to update idle status
    const updateIdleStatus = (instance: ProcessInstance) => Effect.gen(function* () {
        const currentState = yield* Ref.get(instance.state)
        const now = Date.now()
        const timeSinceActivity = now - currentState.lastActivity.getTime()

        if (currentState.status === 'running' && timeSinceActivity > currentState.idleThreshold) {
          yield* Ref.update(instance.state, (s) => ({
            ...s,
            status: 'idle' as const,
            lastActivity: new Date(now),
          }))

          yield* PubSub.publish(
            instance.eventStream,
            new ProcessEvent({
              processId: instance.config.id,
              type: 'idle',
              timestamp: new Date(),
            })
          )
        }
      })

      // Helper to reset idle timer
      const resetIdleTimer = (instance: ProcessInstance) => Effect.gen(function* () {
        const currentTimer = yield* Ref.get(instance.idleTimer)
        if (currentTimer) clearTimeout(currentTimer)

        const newTimer = setTimeout(() => {
          Effect.runPromise(updateIdleStatus(instance)).catch(console.error)
        }, instance.config.issueContext ? 30000 : 60000) // 30s for issues, 60s default

        yield* Ref.set(instance.idleTimer, newTimer as unknown as number)

        const state = yield* Ref.get(instance.state)
        if (state.status === 'idle') {
          yield* Ref.update(instance.state, (s) => ({
            ...s,
            status: 'running' as const,
            lastActivity: new Date(),
          }))

          yield* PubSub.publish(
            instance.eventStream,
            new ProcessEvent({
              processId: instance.config.id,
              type: 'active',
              timestamp: new Date(),
            })
          )
        }
      })

      const spawn = (config: ProcessConfig) => Effect.gen(function* () {
        const existing = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(config.id))
        )

        if (existing._tag === 'Some') {
          const state = yield* Ref.get(existing.value.state)
          if (state.status === 'running' || state.status === 'idle' || state.status === 'starting') {
            return yield* Effect.fail(new TerminalError({ reason: 'AlreadyRunning', message: `Process ${config.id} is already running` }))
          }
        }

        // Lazy load node-pty and create PTY process
        const ptyModule = yield* getPty()
        const ptyProcess = yield* Effect.try({
          try: () => ptyModule.spawn(config.shell || '/bin/bash', [...config.args], {
            name: 'xterm-256color',
            cols: config.cols || 80,
            rows: config.rows || 24,
            cwd: config.cwd,
            env: { ...process.env, ...config.env } as Record<string, string>,
          }),
          catch: (error) => new TerminalError({ reason: 'SpawnFailed', message: `Failed to spawn process: ${error}` })
        })

        // Create state and streams
        const state = yield* Ref.make(new ProcessState({
          status: 'starting' as const,
          pid: ptyProcess.pid,
          lastActivity: new Date(),
          idleThreshold: config.issueContext ? 30000 : 60000,
        }))

        const outputStream = yield* PubSub.unbounded<OutputChunk>()
        const eventStream = yield* PubSub.unbounded<ProcessEvent>()
        const idleTimer = yield* Ref.make<number | null>(null)

        const instance: ProcessInstance = {
          config,
          ptyProcess,
          state,
          outputStream,
          eventStream,
          idleTimer,
        }

        // Set up event handlers
        ptyProcess.onData((data: string) => {
          Effect.runPromise(Effect.gen(function* () {
            yield* PubSub.publish(
              outputStream,
              new OutputChunk({
                processId: config.id,
                data,
                timestamp: new Date(),
                type: 'stdout',
              })
            )

            yield* Ref.update(state, (s) => ({
              ...s,
              lastActivity: new Date(),
            }))

            yield* resetIdleTimer(instance)
          })).catch(console.error)
        })

        ptyProcess.onExit(({ exitCode, signal }) => {
          Effect.runPromise(Effect.gen(function* () {
            yield* Ref.update(state, (s) => ({
              ...s,
              status: 'stopped' as const,
              exitCode: exitCode ?? undefined,
            }))

            yield* PubSub.publish(
              eventStream,
              new ProcessEvent({
                processId: config.id,
                type: 'stopped',
                timestamp: new Date(),
                metadata: { exitCode, signal },
              })
            )

            // Clear idle timer
            const timer = yield* Ref.get(idleTimer)
            if (timer) clearTimeout(timer)
          })).catch(console.error)
        })

        // Store process instance
        yield* Ref.update(processes, HashMap.set(config.id, instance))

        // Update state to running
        yield* Ref.update(state, (s) => ({
          ...s,
          status: 'running' as const,
        }))

        yield* PubSub.publish(
          eventStream,
          new ProcessEvent({
            processId: config.id,
            type: 'started',
            timestamp: new Date(),
          })
        )

        // Start idle timer
        yield* resetIdleTimer(instance)

        return yield* Ref.get(state)
      })

      const kill = (processId: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId as ProcessId)),
          Effect.flatMap((option) =>
            option._tag === 'Some'
              ? Effect.succeed(option.value)
              : Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` }))
          )
        )

        // Clear idle timer
        const timer = yield* Ref.get(instance.idleTimer)
        if (timer) clearTimeout(timer)

        // Kill the PTY process
        yield* Effect.try({
          try: () => instance.ptyProcess.kill(),
          catch: (error) => new TerminalError({ reason: 'PermissionDenied', message: `Failed to kill process: ${error}` })
        })

        // Update state
        yield* Ref.update(instance.state, (s) => ({
          ...s,
          status: 'stopped' as const,
        }))

        // Remove from registry
        yield* Ref.update(processes, HashMap.remove(processId as ProcessId))
      })

      const restart = (processId: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId as ProcessId)),
          Effect.flatMap((option) =>
            option._tag === 'Some'
              ? Effect.succeed(option.value)
              : Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` }))
          )
        )

        yield* kill(processId)
        yield* Effect.sleep(Duration.millis(500)) // Brief pause before restart
        return yield* spawn(instance.config)
      })

      const write = (processId: string, data: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId as ProcessId)),
          Effect.flatMap((option) =>
            option._tag === 'Some'
              ? Effect.succeed(option.value)
              : Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` }))
          )
        )

        yield* Effect.try({
          try: () => instance.ptyProcess.write(data),
          catch: (error) => new TerminalError({ reason: 'PermissionDenied', message: `Failed to write to process: ${error}` })
        })

        // Reset idle timer on input
        yield* resetIdleTimer(instance)
      })

      const resize = (processId: string, rows: number, cols: number) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId as ProcessId)),
          Effect.flatMap((option) =>
            option._tag === 'Some'
              ? Effect.succeed(option.value)
              : Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` }))
          )
        )

        yield* Effect.try({
          try: () => instance.ptyProcess.resize(cols, rows),
          catch: (error) => new TerminalError({ reason: 'PermissionDenied', message: `Failed to resize process: ${error}` })
        })
      })

      const getState = (processId: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId as ProcessId)),
          Effect.flatMap((option) =>
            option._tag === 'Some'
              ? Effect.succeed(option.value)
              : Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` }))
          )
        )

        return yield* Ref.get(instance.state)
      })

      const listProcesses = () => Effect.gen(function* () {
        const processMap = yield* Ref.get(processes)
        const instances = Array.from(HashMap.values(processMap))

        const states = yield* Effect.all(
          instances.map((instance) => Ref.get(instance.state)),
          { concurrency: 'unbounded' }
        )

        return states
      })

      const subscribe = (processId: string): Stream.Stream<OutputChunk, TerminalError> => {
        return pipe(
          Stream.fromEffect(
            pipe(
              Ref.get(processes),
              Effect.map(HashMap.get(processId as ProcessId)),
              Effect.flatMap((option) =>
                option._tag === 'Some'
                  ? Effect.succeed(option.value)
                  : Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` }))
              )
            )
          ),
          Stream.flatMap((instance) => Stream.fromPubSub(instance.outputStream))
        )
      }

      const subscribeToEvents = (processId: string): Stream.Stream<ProcessEvent, TerminalError> => {
        return pipe(
          Stream.fromEffect(
            pipe(
              Ref.get(processes),
              Effect.map(HashMap.get(processId as ProcessId)),
              Effect.flatMap((option) =>
                option._tag === 'Some'
                  ? Effect.succeed(option.value)
                  : Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` }))
              )
            )
          ),
          Stream.flatMap((instance) => Stream.fromPubSub(instance.eventStream))
        )
      }

    const adapter: TerminalPort = {
      spawn,
      kill,
      restart,
      write,
      resize,
      getState,
      listProcesses,
      subscribe,
      subscribeToEvents,
    }

    return adapter
  })
)
