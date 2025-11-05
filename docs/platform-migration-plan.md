# Effect Platform Migration Plan

## Overview

Migrate custom Node.js API wrappers to stable `@effect/platform` modules (Command, FileSystem, Path) while preserving hexagonal architecture and domain-specific error handling.

**Status**: Not Started
**Target Completion**: 5 days
**Primary Goal**: Reduce custom infrastructure code by ~1,200 lines while maintaining type safety and architectural patterns

---

## Current State Analysis

### Custom Implementations (~1,733 lines)

1. **NodeFileSystemAdapter** (432 lines)
   - Location: `src/main/source-control/adapters/file-system/node-file-system-adapter.ts`
   - Wraps: `node:fs/promises`, `node:fs`, `chokidar`
   - Operations: file I/O, directory operations, file watching, path utilities

2. **NodeGitCommandRunner** (~200 lines)
   - Location: `src/main/source-control/adapters/git/node-git-command-runner.ts`
   - Wraps: `node:child_process.spawn`
   - Operations: git command execution, streaming, timeout handling

3. **TmuxSessionManagerAdapter** (319 lines)
   - Location: `src/main/ai-runners/adapters/tmux-session-manager-adapter.ts`
   - Wraps: `node:child_process.exec`, `node:child_process.spawn`
   - Operations: tmux session management, FIFO piping

4. **NodeProcessMonitorAdapter** (782 lines)
   - Location: `src/main/ai-runners/adapters/node-process-monitor-adapter.ts`
   - Wraps: `node:child_process.spawn`, `node:fs`, `node:path`
   - Operations: process spawning, monitoring, silence detection

### Direct Node.js API Usage

- **Path operations**: 50+ files using `node:path`
- **File system**: 12+ files using `node:fs/promises`
- **Child process**: 18 files using `node:child_process`

---

## Target State

### @effect/platform Integration

```typescript
// Platform services provided via CoreInfrastructureLayer
import { FileSystem, Path, Command } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"

const PlatformLayer = NodeContext.layer

// Adapters use platform services internally
Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const executor = yield* CommandExecutor.CommandExecutor

  // Domain-specific error mapping
  return fs.readFileString(filePath).pipe(
    Effect.mapError(platformError => new FileNotFoundError({ ... }))
  )
})
```

---

## Phase 1: Foundation Setup

**Duration**: 1 hour
**Risk**: Low
**Prerequisites**: None

### 1.1 Update Dependencies

```bash
pnpm update @effect/platform@latest @effect/platform-node@latest
```

**Expected versions**: 0.93.x or later

### 1.2 Create Platform Infrastructure Layer

**New file**: `src/main/platform/platform-layer.ts`

```typescript
import { NodeContext } from "@effect/platform-node"
import { Layer } from "effect"

/**
 * Provides Effect Platform services:
 * - FileSystem: File and directory operations
 * - Path: Cross-platform path manipulation
 * - CommandExecutor: Shell command execution
 * - Terminal: Terminal operations
 */
export const PlatformLayer = NodeContext.layer
```

### 1.3 Update Core Infrastructure Layer

**File**: `src/main/core-infrastructure-layer.ts`

```typescript
import { PlatformLayer } from './platform/platform-layer'

export const CoreInfrastructureLayer = Layer.mergeAll(
  PlatformLayer,  // ← Add this first
  SessionService.Default,
  SecureStoreService.Default,
  TierService.Default,
  AccountContextService.Default
)
```

### 1.4 Create Migration Log

**New file**: `docs/platform-migration-log.md`

```markdown
# Platform Migration Log

## Phase 1: Foundation - [Date]
- ✅ Updated @effect/platform to vX.X.X
- ✅ Created PlatformLayer
- ✅ Integrated into CoreInfrastructureLayer
- Tests: All passing
```

### 1.5 Verification

```bash
# Build should succeed
pnpm compile:app

# Tests should pass
pnpm test

# App should run
pnpm dev
```

**Success Criteria**:
- ✅ No compilation errors
- ✅ All existing tests pass
- ✅ Application runs without errors
- ✅ Platform services available via `yield* FileSystem.FileSystem`, etc.

