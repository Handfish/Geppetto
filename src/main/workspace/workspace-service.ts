import { Effect } from 'effect'
import Store from 'electron-store'
import { dialog } from 'electron'
import { WorkspaceConfig } from '../../shared/schemas/workspace'

/**
 * WorkspaceService - Manages workspace directory configuration
 *
 * Stores the current workspace path and recent workspace paths
 * for git operations and repository management.
 */
export class WorkspaceService extends Effect.Service<WorkspaceService>()(
  'WorkspaceService',
  {
    sync: () => {
      const store = new Store({
        name: 'workspace-config',
        clearInvalidConfig: true,
      })

      return {
        /**
         * Get the current workspace configuration
         */
        getConfig: Effect.sync(() => {
          const currentPath = store.get('currentPath') as string | null | undefined
          const recentPaths = (store.get('recentPaths') as string[] | undefined) ?? []

          return new WorkspaceConfig({
            currentPath: currentPath ?? null,
            recentPaths,
          })
        }),

        /**
         * Set the workspace path
         */
        setWorkspacePath: (path: string) =>
          Effect.sync(() => {
            const recentPaths = (store.get('recentPaths') as string[] | undefined) ?? []

            // Add to recent paths if not already there
            const updatedRecentPaths = [
              path,
              ...recentPaths.filter(p => p !== path)
            ].slice(0, 10) // Keep only last 10

            store.set('currentPath', path)
            store.set('recentPaths', updatedRecentPaths)
          }),

        /**
         * Open directory picker dialog and return selected path
         */
        selectDirectory: Effect.promise(async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
            title: 'Select Workspace Directory',
            buttonLabel: 'Select Workspace',
          })

          if (result.canceled || result.filePaths.length === 0) {
            return null
          }

          return result.filePaths[0]
        }),

        /**
         * Clear the current workspace path
         */
        clearWorkspacePath: Effect.sync(() => {
          store.delete('currentPath')
        }),
      }
    },
  }
) {}
