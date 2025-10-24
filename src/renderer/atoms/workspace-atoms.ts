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
    Atom.setIdleTTL(Duration.minutes(5))
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
