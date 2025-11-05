import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Duration from "effect/Duration";
import * as Scope from "effect/Scope";
import * as Exit from "effect/Exit";
import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ProcessMonitorPort, ProcessConfig } from "../../ports";
import { ProcessHandle, ProcessEvent } from "../../schemas";
import {
  ProcessSpawnError,
  ProcessMonitorError,
  ProcessKillError,
  ProcessNotFoundError,
} from "../../errors";
import { TmuxControlClient } from "../tmux-session-manager/tmux-control-client-adapter";

/**
 * Internal process information tracked by the monitor
 */
interface ProcessInfo {
  handle: ProcessHandle;
  child?: ChildProcess;
  queue: Queue.Queue<ProcessEvent>;
  lastActivityRef: Ref.Ref<number>;
  isAttached: boolean;
  tmuxPipeScopeRef: Ref.Ref<Scope.CloseableScope | null>; // Scope for tmux control mode
}

/**
 * Silence detection threshold - 4 seconds of no activity
 */
const SILENCE_THRESHOLD_MS = 4_000;

/**
 * Activity check interval - check every 5 seconds
 */
const ACTIVITY_CHECK_INTERVAL = Duration.seconds(5);

/**
 * NodeProcessMonitorAdapter - Node.js implementation of ProcessMonitorPort
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementing ProcessMonitorPort.
 * It can be replaced with other implementations (Docker, SSH, etc.) for testing or different environments.
 *
 * Provides low-level process lifecycle management:
 * - Spawning new processes using Node.js child_process
 * - Attaching to existing processes (limited - only tracks metadata)
 * - Event streaming (stdout, stderr, exit, error, silence detection)
 * - Process termination
 * - Activity tracking with automatic silence detection
 */
