/**
 * Helper functions to map between domain and shared Repository types
 */

/**
 * Convert domain Repository to shared schema Repository
 * Maps from domain entities (with value objects) to plain serializable data
 */
export const toSharedRepository = (repo: any) => ({
  id: { value: repo.id.value },
  path: repo.path,
  name: repo.name,
  state: {
    head: repo.state.head?.value, // CommitHash -> string
    branch: repo.state.branch?.value, // BranchName -> string
    isDetached: repo.state.isDetached,
    isMerging: repo.state.isMerging,
    isRebasing: repo.state.isRebasing,
    isCherryPicking: repo.state.isCherryPicking,
    isBisecting: repo.state.isBisecting,
    isReverting: repo.state.isReverting,
  },
  branches: repo.branches.map((b: any) => ({
    name: b.name.value, // BranchName -> string
    type: b.type,
    commit: b.commit.value, // CommitHash -> string
    upstream: b.upstream?.value, // BranchName -> string
    isCurrent: b.isCurrent,
    isDetached: b.isDetached,
  })),
  remotes: repo.remotes.map((r: any) => ({
    name: r.name.value, // RemoteName -> string
    fetchUrl: r.fetchUrl.value, // RemoteUrl -> string
    pushUrl: r.pushUrl?.value, // RemoteUrl -> string
  })),
  config: repo.config
    ? {
        userName: repo.config.userName,
        userEmail: repo.config.userEmail,
        defaultBranch: repo.config.defaultBranch?.value, // BranchName -> string
      }
    : undefined,
  gitDir: repo.gitDir,
})