---

## Phase 2: Path Migration

**Duration**: 2-3 hours
**Risk**: Low
**Impact**: 50+ files

### 2.1 Update FileSystemPort Path Methods

**File**: `src/main/source-control/adapters/file-system/node-file-system-adapter.ts`

**Before**:
```typescript
import path from 'node:path'

resolvePath: (filePath: string) => Effect.succeed(path.resolve(filePath))
```

**After**:
```typescript
import { Path } from "@effect/platform"

// Update Effect.Service
export class NodeFileSystemAdapter extends Effect.Service<NodeFileSystemAdapter>()
  ('NodeFileSystemAdapter', {
    effect: Effect.gen(function* () {
      const path = yield* Path.Path  // ← Inject Path service

      const adapter: FileSystemPort = {
        resolvePath: (filePath: string) => path.resolve(filePath),
        dirname: (filePath: string) => Effect.succeed(path.dirname(filePath)),
        basename: (filePath: string, ext?: string) =>
          Effect.succeed(path.basename(filePath, ext)),
        joinPath: (...components: string[]) =>
          Effect.succeed(path.join(...components))
      }
      return adapter
    }),
    dependencies: [Path.Path.Default]  // ← Declare dependency
  })
```

### 2.2 Replace Direct path Imports in Services

**Pattern**: Replace in all Effect.gen contexts

**Files to update**:
- `src/main/workspace/workspace-service.ts`
- `src/main/source-control/services/*.ts`
- `src/main/ai-runners/adapters/*.ts`

**Before**:
```typescript
import path from 'node:path'

Effect.gen(function* () {
  const fullPath = path.join(base, relative)
})
```

**After**:
```typescript
import { Path } from "@effect/platform"

Effect.gen(function* () {
  const path = yield* Path.Path
  const fullPath = path.join(base, relative)
})
```

### 2.3 Testing

```bash
# Run source control tests
pnpm test src/main/source-control

# Manual verification
pnpm dev
# - Clone repository
# - Open repository
# - Verify paths are correct
```

**Success Criteria**:
- ✅ All tests pass
- ✅ Repository operations work correctly
- ✅ Paths are cross-platform compatible
- ✅ No `node:path` imports in main process (except build scripts)

---

## Phase 3: FileSystem Migration

**Duration**: 4-6 hours
**Risk**: Low-Medium
**Impact**: Core abstraction

### 3.1 Update NodeFileSystemAdapter Core Methods

**File**: `src/main/source-control/adapters/file-system/node-file-system-adapter.ts`

**Strategy**: Replace node:fs with @effect/platform/FileSystem, map errors to domain types

```typescript
import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"

export class NodeFileSystemAdapter extends Effect.Service<NodeFileSystemAdapter>()
  ('NodeFileSystemAdapter', {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const adapter: FileSystemPort = {
        // File reading
        readFile: (filePath: string) =>
          fs.readFileString(filePath).pipe(
            Effect.mapError((platformError) => {
              if (platformError._tag === 'SystemError' &&
                  platformError.reason === 'NotFound') {
                return new FileNotFoundError({ path: filePath })
              }
              return new FileSystemError({
                message: `Failed to read file: ${filePath}`,
                cause: platformError
              })
            })
          ),

        // File existence
        fileExists: (filePath: string) =>
          fs.exists(filePath),

        // Directory existence
        directoryExists: (dirPath: string) =>
          fs.exists(dirPath).pipe(
            Effect.flatMap((exists) =>
              exists
                ? fs.stat(dirPath).pipe(
                    Effect.map((info) => info.type === 'Directory'),
                    Effect.catchAll(() => Effect.succeed(false))
                  )
                : Effect.succeed(false)
            )
          ),

        // Binary file reading
        readFileBytes: (filePath: string) =>
          fs.readFile(filePath).pipe(
            Effect.mapError((platformError) =>
              new FileSystemError({
                message: `Failed to read file bytes: ${filePath}`,
                cause: platformError
              })
            )
          ),

        // Directory listing
        listDirectory: (dirPath: string) =>
          fs.readDirectory(dirPath).pipe(
            Effect.map((entries) =>
              entries.map((name) => ({
                name,
                path: path.join(dirPath, name),
                type: 'unknown' as const
              }))
            ),
            Effect.mapError((platformError) =>
              new FileSystemError({
                message: `Failed to list directory: ${dirPath}`,
                cause: platformError
              })
            )
          ),

        // File metadata
        stat: (filePath: string) =>
          fs.stat(filePath).pipe(
            Effect.map((info) => ({
              size: info.size,
              isFile: info.type === 'File',
              isDirectory: info.type === 'Directory',
              modifiedTime: new Date(info.mtime)
            })),
            Effect.mapError((platformError) =>
              new FileSystemError({
                message: `Failed to stat: ${filePath}`,
                cause: platformError
              })
            )
          )
      }

      return adapter
    }),
    dependencies: [FileSystem.FileSystem.Default, Path.Path.Default]
  })
```

