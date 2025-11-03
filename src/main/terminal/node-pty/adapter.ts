import { Effect, Layer, HashMap, Ref, Duration, pipe } from 'effect'
import type * as pty from 'node-pty'
import { TerminalPort, ProcessConfig, ProcessState, OutputChunk, ProcessEvent, TerminalError, ProcessId } from '../terminal-port'

// Lazy import of node-pty to avoid loading native module at startup
const getPty = () => Effect.sync(() => require('node-pty') as typeof pty)

interface ProcessInstance {
  config: ProcessConfig
  ptyProcess: pty.IPty
  state: Ref.Ref<ProcessState>
  outputCallbacks: Set<(chunk: OutputChunk) => void>  // Simple callbacks for push-based streaming
  eventCallbacks: Set<(event: ProcessEvent) => void>  // Simple callbacks for events
  idleTimer: Ref.Ref<number | null>
  lastResize: Ref.Ref<number>  // Timestamp of last resize to ignore prompt redraws
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

        console.log('[NodePtyAdapter] updateIdleStatus check:', {
          processId: instance.config.id,
          status: currentState.status,
          timeSinceActivity,
          idleThreshold: currentState.idleThreshold,
          willGoIdle: currentState.status === 'running' && timeSinceActivity >= currentState.idleThreshold
        })

