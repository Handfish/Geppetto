/**
 * Source Control Components
 *
 * UI components for Git source control operations.
 *
 * Components:
 * - RepositoryExplorer: Discover and view repositories
 * - CommitGraphView: Visualize commit history
 * - CommitHistoryList: Simple commit history list
 * - BranchList: View and manage branches
 * - RemoteList: View remote configurations
 * - StatusBar: Working tree status with file operations
 * - StatusSummary: Compact status summary
 *
 * All components follow the Result.builder pattern for
 * exhaustive error handling.
 */

export { RepositoryExplorer } from './RepositoryExplorer'
export { CommitGraphView, CommitHistoryList } from './CommitGraph'
export { BranchList, RemoteList } from './BranchList'
export { StatusBar, StatusSummary } from './StatusBar'