### 3.2 Handle File Watching

**Decision**: Keep `chokidar` implementation for now

**Rationale**:
- `@effect/platform` doesn't have built-in file watching yet
- Current implementation is stable
- Migrate later when platform adds native support

**Action**: Leave `watchDirectory` method unchanged

### 3.3 Update Direct fs Usage

**Files**:
- `src/main/workspace/workspace-service.ts`
- `src/main/ai-runners/adapters/node-process-monitor-adapter.ts`

**Before**:
```typescript
import { promises as fs } from 'fs'

const checkPath = (pathToCheck: string) =>
  Effect.tryPromise({
    try: () => fs.access(pathToCheck),
    catch: () => new Error('Path does not exist')
  })
```

**After**:
```typescript
import { FileSystem } from "@effect/platform"

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const exists = yield* fs.exists(pathToCheck)

  if (!exists) {
    return yield* Effect.fail(new Error('Path does not exist'))
  }
})
```

### 3.4 Testing

```bash
# Run all tests
pnpm test

# Specific test suites
pnpm test src/main/source-control
pnpm test src/main/workspace

# Manual verification
pnpm dev
# - Clone repository
# - Browse files
# - Open files
# - Create/delete files
```

**Success Criteria**:
- ✅ All file operations work correctly
- ✅ Error handling preserves domain errors
- ✅ Git repository detection works
- ✅ File watching still functional (chokidar)
- ✅ No `node:fs` imports except in deprecated adapters

---

## Phase 4: Git Command Migration

**Duration**: 6-8 hours
**Risk**: Medium
**Impact**: Core git operations

### 4.1 Understand API Mapping

**Current API**:
```typescript
const result = yield* gitCommandRunner.run({
  args: ['status', '--porcelain'],
  worktree,
  stdin: undefined,
  timeout: Duration.seconds(30)
})
// Returns: { stdout: string, stderr: string, exitCode: number }
```

**Platform API**:
```typescript
const command = Command.make('git', 'status', '--porcelain')
const output = yield* Command.string(command)
// Returns: string (stdout only)

// For full control:
const process = yield* Command.start(command)
const [exitCode, stdout, stderr] = yield* Effect.all([
  process.exitCode,
  streamToString(process.stdout),
  streamToString(process.stderr)
])
```

### 4.2 Migrate NodeGitCommandRunner

**File**: `src/main/source-control/adapters/git/node-git-command-runner.ts`

**Strategy**: Replace spawn logic with Command API, preserve error types

