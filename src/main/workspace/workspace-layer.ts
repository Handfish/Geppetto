import { Layer } from "effect";
import { WorkspaceService } from "./workspace-service";

/**
 * Workspace Domain Layer
 *
 * Orchestrates workspace-level operations across all domains:
 * - Workspace configuration and directory management
 * - Repository discovery within workspace
 * - Git clone operations with bare repo + worktree pattern
 * - Integration with source control and VCS provider domains
 *
 * This is a simple orchestration layer (no adapters needed):
 * - Coordinates between Source Control and VCS domains
 * - Manages workspace-scoped state via electron-store
 * - No infrastructure adapters (uses existing services)
 * - No multiple implementations (single service)
 *
 * Dependencies:
 * - GitCommandService (source-control domain)
 * - RepositoryService (source-control domain)
 *
 * Usage:
 * ```typescript
 * const workspace = yield* WorkspaceService
 * const config = yield* workspace.getConfig
 * const repos = yield* workspace.discoverWorkspaceRepositories
 * ```
 */
export const WorkspaceDomainLayer = Layer.mergeAll(WorkspaceService.Default);
