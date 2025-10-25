import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import type { ProcessHandle, ProcessEvent, AiWatcher, AiWatcherConfig, AiWatcherStatus } from './schemas'
import type {
  ProcessSpawnError,
  ProcessAttachError,
  ProcessMonitorError,
  ProcessKillError,
  AiWatcherCreateError,
  AiWatcherStartError,
  AiWatcherStopError,
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
 * Log entry structure for AI watcher logs
 */
export interface LogEntry {
  timestamp: Date
  level: 'info' | 'error' | 'debug' | 'stdout' | 'stderr'
  message: string
  watcherId: string
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
}

/**
 * AI watcher port - orchestrates AI agent lifecycle
 *
 * This port provides high-level AI agent management:
 * - Creating and configuring AI watchers
 * - Starting and stopping watchers
 * - Retrieving watcher status
 * - Streaming logs from watchers
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
   * Stream logs from a watcher
   */
  streamLogs(watcher: AiWatcher): Stream.Stream<LogEntry, never>
}
