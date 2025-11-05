/**
 * Development-only Process Runner Testing Panel
 *
 * Allows testing process runner functionality in development mode.
 * Exposes window.__DEV_PROCESS_RUNNERS__ API in console.
 */

import { useEffect, useRef, useState } from "react";
import { Result } from "@effect-atom/atom-react";
import {
  useProcessRunners,
  useTmuxSessions,
  useRunnerLogs,
} from "../../hooks/useProcessRunners";
import type {
  ProcessRunnerConfig,
  ProcessRunner,
  TmuxSession,
  LogEntry,
} from '../../shared/schemas/process-runners';
import type { NetworkError } from "../../shared/schemas/errors";
import type { RunnerNotFoundError } from '../../shared/schemas/process-runners/errors';

// Type-safe window extension for dev API
interface DevProcessRunnersAPI {
  listRunners: () => readonly ProcessRunner[];
  listTmuxSessions: () => readonly TmuxSession[];
  createRunner: (config: Partial<ProcessRunnerConfig>) => void;
  attachToTmux: (sessionName: string) => void;
  stopRunner: (runnerId: string) => void;
  startRunner: (runnerId: string) => void;
  showPanel: () => void;
  hidePanel: () => void;
  togglePanel: () => void;
  getResults: () => {
    runners: unknown;
    sessions: unknown;
    createResult: unknown;
  };
}

declare global {
  interface Window {
    __DEV_PROCESS_RUNNERS__?: DevProcessRunnersAPI;
  }
}

// Helper to clean object by removing undefined properties
// This ensures optional schema fields work correctly over IPC
function cleanConfig<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

const LOG_REFRESH_INTERVAL_MS = 1000; // Simple 1-second refresh

/**
 * Component to display logs for a runner
 */
