import { Schema as S } from 'effect'

/**
 * Workspace path - the directory where git operations will be performed
 */
export class WorkspacePath extends S.Class<WorkspacePath>('WorkspacePath')({
  path: S.String,
}) {}

/**
 * Workspace configuration stored in electron-store
 */
export class WorkspaceConfig extends S.Class<WorkspaceConfig>('WorkspaceConfig')({
  currentPath: S.NullOr(S.String),
  recentPaths: S.Array(S.String),
}) {}
