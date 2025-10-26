import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { WorkspaceClient } from '../lib/ipc-client'

const workspaceRuntime = Atom.runtime(WorkspaceClient.Default)

/**
 * Workspace configuration atom - holds current and recent workspace paths
 */
export const workspaceConfigAtom = workspaceRuntime
  .atom(
    Effect.gen(function* () {
      const workspaceClient = yield* WorkspaceClient
      return yield* workspaceClient.getConfig()
    })
  )
  .pipe(
    Atom.withReactivity(['workspace:config']),
    Atom.setIdleTTL(Duration.minutes(5)),
    Atom.keepAlive
  )

/**
 * Current workspace path atom - derived from config
 */
export const currentWorkspacePathAtom = Atom.make(get => {
  const configResult = get(workspaceConfigAtom)
  return Result.map(configResult, config => config.currentPath)
})

/**
 * Recent workspace paths atom - derived from config
 */
export const recentWorkspacePathsAtom = Atom.make(get => {
  const configResult = get(workspaceConfigAtom)
  return Result.map(configResult, config => config.recentPaths)
})

/**
 * Select directory atom - opens directory picker and sets the path
 */
export const selectWorkspaceDirectoryAtom = workspaceRuntime.fn(
  Effect.fnUntraced(function* () {
    const client = yield* WorkspaceClient
    const selectedPath = yield* client.selectDirectory()

    if (selectedPath) {
      yield* client.setPath(selectedPath)
    }

    return selectedPath
  }),
  {
    reactivityKeys: ['workspace:config'],
  }
)

/**
 * Set workspace path atom
 */
export const setWorkspacePathAtom = workspaceRuntime.fn(
  (params: { path: string }) =>
    Effect.gen(function* () {
      const client = yield* WorkspaceClient
      yield* client.setPath(params.path)
    }),
  {
    reactivityKeys: ['workspace:config'],
  }
)

/**
 * Clone repository to workspace atom
 */
export const cloneToWorkspaceAtom = workspaceRuntime.fn(
  (params: {
    cloneUrl: string
    repoName: string
    owner: string
    defaultBranch: string
    provider: string
  }) =>
    Effect.gen(function* () {
      const client = yield* WorkspaceClient
      return yield* client.cloneToWorkspace(params)
    }),
  {
    reactivityKeys: ['workspace:repos', 'source-control:repositories'],
  }
)

/**
 * Discover repositories in workspace atom
 * Triggers repository discovery in the current workspace
 */
export const discoverWorkspaceRepositoriesAtom = workspaceRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* WorkspaceClient
      return yield* client.discoverWorkspaceRepositories()
    })
  )
  .pipe(
    Atom.withReactivity(['workspace:repos', 'source-control:repositories']),
    Atom.setIdleTTL(Duration.seconds(30))
  )

/**
 * Get workspace repositories atom
 * Returns cached repositories from the workspace
 */
export const workspaceRepositoriesAtom = workspaceRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* WorkspaceClient
      return yield* client.getWorkspaceRepositories()
    })
  )
  .pipe(
    Atom.withReactivity(['workspace:repos', 'source-control:repositories']),
    Atom.setIdleTTL(Duration.seconds(10))
  )
