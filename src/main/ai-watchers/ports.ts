import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import type { ProcessHandle, ProcessEvent, AiWatcher, AiWatcherConfig, AiWatcherStatus, LogEntry } from './schemas'
import type {
  ProcessSpawnError,
  ProcessAttachError,
  ProcessMonitorError,
  ProcessKillError,
  AiWatcherCreateError,
  AiWatcherStartError,
  AiWatcherStopError,
  WatcherNotFoundError,
} from './errors'

/**
 * Process configuration for spawning new processes
 */
export interface ProcessConfig {
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
}

/**
 * Process monitoring port - abstracts process interaction
 *
 * This port provides low-level process lifecycle management:
 * - Spawning new processes
 * - Attaching to existing processes
 * - Monitoring process events (stdout, stderr, exit, silence detection)
 * - Killing processes
 */
export interface ProcessMonitorPort {
  /**
   * Spawn a new process with the given configuration
   */
  spawn(config: ProcessConfig): Effect.Effect<ProcessHandle, ProcessSpawnError>

  /**
   * Attach to an existing process by PID
   */
  attach(pid: number): Effect.Effect<ProcessHandle, ProcessAttachError>

  /**
   * Monitor a process and stream its events
   * Events include stdout, stderr, exit, error, and silence detection
   */
  monitor(handle: ProcessHandle): Stream.Stream<ProcessEvent, ProcessMonitorError>

  /**
   * Kill a running process
   */
  kill(handle: ProcessHandle): Effect.Effect<void, ProcessKillError>

  /**
   * Enable tmux pipe streaming for a monitored process
   *
   * Streams the output of the tmux pane identified by targetPane into the process event queue.
   * Uses structured concurrency to manage the streaming lifecycle - the stream will be
   * automatically cleaned up when the process is killed or monitoring stops.
   */
  pipeTmuxSession(
    handle: ProcessHandle,
    targetPane: string
  ): Effect.Effect<void, ProcessMonitorError>
}

/**
 * Session manager port - abstracts terminal multiplexer operations
 *
 * This port provides session management for AI agents:
 * - Creating new sessions with commands
 * - Attaching to existing sessions
 * - Listing active sessions
 * - Managing session lifecycle
 */
export interface SessionManagerPort {
  /**
   * Create a new session and spawn a command in it
   *
   * Returns an Effect that requires Scope for proper lifecycle management.
   * The tmux process will be monitored, and when it exits, the Scope will close,
   * triggering automatic cleanup.
   *
   * @param name - Session name
   * @param command - Command to run
   * @param args - Command arguments
   * @param cwd - Working directory
   * @returns Effect that provides ProcessHandle within a Scope
   */
  createSession(
    name: string,
    command: string,
    args?: string[],
    cwd?: string
  ): Effect.Effect<
    ProcessHandle,
    import('./errors').TmuxSessionNotFoundError,
    import('effect/Scope').Scope
  >

  /**
   * Attach to an existing session by name
   */
  attachToSession(
    sessionName: string
  ): Effect.Effect<ProcessHandle, import('./errors').TmuxSessionNotFoundError>

  /**
   * List all active sessions
   */
  listSessions(): Effect.Effect<import('./schemas').TmuxSession[], never>

  /**
   * Kill a session by name
   */
  killSession(
    sessionName: string
  ): Effect.Effect<void, import('./errors').TmuxCommandError>

  /**
   * Check if a session exists
   */
  sessionExists(sessionName: string): Effect.Effect<boolean, never>
}

/**
 * AI watcher port - orchestrates AI agent lifecycle
 *
 * This port provides high-level AI agent management:
 * - Creating and configuring AI watchers
 * - Starting and stopping watchers
 * - Retrieving watcher status
 * - Listing and querying watchers
 * - Streaming and retrieving logs from watchers
 */
export interface AiWatcherPort {
  /**
   * Create a new AI watcher with the given configuration
   */
  create(config: AiWatcherConfig): Effect.Effect<AiWatcher, AiWatcherCreateError>

  /**
   * Start a watcher (begins monitoring the AI agent process)
   */
  start(watcher: AiWatcher): Effect.Effect<void, AiWatcherStartError>

  /**
   * Stop a watcher (stops monitoring and optionally kills the process)
   */
  stop(watcher: AiWatcher): Effect.Effect<void, AiWatcherStopError>

  /**
   * Get the current status of a watcher
   */
  getStatus(watcher: AiWatcher): Effect.Effect<AiWatcherStatus, never>

  /**
   * Get a watcher by ID
   */
  get(watcherId: string): Effect.Effect<AiWatcher, WatcherNotFoundError>

  /**
   * List all watchers
   */
  listAll(): Effect.Effect<AiWatcher[], never>

  /**
   * Get logs from a watcher (existing logs only)
   */
  getLogs(watcherId: string, limit?: number): Effect.Effect<LogEntry[], WatcherNotFoundError>

  /**
   * Stream logs from a watcher (existing + live)
   */
  streamLogs(watcher: AiWatcher): Stream.Stream<LogEntry, never>
}