        if (currentState.status === 'running' && timeSinceActivity >= currentState.idleThreshold) {
          console.log('[NodePtyAdapter] Setting process to IDLE:', instance.config.id)
          yield* Ref.update(instance.state, (s) => ({
            ...s,
            status: 'idle' as const,
            lastActivity: new Date(now),
          }))

          const event = new ProcessEvent({
            processId: instance.config.id,
            type: 'idle',
            timestamp: new Date(),
          })

          console.log('[NodePtyAdapter] Invoking', instance.eventCallbacks.size, 'event callbacks for idle')
          // Invoke all event callbacks directly (push-based)
          for (const callback of instance.eventCallbacks) {
            callback(event)
          }
        }
      })

      // Helper to start idle timer without changing status (used at spawn)
      const startIdleTimer = (instance: ProcessInstance) => Effect.gen(function* () {
        const now = Date.now()
        console.log('[NodePtyAdapter] Starting idle timer for process:', instance.config.id, '(will check in 3s) at', now)
        const newTimer = setTimeout(() => {
          const fired = Date.now()
          console.log('[NodePtyAdapter] Idle timer fired for process:', instance.config.id, 'at', fired, '(delta:', fired - now, 'ms)')
          Effect.runPromise(updateIdleStatus(instance)).catch(console.error)
        }, 3000) // 3 seconds idle timeout

        yield* Ref.set(instance.idleTimer, newTimer as unknown as number)
      })

      // Helper to reset idle timer (called on activity)
      const resetIdleTimer = (instance: ProcessInstance) => Effect.gen(function* () {
        const currentTimer = yield* Ref.get(instance.idleTimer)
        if (currentTimer) clearTimeout(currentTimer)

        const now = Date.now()
        console.log('[NodePtyAdapter] Resetting idle timer for process:', instance.config.id, '(will check in 3s) at', now)
        const newTimer = setTimeout(() => {
          const fired = Date.now()
          console.log('[NodePtyAdapter] Idle timer fired for process:', instance.config.id, 'at', fired, '(delta:', fired - now, 'ms)')
          Effect.runPromise(updateIdleStatus(instance)).catch(console.error)
        }, 3000) // 3 seconds idle timeout

        yield* Ref.set(instance.idleTimer, newTimer as unknown as number)

        const state = yield* Ref.get(instance.state)
        if (state.status === 'idle') {
          console.log('[NodePtyAdapter] Process was IDLE, setting back to ACTIVE:', instance.config.id)
          yield* Ref.update(instance.state, (s) => ({
            ...s,
            status: 'running' as const,
            lastActivity: new Date(),
          }))

          const event = new ProcessEvent({
            processId: instance.config.id,
            type: 'active',
            timestamp: new Date(),
          })

          console.log('[NodePtyAdapter] Invoking', instance.eventCallbacks.size, 'event callbacks for active')
          // Invoke all event callbacks directly (push-based)
          for (const callback of instance.eventCallbacks) {
            callback(event)
          }
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

        console.log('[NodePtyAdapter] Spawning process:', {
          command: config.command,
          args: config.args,
          cwd: config.cwd,
        })

        const ptyProcess = yield* Effect.try({
          try: () => {
            // SIMPLIFIED: Just spawn the command directly in PTY for testing
            // This should work for bash and simple commands
            const spawnCommand = config.command
            const spawnArgs = config.args

            console.log('[NodePtyAdapter] Spawning directly in PTY:', {
              command: spawnCommand,
              args: spawnArgs,
              cwd: config.cwd
            })

            const pty = ptyModule.spawn(spawnCommand, spawnArgs, {
              name: 'xterm-256color',
              cols: config.cols || 80,
              rows: config.rows || 24,
              cwd: config.cwd,
              env: {
                ...process.env,
                ...config.env,
                // Force TTY mode
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                FORCE_COLOR: '1',
              } as Record<string, string>,
            })

            console.log('[NodePtyAdapter] Process spawned successfully, PID:', pty.pid)

            return pty
          },
          catch: (error) => {
            console.error('[NodePtyAdapter] Failed to spawn process:', error)
            return new TerminalError({ reason: 'SpawnFailed', message: `Failed to spawn process: ${error}` })
          }
        })

        // Create state and streams
        const state = yield* Ref.make(new ProcessState({
          status: 'starting' as const,
          pid: ptyProcess.pid,
          lastActivity: new Date(),
          idleThreshold: 3000, // 3 seconds to match resetIdleTimer
        }))

        const idleTimer = yield* Ref.make<number | null>(null)
        // Initialize lastResize to current time to ignore initial prompt draws
        const lastResize = yield* Ref.make(Date.now())

        const instance: ProcessInstance = {
          config,
          ptyProcess,
          state,
          outputCallbacks: new Set(),  // Track all output callbacks
          eventCallbacks: new Set(),   // Track all event callbacks
          idleTimer,
          lastResize,
        }

        // Set up event handlers
        ptyProcess.onData((data: string) => {
          console.log('[NodePtyAdapter] Received PTY data for', config.id, ':', data.substring(0, 100))
          Effect.runPromise(Effect.gen(function* () {
            const chunk = new OutputChunk({
              processId: config.id,
              data,
              timestamp: new Date(),
              type: 'stdout',
            })

            console.log('[NodePtyAdapter] Invoking', instance.outputCallbacks.size, 'output callbacks')

            // Invoke all callbacks directly (push-based)
            for (const callback of instance.outputCallbacks) {
              callback(chunk)
            }

            console.log('[NodePtyAdapter] All callbacks invoked')

            // Check if this data arrived within 2s of a resize/spawn (likely prompt redraw)
            const lastResizeTime = yield* Ref.get(lastResize)
            const timeSinceResize = Date.now() - lastResizeTime
            const isPromptRedraw = timeSinceResize < 2000

            if (isPromptRedraw) {
              console.log('[NodePtyAdapter] ⏭️  Ignoring PTY data within 2s of resize/spawn (prompt redraw, delta:', timeSinceResize, 'ms)')
              // Still update lastActivity
              yield* Ref.update(state, (s) => ({
                ...s,
                lastActivity: new Date(),
              }))

              // Still need to reset the timer if running, just don't transition idle→running
              const currentState = yield* Ref.get(state)
              if (currentState.status === 'running') {
                console.log('[NodePtyAdapter] Process is running, restarting idle timer without status change')
                yield* startIdleTimer(instance)
              }
              // If idle, don't touch the timer (would transition to running)
            } else {
              // Normal PTY data - update activity and reset idle timer
              yield* Ref.update(state, (s) => ({
                ...s,
                lastActivity: new Date(),
              }))

              yield* resetIdleTimer(instance)
            }
          })).catch((error) => {
            console.error('[NodePtyAdapter] Error in onData handler:', error)
          })
        })

        ptyProcess.onExit(({ exitCode, signal }) => {
          Effect.runPromise(Effect.gen(function* () {
            yield* Ref.update(state, (s) => ({
              ...s,
              status: 'stopped' as const,
              exitCode: exitCode ?? undefined,
            }))

            const event = new ProcessEvent({
              processId: config.id,
              type: 'stopped',
              timestamp: new Date(),
              metadata: { exitCode, signal },
            })

            // Invoke all event callbacks directly (push-based)
            for (const callback of instance.eventCallbacks) {
              callback(event)
            }

            // Clear idle timer
            const timer = yield* Ref.get(idleTimer)
            if (timer) clearTimeout(timer)
          })).catch(console.error)
        })

        // Store process instance
        yield* Ref.update(processes, HashMap.set(config.id, instance))

        // Update state to idle (terminals start idle until user interacts)
        yield* Ref.update(state, (s) => ({
          ...s,
          status: 'idle' as const,
        }))

        // Send started event
        const startedEvent = new ProcessEvent({
          processId: config.id,
          type: 'started',
          timestamp: new Date(),
        })

        for (const callback of instance.eventCallbacks) {
          callback(startedEvent)
        }

        // Also send idle event to ensure frontend knows initial state
        const idleEvent = new ProcessEvent({
          processId: config.id,
          type: 'idle',
          timestamp: new Date(),
        })

        for (const callback of instance.eventCallbacks) {
          callback(idleEvent)
        }

        // Start idle timer WITHOUT changing status (stays idle until activity)
        yield* startIdleTimer(instance)

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

        console.log('[NodePtyAdapter] Writing to PTY:', data, 'length:', data.length)

        yield* Effect.try({
          try: () => {
            instance.ptyProcess.write(data)
            console.log('[NodePtyAdapter] Successfully wrote to PTY')
          },
          catch: (error) => {
            console.error('[NodePtyAdapter] Failed to write to PTY:', error)
            return new TerminalError({ reason: 'PermissionDenied', message: `Failed to write to process: ${error}` })
          }
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

        // Check if process is alive before attempting resize
        const currentState = yield* Ref.get(instance.state)
        if (currentState.status === 'stopped' || currentState.status === 'error') {
          return yield* Effect.fail(
            new TerminalError({
              reason: 'PermissionDenied',
              message: `Cannot resize process ${processId}: process is ${currentState.status}`
            })
          )
        }

        yield* Effect.try({
          try: () => instance.ptyProcess.resize(cols, rows),
          catch: (error) => new TerminalError({ reason: 'PermissionDenied', message: `Failed to resize process: ${error}` })
        })

        // Record resize time to ignore subsequent prompt redraws (within 2s)
        yield* Ref.set(instance.lastResize, Date.now())
        console.log('[NodePtyAdapter] Resize recorded at', Date.now(), 'for process:', processId)
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

      const subscribe = (processId: string, onOutput: (chunk: OutputChunk) => void): Effect.Effect<() => void, TerminalError> => {
        console.log('[NodePtyAdapter] Creating callback subscription for:', processId)

        return Effect.gen(function* () {
          const option = yield* pipe(
            Ref.get(processes),
            Effect.map(HashMap.get(processId as ProcessId))
          )

          if (option._tag === 'None') {
            console.error('[NodePtyAdapter] Process not found for subscription:', processId)
            return yield* Effect.fail(
              new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` })
            )
          }

          const instance = option.value
          console.log('[NodePtyAdapter] Found process instance, registering callback')

          // Add callback to set (push-based)
          instance.outputCallbacks.add(onOutput)
          console.log('[NodePtyAdapter] Callback registered, total subscribers:', instance.outputCallbacks.size)

          // Return cleanup function
          return () => {
            console.log('[NodePtyAdapter] Cleanup: removing callback for process:', processId)
            instance.outputCallbacks.delete(onOutput)
          }
        })
      }

      const subscribeToEvents = (processId: string, onEvent: (event: ProcessEvent) => void): Effect.Effect<() => void, TerminalError> => {
        console.log('[NodePtyAdapter] Creating event callback subscription for:', processId)

        return Effect.gen(function* () {
          const option = yield* pipe(
            Ref.get(processes),
            Effect.map(HashMap.get(processId as ProcessId))
          )

          if (option._tag === 'None') {
            console.error('[NodePtyAdapter] Process not found for event subscription:', processId)
            return yield* Effect.fail(
              new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` })
            )
          }

          const instance = option.value
          console.log('[NodePtyAdapter] Found process instance, registering event callback')

          // Add callback to set (push-based)
          instance.eventCallbacks.add(onEvent)
          console.log('[NodePtyAdapter] Event callback registered, total subscribers:', instance.eventCallbacks.size)

          // Return cleanup function
          return () => {
            console.log('[NodePtyAdapter] Cleanup: removing event callback for process:', processId)
            instance.eventCallbacks.delete(onEvent)
          }
        })
      }

    // Return adapter implementation with explicit type
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
