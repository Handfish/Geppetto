/**
 * Workspace Management IPC Handlers
 *
 * Handles IPC communication for workspace directory management using the generic
 * registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect } from 'effect'
import { BrowserWindow } from 'electron'
import { WorkspaceIpcContracts } from '../../shared/ipc-contracts'
import { WorkspaceService } from '../workspace/workspace-service'
import { registerIpcHandler } from './ipc-handler-setup'
import { toSharedRepository } from './repository-mapper'

/**
 * Setup workspace IPC handlers
 */
export const setupWorkspaceIpcHandlers = Effect.gen(function* () {
  const workspaceService = yield* WorkspaceService

  /**
   * Broadcast workspace change to all windows
   */
  const broadcastWorkspaceChange = () => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('workspace:changed')
    })
  }

  // Get workspace configuration
  registerIpcHandler(WorkspaceIpcContracts.getWorkspaceConfig, () =>
    workspaceService.getConfig
  )

  // Set workspace path
  registerIpcHandler(WorkspaceIpcContracts.setWorkspacePath, (input) =>
    Effect.gen(function* () {
      yield* workspaceService.setWorkspacePath(input.path)
      broadcastWorkspaceChange()
    })
  )

  // Select workspace directory via dialog
  registerIpcHandler(WorkspaceIpcContracts.selectWorkspaceDirectory, () =>
    workspaceService.selectDirectory
  )

  // Clone repository to workspace
  registerIpcHandler(WorkspaceIpcContracts.cloneToWorkspace, (input) =>
    workspaceService.cloneToWorkspace(
      input.cloneUrl,
      input.repoName,
      input.owner,
      input.defaultBranch,
      input.provider
    )
  )

  // Check if repository exists in workspace
  registerIpcHandler(WorkspaceIpcContracts.checkRepositoryInWorkspace, (input) =>
    workspaceService.checkRepositoryInWorkspace(
      input.owner,
      input.repoName,
      input.provider,
      input.defaultBranch
    )
  )

  // Discover repositories in current workspace
  registerIpcHandler(WorkspaceIpcContracts.discoverWorkspaceRepositories, () =>
    workspaceService.discoverWorkspaceRepositories().pipe(
      Effect.map((repos: any) => repos.map(toSharedRepository))
    )
  )

  // Get cached repositories from workspace
  registerIpcHandler(WorkspaceIpcContracts.getWorkspaceRepositories, () =>
    workspaceService.getWorkspaceRepositories().pipe(
      Effect.map((repos: any) => repos.map(toSharedRepository))
    )
  )
})