function RunnerLogsDisplay({
  runnerId,
  autoRefresh,
}: {
  runnerId: string;
  autoRefresh: boolean;
}) {
  const { logsResult, refreshLogs } = useRunnerLogs(runnerId, 50);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const renderCountRef = useRef(0);
  const refreshCountRef = useRef(0);

  // Debug: Track renders
  renderCountRef.current++;
  console.log(
    `[WatcherLogsDisplay ${runnerId}] Render #${renderCountRef.current}`,
    {
      autoRefresh,
      logsResultTag: logsResult._tag,
      waiting: logsResult.waiting,
    },
  );

  // Store refreshLogs in a ref to avoid recreating the effect
  const refreshLogsRef = useRef(refreshLogs);
  refreshLogsRef.current = refreshLogs;

  // Auto-refresh logs every 1 second if enabled
  useEffect(() => {
    if (!autoRefresh) {
      console.log(
        `[WatcherLogsDisplay ${runnerId}] Auto-refresh disabled, skipping`,
      );
      return;
    }

    console.log(
      `[WatcherLogsDisplay ${runnerId}] Starting auto-refresh (${LOG_REFRESH_INTERVAL_MS}ms interval)`,
    );

    let intervalId: number | undefined;
    let cancelled = false;

    const runRefresh = () => {
      if (cancelled) {
        console.log(`[WatcherLogsDisplay ${runnerId}] Refresh cancelled`);
        return;
      }

      refreshCountRef.current++;
      console.log(
        `[WatcherLogsDisplay ${runnerId}] Calling refreshLogs #${refreshCountRef.current}`,
      );

      // Use the ref to call the latest refreshLogs
      refreshLogsRef.current();
    };

    // Initial refresh
    runRefresh();

    // Set up interval for subsequent refreshes
    intervalId = window.setInterval(runRefresh, LOG_REFRESH_INTERVAL_MS);

    return () => {
      console.log(
        `[WatcherLogsDisplay ${runnerId}] Cleaning up auto-refresh effect`,
      );
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [autoRefresh, runnerId]); // ✅ Only depend on autoRefresh and runnerId

  // Auto-scroll to bottom when logs change (only if already at bottom)
  useEffect(() => {
    if (logsResult._tag !== "Success") return;

    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if user was already scrolled to bottom (within 50px threshold)
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      50;

    // Only auto-scroll if user was already at the bottom
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logsResult]);

  return (
    <div className="mt-2 border-t border-gray-600 pt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">Logs (last 50 entries)</span>
        <button
          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs"
          onClick={() => refreshLogs()}
          title="Refresh logs"
        >
          ↻
        </button>
      </div>
      <div
        ref={scrollContainerRef}
        className="bg-gray-900 rounded p-2 max-h-64 overflow-y-auto text-xs font-mono"
        style={{ overflowY: "auto", maxHeight: "16rem" }}
      >
        {Result.builder(logsResult)
          .onInitial(() => (
            <div className="text-gray-500">
              {logsResult.waiting ? "Loading logs..." : "Ready to load logs"}
            </div>
          ))
          .onErrorTag("NetworkError", (error: NetworkError) => (
            <div className="text-red-400">Network error: {error.message}</div>
          ))
          .onErrorTag("RunnerNotFoundError", (error: RunnerNotFoundError) => (
            <div className="text-yellow-400">
              Runner not found: {error.message}
            </div>
          ))
          .onSuccess((logs: readonly LogEntry[]) => {
            if (logs.length === 0) {
              return <div className="text-gray-500">No logs yet</div>;
            }
            return (
              <div className="space-y-1">
                {logs.map((log, idx) => (
                  <div
                    className={`${
                      log.level === "stdout"
                        ? "text-green-400"
                        : log.level === "stderr"
                          ? "text-red-400"
                          : log.level === "error"
                            ? "text-red-300"
                            : log.level === "info"
                              ? "text-blue-400"
                              : "text-gray-400"
                    }`}
                    key={idx}
                  >
                    <span className="text-gray-600">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>{" "}
                    <span className="text-gray-500">[{log.level}]</span>{" "}
                    {log.message}
                  </div>
                ))}
              </div>
            );
          })
          .onDefect((defect: unknown) => (
            <div className="text-red-400">
              Unexpected error: {String(defect)}
            </div>
          ))
          .render()}
      </div>
    </div>
  );
}

export function ProcessRunnerDevPanel() {
  const {
    runnersResult,
    createResult,
    createRunner,
    stopRunner,
    startRunner,
    refreshRunners,
  } = useProcessRunners();

  const { sessionsResult, attachToSession, refreshSessions } =
    useTmuxSessions();

  const [showPanel, setShowPanel] = useState(true);
  const [expandedWatcherId, setExpandedWatcherId] = useState<string | null>(
    null,
  );
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true); // ✅ Auto-refresh ON by default
  const hasLoggedRef = useRef(false);

  // Log welcome message only once on mount
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && !hasLoggedRef.current) {
      hasLoggedRef.current = true;

      console.log(
        "%c[Process Runner] Developer panel loaded!",
        "color: #8b5cf6; font-weight: bold",
      );
      console.log(
        "%cUse window.__DEV_PROCESS_RUNNERS__ to interact:",
        "color: #6b7280",
      );
      console.log("  • listRunners()           - List all process runners");
      console.log("  • listTmuxSessions()      - List all tmux sessions");
      console.log(
        "  • createRunner(config)    - Create new runner (config: {type, name, workingDirectory, command, args})",
      );
      console.log("  • attachToTmux(name)      - Attach to tmux session");
      console.log("  • stopRunner(id)          - Stop a runner");
      console.log("  • startRunner(id)         - Start a runner");
      console.log("  • showPanel()             - Show visual panel");
      console.log("  • hidePanel()             - Hide visual panel");
      console.log("  • getResults()            - Get current Results");
      console.log("");
      console.log("Examples:");
      console.log("  window.__DEV_PROCESS_RUNNERS__.listTmuxSessions()");
      console.log("  window.__DEV_PROCESS_RUNNERS__.createRunner({");
      console.log('    type: "custom",');
      console.log('    name: "MyRunner",');
      console.log('    workingDirectory: "/tmp",');
      console.log('    command: "bash",');
      console.log('    args: ["-c", "echo test"]');
      console.log("  })");
    }
  }, []);

  // Update API when functions/results change
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // Expose API to console
      const api = {
        // List operations
        listRunners: () => {
          console.log("[Process Runner] Listing runners...");
          refreshRunners();
          const runners: readonly ProcessRunner[] = Result.getOrElse(
            runnersResult,
            () => [],
          );
          if (runners && runners.length > 0) {
            console.table(
              runners.map((r) => ({
                id: r.id,
                name: r.name,
                type: r.type,
                status: r.status,
                pid: r.processHandle.pid,
              })),
            );
          }
          return runners;
        },

        listTmuxSessions: () => {
          console.log("[Process Runner] Listing tmux sessions...");
          refreshSessions();
          const sessions: readonly TmuxSession[] = Result.getOrElse(
            sessionsResult,
            () => [],
          );
          if (sessions && sessions.length > 0) {
            console.table(
              sessions.map((s) => ({
                name: s.name,
                attached: s.attached,
                created: s.created.toISOString(),
              })),
            );
          }
          return sessions;
        },

        // Create operations
        createRunner: (config: Partial<ProcessRunnerConfig>) => {
          console.log("[Process Runner] Creating runner...", config);
          // Build config with defaults and remove undefined fields for Effect Schema
          const fullConfig = cleanConfig({
            type: config.type || "custom",
            workingDirectory: config.workingDirectory || "/tmp",
            name: config.name,
            command: config.command,
            args: config.args,
            env: config.env,
          });

          createRunner(fullConfig as ProcessRunnerConfig);
          setTimeout(() => refreshRunners(), 500);
          console.log(
            "[Process Runner] Create request sent. Runners will refresh.",
          );
        },

        attachToTmux: (sessionName: string) => {
          console.log("[Process Runner] Attaching to tmux session:", sessionName);
          attachToSession(sessionName);
          setTimeout(() => refreshRunners(), 500);
          console.log(
            "[Process Runner] Attach request sent. Runners will refresh.",
          );
        },

        // Control operations
        stopRunner: (runnerId: string) => {
          console.log("[Process Runner] Stopping runner:", runnerId);
          stopRunner(runnerId);
          setTimeout(() => refreshRunners(), 500);
        },

        startRunner: (runnerId: string) => {
          console.log("[Process Runner] Starting runner:", runnerId);
          startRunner(runnerId);
          setTimeout(() => refreshRunners(), 500);
        },

        // UI toggle
        showPanel: () => setShowPanel(true),
        hidePanel: () => setShowPanel(false),
        togglePanel: () => setShowPanel((prev) => !prev),

        // Results
        getResults: () => ({
          runners: runnersResult,
          sessions: sessionsResult,
          createResult,
        }),
      };

      window.__DEV_PROCESS_RUNNERS__ = api;
    }

    return () => {
      if (process.env.NODE_ENV === "development") {
        delete window.__DEV_PROCESS_RUNNERS__;
      }
    };
  }, [
    runnersResult,
    sessionsResult,
    createResult,
    createRunner,
    stopRunner,
    startRunner,
    attachToSession,
    refreshRunners,
    refreshSessions,
  ]);

  if (!showPanel) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-gray-800 border border-purple-500 rounded-lg shadow-2xl z-50">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-purple-400 font-bold">Process Runner Dev Panel</h3>
        <button
          className="text-gray-400 hover:text-white"
          onClick={() => setShowPanel(false)}
        >
          ✕
        </button>
      </div>

      <div
        className="p-4 space-y-4 max-h-96 overflow-y-auto"
        style={{ overflowY: "auto" }}
      >
        {/* Tmux Sessions Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">
            Tmux Sessions
          </h4>
          <button
            className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
            onClick={() => window.__DEV_PROCESS_RUNNERS__?.listTmuxSessions()}
          >
            List Tmux Sessions
          </button>

          <div className="mt-2">
            {Result.builder(sessionsResult)
              .onInitial(() => (
                <div className="text-xs text-gray-500">
                  Click button to load sessions...
                </div>
              ))
              .onSuccess((sessions: readonly TmuxSession[]) => {
                if (sessions.length > 0) {
                  return (
                    <div className="space-y-1">
                      {sessions.map((session) => (
                        <div
                          className="text-xs p-2 bg-gray-700 rounded flex justify-between items-center"
                          key={session.name}
                        >
                          <span className="text-gray-300">{session.name}</span>
                          <button
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                            onClick={() => {
                              attachToSession(session.name);
                              // Refresh runners list after a short delay to show the new runner
                              setTimeout(() => refreshRunners(), 500);
                            }}
                          >
                            Attach
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <div className="text-xs text-gray-500">No tmux sessions</div>
                );
              })
              .onDefect((defect) => (
                <div className="text-xs text-red-400">
                  Error: {String(defect)}
                </div>
              ))
              .render()}
          </div>
        </div>

        {/* Process Runners Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-300">Process Runners</h4>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                checked={autoRefreshLogs}
                className="rounded"
                onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                type="checkbox"
              />
              Auto-refresh logs
            </label>
          </div>
          <div className="flex gap-2 mb-2">
            <button
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
              onClick={() => window.__DEV_PROCESS_RUNNERS__?.listRunners()}
            >
              List Runners
            </button>
            <button
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
              onClick={() => {
                // Only include fields with actual values - no undefined
                const config = {
                  type: "custom" as const,
                  name: `Test-${Date.now()}`,
                  workingDirectory: "/tmp",
                  command: "bash",
                  args: [
                    "-c",
                    'for i in {1..10}; do echo "Test output $i"; sleep 2; done; echo "Going idle for 1 minute..."; sleep 60; echo "Done, exiting..."',
                  ],
                };
                createRunner(config);
                setTimeout(() => refreshRunners(), 500);
              }}
              title="Create a test runner: counts to 10, goes idle for 1 min, then exits"
            >
              Create Test
            </button>
          </div>

          <div className="mt-2">
            {Result.builder(runnersResult)
              .onInitial(() => (
                <div className="text-xs text-gray-500">
                  Click button to load runners...
                </div>
              ))
              .onSuccess((runners: readonly ProcessRunner[]) => {
                if (runners.length > 0) {
                  return (
                    <div className="space-y-1">
                      {runners.map((runner) => (
                        <div
                          className="text-xs p-2 bg-gray-700 rounded"
                          key={runner.id}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300">
                                  {runner.name}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    runner.status === "running"
                                      ? "bg-green-600"
                                      : runner.status === "idle"
                                        ? "bg-yellow-600"
                                        : runner.status === "stopped"
                                          ? "bg-gray-600"
                                          : "bg-red-600"
                                  } text-white`}
                                >
                                  {runner.status}
                                </span>
                              </div>
                              <div className="text-gray-500 mt-1">
                                PID: {runner.processHandle.pid} | Type:{" "}
                                {runner.type}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                                onClick={() => {
                                  setExpandedWatcherId(
                                    expandedWatcherId === runner.id
                                      ? null
                                      : runner.id,
                                  );
                                }}
                                title={
                                  expandedWatcherId === runner.id
                                    ? "Hide logs"
                                    : "View logs"
                                }
                              >
                                {expandedWatcherId === runner.id ? "▼" : "▶"}
                              </button>
                              {runner.status === "stopped" ? (
                                <button
                                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                                  onClick={() => {
                                    startRunner(runner.id);
                                    setTimeout(() => refreshRunners(), 500);
                                  }}
                                  title="Start runner"
                                >
                                  ▶
                                </button>
                              ) : (
                                <button
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                  onClick={() => {
                                    stopRunner(runner.id);
                                    setTimeout(() => refreshRunners(), 500);
                                  }}
                                  title="Stop runner"
                                >
                                  ■
                                </button>
                              )}
                            </div>
                          </div>
                          {expandedWatcherId === runner.id && (
                            <RunnerLogsDisplay
                              autoRefresh={autoRefreshLogs}
                              runnerId={runner.id}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                return <div className="text-xs text-gray-500">No runners</div>;
              })
              .onDefect((defect) => (
                <div className="text-xs text-red-400">
                  Defect: {String(defect)}
                </div>
              ))
              .render()}
          </div>
        </div>

        {/* Console Hint */}
        <div className="text-xs text-gray-500 italic">
          See console for full API: window.__DEV_PROCESS_RUNNERS__
        </div>
      </div>
    </div>
  );
}
