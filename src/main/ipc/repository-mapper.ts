/**
 * Helper functions to map between domain and shared Repository types
 */

/**
 * Convert domain Repository to shared schema Repository
 * Maps from domain entities (with value objects) to plain data.
 * Effect Schema will automatically apply branding during encoding/validation.
 */
export const toSharedRepository = (repo: any) => ({
  id: { value: repo.id.value }, // Plain UUID string - schema will brand it
  path: repo.path,
  name: repo.name,
  state: {
    // Extract plain strings - schema will brand them automatically
    head: repo.state.head?.value,
    branch: repo.state.branch?.value,
    isDetached: repo.state.isDetached,
    isMerging: repo.state.isMerging,
    isRebasing: repo.state.isRebasing,
    isCherryPicking: repo.state.isCherryPicking,
    isBisecting: repo.state.isBisecting,
    isReverting: repo.state.isReverting,
  },
  branches: repo.branches.map((b: any) => ({
    name: b.name.value, // Plain string - schema will brand it
    type: b.type,
    commit: b.commit.value, // Plain string - schema will brand it
    upstream: b.upstream?.value,
    isCurrent: b.isCurrent,
    isDetached: b.isDetached,
  })),
  remotes: repo.remotes.map((r: any) => ({
    name: r.name.value, // Plain string - schema will brand it
    fetchUrl: r.fetchUrl.value, // Plain string - schema will brand it
    pushUrl: r.pushUrl?.value,
  })),
  config: repo.config
    ? {
        userName: repo.config.userName,
        userEmail: repo.config.userEmail,
        defaultBranch: repo.config.defaultBranch?.value,
      }
    : undefined,
  gitDir: repo.gitDir,
})