```typescript
import { Command, CommandExecutor } from "@effect/platform"
import { Effect, Stream, Duration, Option } from "effect"

export class NodeGitCommandRunner extends Effect.Service<NodeGitCommandRunner>()
  ('NodeGitCommandRunner', {
    effect: Effect.gen(function* () {
      const executor = yield* CommandExecutor.CommandExecutor

      const runner: GitCommandRunnerPort = {
        run: (request) => Effect.gen(function* () {
          const { args, worktree, stdin, allowInteractive, timeout } = request

          // Build command
          let command = Command.make('git', ...args).pipe(
            Command.workingDirectory(worktree.repositoryPath),
            Command.env({
              GIT_DIR: worktree.repositoryPath,
              GIT_TERMINAL_PROMPT: '0',
              GIT_ASKPASS: '',
              ...process.env
            })
          )

          // Handle stdin
          if (stdin) {
            command = Command.feed(command, stdin)
          }

          // Handle interactive mode
          if (allowInteractive) {
            command = Command.stdin(command, 'inherit')
            command = Command.stdout(command, 'inherit')
          }

          // Start process
          const process = yield* Command.start(command)

          // Apply timeout if specified
          const exitCodeEffect = timeout
            ? Effect.timeout(process.exitCode, timeout).pipe(
                Effect.flatMap(
                  Option.match({
                    onNone: () => Effect.fail(
                      new GitCommandTimedOutError({
                        args,
                        timeout: Duration.toMillis(timeout),
                        repositoryPath: worktree.repositoryPath
                      })
                    ),
                    onSome: Effect.succeed
                  })
                )
              )
            : process.exitCode

          // Collect output and wait for exit
          const [exitCode, stdout, stderr] = yield* Effect.all([
            exitCodeEffect,
            allowInteractive
              ? Effect.succeed('')
              : streamToString(process.stdout),
            allowInteractive
              ? Effect.succeed('')
              : streamToString(process.stderr)
          ], { concurrency: 3 })

          // Map exit codes to errors
          if (exitCode !== 0) {
            return yield* Effect.fail(
              new GitCommandFailedError({
                args,
                exitCode,
                stdout,
                stderr,
                repositoryPath: worktree.repositoryPath
              })
            )
          }

          return { stdout, stderr, exitCode }
        }).pipe(Effect.scoped)
      }

      return runner
    }),
    dependencies: [CommandExecutor.CommandExecutor.Default]
  })

// Helper: Convert stream to string
const streamToString = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold('', (acc, chunk) => acc + chunk)
  )
```

### 4.3 Handle Streaming for Progress

**Use case**: Git clone with progress reporting

```typescript
// For operations that need real-time output
const streamGitProgress = (args: string[], worktree: Worktree) =>
  Effect.gen(function* () {
    const command = Command.make('git', ...args).pipe(
      Command.workingDirectory(worktree.repositoryPath),
      Command.env({ /* ... */ })
    )

    const process = yield* Command.start(command)

    // Stream stderr for git progress
    yield* process.stderr.pipe(
      Stream.decodeText(),
      Stream.tap((chunk) => Effect.sync(() => {
        // Emit to renderer via IPC
        mainWindow?.webContents.send('git:progress', chunk)
      })),
      Stream.runDrain
    )

    const exitCode = yield* process.exitCode
    return exitCode
  }).pipe(Effect.scoped)
```

### 4.4 Update Error Mapping

**File**: `src/main/source-control/adapters/git/node-git-command-runner.ts`

```typescript
import { CommandError } from "@effect/platform/CommandExecutor"

const mapCommandError = (
  error: CommandError,
  args: string[],
  repositoryPath: string
): GitCommandError => {
  if (error._tag === 'SystemError') {
    return new GitCommandSpawnError({
      message: `Failed to spawn git: ${error.reason}`,
      args,
      repositoryPath,
      cause: error
    })
  }

  // Other error mappings...
  return new GitCommandError({
    message: `Git command failed: ${error}`,
    args,
    repositoryPath,
    cause: error
  })
}
```

### 4.5 Testing

```bash
# Run git operation tests
pnpm test src/main/source-control

# Manual verification
pnpm dev
# - Clone repository (check progress)
# - Make changes and commit
# - Push/pull (authentication)
# - Sync operations
# - Test timeout (long operation)
```

**Critical test cases**:
- ✅ `git status` - basic command
- ✅ `git clone` - long-running with progress
- ✅ `git commit` - stdin handling
- ✅ `git fetch` - authentication
- ✅ Timeout handling
- ✅ Error code mapping

**Success Criteria**:
- ✅ All git operations work
- ✅ Progress streaming functional
- ✅ Error types preserved
- ✅ Timeout handling works
- ✅ No `node:child_process` imports in git adapters

---

## Phase 5: Tmux/Process Migration

**Duration**: 8-12 hours
**Risk**: Medium-High
**Impact**: AI runners feature