export class NodeProcessMonitorAdapter extends Effect.Service<NodeProcessMonitorAdapter>()(
  "NodeProcessMonitorAdapter",
  {
    effect: Effect.gen(function* () {
      // Map of process ID to process information
      const processes = new Map<string, ProcessInfo>();

      /**
       * Mark activity for a process
       */
      const markActivity = (processId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const info = processes.get(processId);
          if (!info) {
            console.log(
              `[${processId.slice(0, 8)}] markActivity called but process not found!`,
            );
            return yield* Effect.void;
          }
          console.log(`[${processId.slice(0, 8)}] markActivity called`);
          yield* Ref.set(info.lastActivityRef, Date.now());
        });

      /**
       * Emit an event to a process's queue
       */
      const emitEvent = (
        processId: string,
        event: ProcessEvent,
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const info = processes.get(processId);
          if (!info) {
            console.log(
              `[${processId.slice(0, 8)}] emitEvent called but process not found!`,
            );
            return yield* Effect.void;
          }

          console.log(
            `[${processId.slice(0, 8)}] emitEvent called, type=${event.type}, dataLength=${event.data?.length ?? 0}`,
          );
          yield* Queue.offer(info.queue, event).pipe(
            Effect.catchAll((error) =>
              Effect.logError(
                `Failed to emit process event for ${processId}: ${String(error)}`,
              ),
            ),
          );
        });

      /**
       * Setup silence detection for a process within a scope
       * This creates a scoped fiber that will be cleaned up when the scope closes
       */
      const setupSilenceDetection = (
        processId: string,
      ): Effect.Effect<void, never, Scope.Scope> =>
        Effect.gen(function* () {
          yield* Effect.forkScoped(
            Effect.repeat(
              Effect.gen(function* () {
                const info = processes.get(processId);
                if (!info) {
                  return yield* Effect.void; // Process was removed, stop checking
                }

                const lastActivity = yield* Ref.get(info.lastActivityRef);
                const now = Date.now();
                const timeSinceActivity = now - lastActivity;

                if (timeSinceActivity > SILENCE_THRESHOLD_MS) {
                  // Emit silence event
                  const silenceEvent = new ProcessEvent({
                    type: "silence",
                    timestamp: new Date(),
                    processId,
                  });

                  yield* emitEvent(processId, silenceEvent);

                  // Reset activity time to prevent repeated silence events
                  yield* Ref.set(info.lastActivityRef, now);
                }
              }),
              Schedule.fixed(ACTIVITY_CHECK_INTERVAL),
            ),
          );
        });

      /**
       * Cleanup process info
       */
      const cleanupProcess = (processId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const info = processes.get(processId);
          if (!info) {
            return yield* Effect.void;
          }

          // Close tmux control mode scope if active (this interrupts all scoped fibers)
          const controlScope = yield* Ref.get(info.tmuxPipeScopeRef);
          if (controlScope) {
            yield* Scope.close(controlScope, Exit.void).pipe(
              Effect.catchAll(() => Effect.void),
            );
            yield* Ref.set(info.tmuxPipeScopeRef, null);
          }

          yield* Queue.shutdown(info.queue);
          processes.delete(processId);
        });

      const implementation: ProcessMonitorPort = {
        spawn: (config: ProcessConfig) =>
          Effect.gen(function* () {
            // Generate a cryptographically secure random ID
            const processId = yield* Effect.sync(() => randomUUID());

            try {
              const child = spawn(config.command, config.args, {
                cwd: config.cwd,
                env: config.env,
                stdio: ["ignore", "pipe", "pipe"], // stdin ignored, stdout/stderr piped
              });

              if (!child.pid) {
                return yield* Effect.fail(
                  new ProcessSpawnError({
                    message: `Failed to spawn process: no PID assigned`,
                    command: config.command,
                    args: config.args,
                  }),
                );
              }

              const handle = new ProcessHandle({
                id: processId,
                pid: child.pid,
                type: "spawned",
                startedAt: new Date(),
              });

              // Create queue for events
              const queue = yield* Queue.unbounded<ProcessEvent>();

              // Create activity ref
              const lastActivityRef = yield* Ref.make(Date.now());

              // Create tmux control mode scope ref
              const tmuxPipeScopeRef =
                yield* Ref.make<Scope.CloseableScope | null>(null);

              // Store process info
              const processInfo: ProcessInfo = {
                handle,
                child,
                queue,
                lastActivityRef,
                isAttached: false,
                tmuxPipeScopeRef,
              };
              processes.set(processId, processInfo);

              // Setup event listeners
              if (child.stdout) {
                child.stdout.setEncoding("utf8");
                child.stdout.on("data", (chunk: string) => {
                  Effect.runFork(
                    Effect.gen(function* () {
                      yield* markActivity(processId);
                      const event = new ProcessEvent({
                        type: "stdout",
                        data: chunk,
                        timestamp: new Date(),
                        processId,
                      });
                      yield* emitEvent(processId, event);
                    }),
                  );
                });
              }

              if (child.stderr) {
                child.stderr.setEncoding("utf8");
                child.stderr.on("data", (chunk: string) => {
                  Effect.runFork(
                    Effect.gen(function* () {
                      yield* markActivity(processId);
                      const event = new ProcessEvent({
                        type: "stderr",
                        data: chunk,
                        timestamp: new Date(),
                        processId,
                      });
                      yield* emitEvent(processId, event);
                    }),
                  );
                });
              }

              child.on("error", (error: Error) => {
                Effect.runFork(
                  Effect.gen(function* () {
                    const event = new ProcessEvent({
                      type: "error",
                      data: error.message,
                      timestamp: new Date(),
                      processId,
                    });
                    yield* emitEvent(processId, event);
                    yield* cleanupProcess(processId);
                  }),
                );
              });

              child.on("exit", (code: number | null, signal: string | null) => {
                Effect.runFork(
                  Effect.gen(function* () {
                    const exitData = `code=${code ?? "null"} signal=${signal ?? "none"}`;
                    const event = new ProcessEvent({
                      type: "exit",
                      data: exitData,
                      timestamp: new Date(),
                      processId,
                    });
                    yield* emitEvent(processId, event);
                    yield* cleanupProcess(processId);
                  }),
                );
              });

              // Silence detection will be started when monitor() is called
              // It will be scoped to the monitoring stream

              return handle;
            } catch (error) {
              return yield* Effect.fail(
                new ProcessSpawnError({
                  message: `Failed to spawn process: ${error instanceof Error ? error.message : String(error)}`,
                  command: config.command,
                  args: config.args,
                  cause: error,
                }),
              );
            }
          }),

        attach: (pid: number) =>
          Effect.gen(function* () {
            // Generate a cryptographically secure random ID
            const processId = yield* Effect.sync(() => randomUUID());

            // Note: We can't truly "attach" to an existing process's stdout/stderr
            // This creates a handle for tracking, but won't receive live output
            // For tmux sessions, we'll rely on tmux's capture-pane instead

            const handle = new ProcessHandle({
              id: processId,
              pid,
              type: "attached",
              startedAt: new Date(),
            });

            // Create queue for events (though it won't receive much)
            const queue = yield* Queue.unbounded<ProcessEvent>();
            const lastActivityRef = yield* Ref.make(Date.now());
            const tmuxPipeScopeRef =
              yield* Ref.make<Scope.CloseableScope | null>(null);

            const processInfo: ProcessInfo = {
              handle,
              queue,
              lastActivityRef,
              isAttached: true,
              tmuxPipeScopeRef,
            };
            processes.set(processId, processInfo);

            // Silence detection will be started when monitor() is called
            return handle;
          }),

        monitor: (handle: ProcessHandle) =>
          Stream.unwrapScoped(
            Effect.gen(function* () {
              const info = processes.get(handle.id);
              if (!info) {
                return yield* Effect.fail(
                  new ProcessMonitorError({
                    message: `Process ${handle.id} not found`,
                    processId: handle.id,
                    cause: new ProcessNotFoundError({
                      message: `Process ${handle.id} not found`,
                      processId: handle.id,
                    }),
                  }),
                );
              }

              // Start silence detection as a scoped fiber
              // It will be automatically interrupted when the stream scope closes
              yield* setupSilenceDetection(handle.id);

              return Stream.fromQueue(info.queue);
            }),
          ),

        kill: (handle: ProcessHandle) =>
          Effect.gen(function* () {
            const info = processes.get(handle.id);
            if (!info) {
              return yield* Effect.fail(
                new ProcessKillError({
                  message: `Process ${handle.id} not found`,
                  processId: handle.id,
                  pid: handle.pid,
                  cause: new ProcessNotFoundError({
                    message: `Process ${handle.id} not found`,
                    processId: handle.id,
                  }),
                }),
              );
            }

            if (info.child && !info.child.killed) {
              // Try graceful termination first
              info.child.kill("SIGTERM");

              // Wait a bit, then force kill if needed
              yield* Effect.sleep(Duration.seconds(5));

              if (info.child && !info.child.killed) {
                info.child.kill("SIGKILL");
              }
              // Exit event will be emitted by child process listener
            } else if (info.isAttached) {
              // For attached processes, use kill command
              const killCmd = Command.make("kill", "-TERM", String(handle.pid));

              yield* Effect.scoped(
                Command.start(killCmd).pipe(
                  Effect.flatMap((process) =>
                    Effect.all([
                      process.exitCode,
                      process.stderr.pipe(
                        Stream.decodeText("utf8"),
                        Stream.runFold("", (acc, chunk) => acc + chunk),
                      ),
                    ]),
                  ),
                  Effect.provide(NodeContext.layer),
                  Effect.flatMap(([exitCode, stderr]) => {
                  // Exit code 0 = success, 1 = process not found (already dead)
                  if (exitCode === 0 || exitCode === 1) {
                    return Effect.void;
                  }
                  return Effect.fail(
                    new ProcessKillError({
                      message: `Failed to kill attached process (exit ${exitCode}): ${stderr}`,
                      processId: handle.id,
                      pid: handle.pid,
                      cause: new Error(stderr),
                    }),
                  );
                }),
                  Effect.mapError(
                    (error) =>
                      new ProcessKillError({
                        message: `Failed to kill attached process: ${error instanceof Error ? error.message : String(error)}`,
                        processId: handle.id,
                        pid: handle.pid,
                        cause: error,
                      }),
                  ),
                  // Ignore "No such process" errors - process already dead
                  Effect.catchAll((error) => {
                    if (
                      error.cause &&
                      String(error.cause).includes("No such process")
                    ) {
                      return Effect.void;
                    }
                    return Effect.fail(error);
                  }),
                ),
              );

              // For attached processes, manually emit exit event
              // (spawned processes emit this via child process listener)
              const exitEvent = new ProcessEvent({
                type: "exit",
                data: "killed",
                timestamp: new Date(),
                processId: handle.id,
              });
              yield* emitEvent(handle.id, exitEvent);
            }

            yield* cleanupProcess(handle.id);

            return yield* Effect.void;
          }),

        pipeTmuxSession: (handle: ProcessHandle, targetPane: string) =>
          Effect.gen(function* () {
            console.log(
              `[NodeProcessMonitorAdapter] pipeTmuxSession called for handle=${handle.id}, targetPane="${targetPane}"`,
            );

            const info = processes.get(handle.id);
            if (!info) {
              console.log(
                `[NodeProcessMonitorAdapter] Process ${handle.id} not found in registry`,
              );
              return yield* Effect.fail(
                new ProcessMonitorError({
                  message: `Process ${handle.id} not found`,
                  processId: handle.id,
                }),
              );
            }

            console.log(
              `[NodeProcessMonitorAdapter] Found process ${handle.id} in registry, setting up control mode`,
            );

            // Extract session name and pane ID from target
            // Format can be "session:paneId" or just "session" (legacy)
            const colonIndex = targetPane.indexOf(":");
            let sessionName: string;
            let targetPaneId: string | null = null;

            if (colonIndex > -1) {
              sessionName = targetPane.substring(0, colonIndex);
              targetPaneId = targetPane.substring(colonIndex + 1);
            } else {
              sessionName = targetPane;
            }

            yield* Effect.logDebug(
              `[${handle.id.slice(0, 8)}] Extracted session="${sessionName}", paneId="${targetPaneId}"`,
            );

            // TRY PTY-BASED CONTROL MODE FIRST - provides real-time activity detection
            // Uses node-pty to create proper PTY for tmux -CC
            yield* Effect.logInfo(
              `[${handle.id.slice(0, 8)}] Attempting PTY-based control mode for session: ${sessionName}`,
            );

            // Try to spawn control mode with PTY, fall back to pipe-pane if it fails
            const controlModeResult = yield* Effect.either(
              TmuxControlClient.spawnWithPty(sessionName, targetPaneId).pipe(
                Effect.tap((controlClient) =>
                  Effect.sync(() => {
                    console.log(
                      `[${handle.id.slice(0, 8)}] Control mode spawned successfully`,
                    );
                  }),
                ),
              ),
            );

            if (controlModeResult._tag === "Right") {
              const controlClient = controlModeResult.right;

              // Create event stream from PTY-based control client
              const eventStream =
                TmuxControlClient.createEventStream(controlClient);

              // Create a scope for the control mode stream
              const controlScope = yield* Scope.make();
              yield* Ref.set(info.tmuxPipeScopeRef, controlScope);

              // Fork the event stream processor in background
              yield* Effect.logInfo(
                `[${handle.id.slice(0, 8)}] Forking control mode event stream for session: ${sessionName}`,
              );
              yield* Effect.forkIn(
                eventStream
                  .pipe(
                    Stream.tap((event) =>
                      Effect.gen(function* () {
                        console.log(
                          `[${handle.id.slice(0, 8)}] Event from control mode: type=${event.type}, paneId=${event.processId}`,
                        );
                        yield* Effect.logDebug(
                          `[${handle.id.slice(0, 8)}] Event received: type=${event.type}, paneId=${event.processId}`,
                        );

                        // Mark activity immediately on output event
                        if (event.type === "stdout") {
                          yield* markActivity(handle.id);
                        }

                        // Map the event's processId (pane ID) back to the runner's handle ID
                        const mappedEvent = event;
                        (mappedEvent as any).processId = handle.id;
                        yield* emitEvent(handle.id, mappedEvent);
                      }),
                    ),
                    Stream.runDrain,
                  )
                  .pipe(
                    Effect.catchAll((error) =>
                      Effect.gen(function* () {
                        console.error(
                          `[${handle.id.slice(0, 8)}] Stream error: ${String(error)}`,
                        );
                        yield* Effect.logError(
                          `[${handle.id.slice(0, 8)}] Control mode stream error: ${String(error)}`,
                        );
                      }),
                    ),
                  ),
                controlScope,
              );

              yield* Effect.logInfo(
                `[${handle.id.slice(0, 8)}] PTY-based control mode ACTIVE for session: ${sessionName}`,
              );

              return yield* Effect.void;
            } else {
              // Control mode failed - log error and fail
              const error = controlModeResult.left;
              console.error(
                `[${handle.id.slice(0, 8)}] Control mode FAILED: ${error.message}`,
              );
              yield* Effect.logError(
                `[${handle.id.slice(0, 8)}] PTY-based control mode failed: ${error.message}`,
              );
              return yield* Effect.fail(error);
            }
          }),
      };

      return implementation;
    }),
  },
) {}