### 5.1 Migrate TmuxSessionManagerAdapter

**File**: `src/main/ai-runners/adapters/tmux-session-manager-adapter.ts`

**Strategy**: Replace exec/spawn with Command API

```typescript
import { Command } from "@effect/platform"
import { Effect } from "effect"

export class TmuxSessionManagerAdapter extends Effect.Service<TmuxSessionManagerAdapter>()
  ('TmuxSessionManagerAdapter', {
    effect: Effect.gen(function* () {

      const manager: SessionManagerPort = {
        createSession: (config) => Effect.gen(function* () {
          // Create tmux session
          const command = Command.make(
            'tmux',
            'new-session',
            '-d',
            '-s', config.name,
            '-c', config.cwd
          )

          const exitCode = yield* Command.exitCode(command)

          if (exitCode !== 0) {
            return yield* Effect.fail(
              new SessionManagerError({
                message: `Failed to create tmux session: ${config.name}`
              })
            )
          }

          return config.name
        }),

        terminateSession: (sessionName) => Effect.gen(function* () {
          const command = Command.make('tmux', 'kill-session', '-t', sessionName)
          yield* Command.exitCode(command)
        }),

        listSessions: () => Effect.gen(function* () {
          const command = Command.make('tmux', 'list-sessions', '-F', '#{session_name}')
          const output = yield* Command.string(command).pipe(
            Effect.catchAll(() => Effect.succeed(''))
          )
          return output.split('\n').filter(Boolean)
        })
      }

      return manager
    })
  })
```

### 5.2 Handle FIFO Creation

**Strategy**: Combine FileSystem + Command

```typescript
import { FileSystem, Path, Command } from "@effect/platform"

const createTempFifo = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    // Create temp directory (scoped - auto cleanup)
    const tempDir = yield* fs.makeTempDirectoryScoped()
    const fifoPath = path.join(tempDir, 'output.fifo')

    // Create FIFO
    const mkfifoCommand = Command.make('mkfifo', fifoPath)
    const exitCode = yield* Command.exitCode(mkfifoCommand)

    if (exitCode !== 0) {
      return yield* Effect.fail(new Error(`Failed to create FIFO: ${fifoPath}`))
    }

    return fifoPath
  })
```

### 5.3 Migrate NodeProcessMonitorAdapter

**File**: `src/main/ai-runners/adapters/node-process-monitor-adapter.ts`

**Strategy**: Tmux process spawning + FIFO streaming

```typescript
import { Command, FileSystem, Path } from "@effect/platform"
import { Effect, Stream } from "effect"

export class NodeProcessMonitorAdapter extends Effect.Service<NodeProcessMonitorAdapter>()
  ('NodeProcessMonitorAdapter', {
    effect: Effect.gen(function* () {

      const monitor: ProcessMonitorPort = {
        spawnAndMonitor: (config) => Effect.gen(function* () {
          // Create tmux session
          const sessionName = `monitor-${Date.now()}`
          const createSessionCommand = Command.make(
            'tmux',
            'new-session',
            '-d',
            '-s', sessionName
          )
          yield* Command.exitCode(createSessionCommand)

          // Create FIFO for output
          const fifoPath = yield* createTempFifo()

          // Pipe tmux pane output to FIFO
          const pipeCommand = Command.make(
            'tmux',
            'pipe-pane',
            '-t', `${sessionName}:0`,
            '-o', `cat >> ${fifoPath}`
          )
          yield* Command.exitCode(pipeCommand)

          // Spawn process in tmux
          const spawnCommand = Command.make(
            'tmux',
            'send-keys',
            '-t', sessionName,
            config.command,
            'Enter'
          )
          yield* Command.exitCode(spawnCommand)

          // Stream from FIFO
          const fs = yield* FileSystem.FileSystem
          const outputStream = fs.stream(fifoPath).pipe(
            Stream.decodeText()
          )

          return {
            sessionName,
            outputStream,
            cleanup: () => killTmuxSession(sessionName)
          }
        }).pipe(Effect.scoped)
      }

      return monitor
    }),
    dependencies: [
      FileSystem.FileSystem.Default,
      Path.Path.Default
    ]
  })

const killTmuxSession = (sessionName: string) =>
  Effect.gen(function* () {
    const command = Command.make('tmux', 'kill-session', '-t', sessionName)
    yield* Command.exitCode(command).pipe(
      Effect.catchAll(() => Effect.succeed(0))
    )
  })
```

### 5.4 Testing

```bash
# Run AI runner tests
pnpm test src/main/ai-runners

# Manual verification (requires tmux installed)
pnpm dev
# - Start AI runner
# - Verify output streaming
# - Verify silence detection
# - Verify cleanup on exit
```

**Test cases**:
- ✅ Session creation/termination
- ✅ FIFO creation and cleanup
- ✅ Process spawning in tmux
- ✅ Output streaming from FIFO
- ✅ Silence detection
- ✅ Cleanup on errors

**Success Criteria**:
- ✅ AI runners functional
- ✅ Tmux operations work
- ✅ Output streaming reliable
- ✅ Cleanup prevents leaks
- ✅ No `node:child_process` imports

---

## Phase 6: Cleanup & Documentation

**Duration**: 2-3 hours
**Risk**: Low
**Impact**: Code quality

### 6.1 Remove Deprecated Imports

**Search pattern**:
```bash
# Find remaining node:path imports
grep -r "from 'node:path'" src/main

# Find remaining node:fs imports
grep -r "from 'node:fs" src/main

# Find remaining child_process imports
grep -r "from 'node:child_process'" src/main
```

**Action**: Replace or remove all remaining imports

### 6.2 Delete Old Adapter Files

**Backup first**:
```bash
git checkout -b backup/pre-platform-migration
```

**Files to archive** (rename to .old):
- Old implementation backups
- Unused adapter code

**Do NOT delete**:
- Port definitions (interfaces)
- Domain error types
- Tests

### 6.3 Update Documentation

**Files to update**:

1. **CLAUDE.md** - Architecture section
```markdown
## Effect Platform Integration

This project uses `@effect/platform` for cross-platform system operations:
- `FileSystem`: File and directory operations
- `Path`: Path manipulation
- `Command`: Shell command execution

All platform services are provided via `PlatformLayer` in `CoreInfrastructureLayer`.
```

2. **docs/EFFECT_ATOM_IPC_GUIDE.md** - Add platform examples

3. **README.md** - Update dependencies

### 6.4 Create Platform Usage Guide

**New file**: `docs/PLATFORM_USAGE.md`

```markdown
# Effect Platform Usage Guide

## Available Services

### FileSystem

```typescript
import { FileSystem } from "@effect/platform"

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem

  // Read file
  const content = yield* fs.readFileString('/path/to/file')

  // Check existence
  const exists = yield* fs.exists('/path/to/file')

  // List directory
  const entries = yield* fs.readDirectory('/path/to/dir')
})
```

### Path

```typescript
import { Path } from "@effect/platform"

Effect.gen(function* () {
  const path = yield* Path.Path

  // Join paths
  const fullPath = path.join(base, relative)

  // Get directory
  const dir = path.dirname(fullPath)
})
```

### Command

```typescript
import { Command } from "@effect/platform"

Effect.gen(function* () {
  // Simple command
  const output = yield* Command.string(
    Command.make('ls', '-al')
  )

  // With working directory
  const command = Command.make('git', 'status').pipe(
    Command.workingDirectory('/path/to/repo')
  )

  // Streaming
  const process = yield* Command.start(command)
  const exitCode = yield* process.exitCode
})
```
```

### 6.5 Final Testing

```bash
# Clean build
pnpm clean:dev
pnpm compile:app

# Full test suite
pnpm test

# Run both tiers
pnpm dev:free
pnpm dev:pro

# Build packages
pnpm build:all
```

**Success Criteria**:
- ✅ No compilation errors
- ✅ All tests pass
- ✅ Both tiers build successfully
- ✅ No deprecated imports
- ✅ Documentation updated

---

## Rollback Procedures

### Quick Rollback (Feature Flag)

**File**: `src/main/core-infrastructure-layer.ts`

```typescript
const USE_PLATFORM = false  // Toggle here

export const CoreInfrastructureLayer = USE_PLATFORM
  ? Layer.mergeAll(PlatformLayer, /* new adapters */)
  : Layer.mergeAll(/* old adapters */)
```

### Full Rollback (Git)

```bash
# Revert all changes
git checkout main
git branch -D migration/effect-platform

# Restore from backup
git checkout backup/pre-platform-migration
git checkout -b migration/effect-platform-retry
```

### Partial Rollback (Per Adapter)

Keep both implementations side-by-side with feature flags:

```typescript
const USE_NEW_GIT_RUNNER = false

const GitInfrastructureLayer = USE_NEW_GIT_RUNNER
  ? PlatformGitCommandRunner.Default
  : NodeGitCommandRunner.Default
```

---

## Success Metrics

### Code Reduction

**Target**: ~60-70% reduction in adapter code

| Component | Before | After | Savings |
|-----------|--------|-------|---------|
| FileSystemAdapter | 432 lines | ~150 lines | 282 lines |
| GitCommandRunner | 200 lines | ~80 lines | 120 lines |
| TmuxSessionManager | 319 lines | ~120 lines | 199 lines |
| ProcessMonitor | 782 lines | ~200 lines | 582 lines |
| **Total** | **1,733 lines** | **~550 lines** | **~1,183 lines** |

### Performance Benchmarks

**Measure**:
- Git command execution time (clone, status, commit)
- File system operation throughput (read, write, list)
- Memory usage during operations

**Expected**: Comparable or improved performance

### Reliability

**Track**:
- Cross-platform compatibility (Windows, macOS, Linux)
- Error handling coverage
- Edge case handling

---

## Known Issues & Workarounds

### Issue: File Watching Not in Platform

**Status**: `@effect/platform` doesn't have file watching yet

**Workaround**: Keep `chokidar` implementation in `watchDirectory` method

**Future**: Migrate when platform adds native support

### Issue: FIFO Creation Platform Support

**Status**: Need to verify FIFO support across platforms

**Workaround**: Use `mkfifo` command via Command API

**Future**: May need platform-specific implementations

### Issue: Tmux Not Available on Windows

**Status**: Tmux is Unix-only

**Workaround**: AI runners feature disabled on Windows or use alternative

**Future**: Consider Windows-specific implementation (named pipes?)

---

## Dependencies

### Required Versions

```json
{
  "@effect/platform": "^0.93.0",
  "@effect/platform-node": "^0.93.0",
  "effect": "^3.0.0"
}
```

### Optional Testing Tools

- `tmux` - For AI runner testing
- Git - For command runner testing

---

## Timeline & Milestones

### Week 1: Foundation & Quick Wins (3 days)

- **Day 1**: Phase 1 (Setup) + Phase 2 (Path) - 4 hours
- **Day 2**: Phase 3 (FileSystem) - 6 hours
- **Day 3**: Phase 4 (Git Commands) - 8 hours

**Milestone**: Core functionality migrated, all git operations working

### Week 2: Complex Features & Polish (2 days)

- **Day 4**: Phase 5 (Tmux/Process) - 10 hours
- **Day 5**: Phase 6 (Cleanup + Docs) - 3 hours

**Milestone**: Full migration complete, documentation updated

### Buffer: 1-2 days for unforeseen issues

---

## Questions & Research Needed

### Before Phase 3

- [ ] Does `@effect/platform/FileSystem` support file watching?
- [ ] What are the exact error types returned by platform APIs?
- [ ] Is `fs.makeTempDirectoryScoped()` available?

### Before Phase 4

- [ ] Does Command API support real-time streaming?
- [ ] How does Command handle process cancellation?
- [ ] Are there git-specific command helpers?

### Before Phase 5

- [ ] Can Command API create FIFOs reliably?
- [ ] Is tmux functionality testable in CI?
- [ ] What's the Windows alternative to tmux?

---

## Next Steps

1. ✅ Read and understand this plan
2. ✅ Create backup branch
3. ✅ Start Phase 1 (Foundation Setup)
4. ✅ Update progress tracker after each phase
5. ✅ Test thoroughly before moving to next phase
6. ✅ Update migration log with findings
