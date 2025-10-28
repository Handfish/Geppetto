import { Effect } from 'effect'
import { registerIpcHandler } from './ipc-handler-setup'
import { SourceControlIpcContracts } from '../../shared/ipc-contracts'
import { RepositoryService } from '../source-control/services/repository-service'
import { CommitGraphService } from '../source-control/services/commit-graph-service'
import { makeCommitHash } from '../source-control/domain/value-objects/commit-hash'
import { makeBranchName } from '../source-control/domain/value-objects/branch-name'
import {
  RepositoryId as DomainRepositoryId,
  Repository,
  RepositoryMetadata,
  RepositoryDiscoveryInfo,
} from '../source-control/domain/aggregates/repository'
import {
  GraphOptions as DomainGraphOptions,
  CommitGraph,
  GraphStatistics,
} from '../source-control/domain/aggregates/commit-graph'
import { Commit, CommitWithRefs } from '../source-control/domain/entities/commit'
import { toSharedRepository } from './repository-mapper'
import type { RepositoryManagementPort } from '../source-control/ports/primary/repository-management-port'
import type { CommitOperationsPort } from '../source-control/ports/primary/commit-operations-port'

/**
 * Setup Source Control IPC Handlers
 *
 * Registers all IPC handlers for source control operations.
 * Uses registerIpcHandler utility for type-safe handler registration.
 *
 * Dependencies:
 * - RepositoryService: For repository operations
 * - CommitGraphService: For commit graph operations
 */
export const setupSourceControlIpcHandlers = Effect.gen(function* () {
  const repoService = yield* RepositoryService
  const commitService = yield* CommitGraphService

  /**
   * Helper: Convert shared schema RepositoryId to domain RepositoryId
   */
  const toDomainRepositoryId = (id: { value: string }): DomainRepositoryId => {
    return new DomainRepositoryId({ value: id.value })
  }

  /**
   * Helper: Convert shared schema GraphOptions to domain GraphOptions
   */
  const toDomainGraphOptions = (
    options?: {
      maxCommits: number
      includeBranches?: readonly string[]
      excludeBranches?: readonly string[]
      since?: Date
      until?: Date
      author?: string
      layoutAlgorithm: 'topological' | 'lane-based' | 'sugiyama'
    }
  ): DomainGraphOptions | undefined => {
    if (!options) return undefined

    return new DomainGraphOptions({
      maxCommits: options.maxCommits,
      includeBranches: options.includeBranches ? [...options.includeBranches].map(makeBranchName) : undefined,
      excludeBranches: options.excludeBranches ? [...options.excludeBranches].map(makeBranchName) : undefined,
      since: options.since,
      until: options.until,
      author: options.author,
      layoutAlgorithm: options.layoutAlgorithm,
    })
  }


  /**
   * Helper: Convert domain CommitGraph to shared schema CommitGraph
   */
  const toSharedCommitGraph = (graph: any) => ({
    repositoryId: { value: graph.repositoryId.value },
    nodes: graph.nodes.map((n: any) => ({
      id: n.id.value, // CommitHash is a branded string
      commit: {
        hash: n.commit.hash.value, // CommitHash is a branded string
        parents: n.commit.parents.map((p: any) => p.value), // CommitHash[] are branded strings
        author: {
          name: n.commit.author.name,
          email: n.commit.author.email,
          timestamp: n.commit.author.timestamp,
        },
        committer: {
          name: n.commit.committer.name,
          email: n.commit.committer.email,
          timestamp: n.commit.committer.timestamp,
        },
        message: n.commit.message,
        subject: n.commit.subject,
        body: n.commit.body,
        tree: n.commit.tree,
      },
      refs: n.refs,
      isHead: n.isHead,
      position: n.position
        ? {
            x: n.position.x,
            y: n.position.y,
          }
        : undefined,
      column: n.column,
    })),
    edges: graph.edges.map((e: any) => ({
      from: e.from.value, // CommitHash is a branded string
      to: e.to.value, // CommitHash is a branded string
      isMerge: e.isMerge,
      column: e.column,
    })),
    options: {
      maxCommits: graph.options.maxCommits,
      includeBranches: graph.options.includeBranches?.map((b: any) => b.value), // BranchName[] are branded strings
      excludeBranches: graph.options.excludeBranches?.map((b: any) => b.value), // BranchName[] are branded strings
      since: graph.options.since,
      until: graph.options.until,
      author: graph.options.author,
      layoutAlgorithm: graph.options.layoutAlgorithm,
    },
    buildTime: graph.buildTime,
    latestCommit: graph.latestCommit?.value, // CommitHash is a branded string
    oldestCommit: graph.oldestCommit?.value, // CommitHash is a branded string
    totalCommits: graph.totalCommits,
    totalBranches: graph.totalBranches,
  })

  /**
   * Helper: Convert domain Commit to shared schema Commit
   */
  const toSharedCommit = (commit: any) => ({
    hash: commit.hash.value,
    parents: commit.parents.map((p: any) => p.value),
    author: {
      name: commit.author.name,
      email: commit.author.email,
      timestamp: commit.author.timestamp,
    },
    committer: {
      name: commit.committer.name,
      email: commit.committer.email,
      timestamp: commit.committer.timestamp,
    },
    message: commit.message,
    subject: commit.subject,
    body: commit.body,
    tree: commit.tree,
  })

  // ===== Repository Management Handlers =====

  registerIpcHandler(
    SourceControlIpcContracts['source-control:discover-repositories'],
    (input) =>
      repoService.discoverRepositories([...input.searchPaths]).pipe(
        Effect.map((repos) => repos.map(toSharedRepository))
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-repository'],
    (input) =>
      repoService.getRepository(input.path).pipe(
        Effect.map(toSharedRepository)
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-repository-by-id'],
    (input) =>
      repoService.getRepositoryById(toDomainRepositoryId(input.repositoryId)).pipe(
        Effect.map(toSharedRepository)
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:refresh-repository'],
    (input) =>
      repoService.refreshRepository(toDomainRepositoryId(input.repositoryId)).pipe(
        Effect.map(toSharedRepository)
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:validate-repository'],
    (input) =>
      repoService.validateRepository(input.path).pipe(
        Effect.map((info) => ({
          path: info.path,
          gitDir: info.gitDir,
          isValid: info.isValid,
          isBare: info.isBare,
          error: info.error,
        }))
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-repository-metadata'],
    (input) =>
      repoService.getRepositoryMetadata(toDomainRepositoryId(input.repositoryId)).pipe(
        Effect.map((metadata: any) => ({
          repositoryId: { value: metadata.repositoryId.value },
          size: metadata.size,
          commitCount: metadata.commitCount,
          branchCount: metadata.branchCount,
          remoteCount: metadata.remoteCount,
          lastCommitDate: metadata.lastCommitDate,
          lastFetchDate: metadata.lastFetchDate,
          createdDate: metadata.createdDate,
        }))
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-all-repositories'],
    () =>
      repoService.getAllRepositories().pipe(
        Effect.map((repos) => repos.map(toSharedRepository))
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:forget-repository'],
    (input) =>
      repoService.forgetRepository(toDomainRepositoryId(input.repositoryId))
  )

  // ===== Commit Graph Handlers =====

  registerIpcHandler(
    SourceControlIpcContracts['source-control:build-commit-graph'],
    (input) =>
      commitService
        .buildCommitGraph(
          toDomainRepositoryId(input.repositoryId),
          toDomainGraphOptions(input.options)
        )
        .pipe(Effect.map(toSharedCommitGraph))
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-commit-graph-statistics'],
    (input) =>
      commitService.getCommitGraphStatistics(toDomainRepositoryId(input.repositoryId)).pipe(
        Effect.map((stats) => ({
          totalNodes: stats.totalNodes,
          totalEdges: stats.totalEdges,
          mergeCommits: stats.mergeCommits,
          leafCommits: stats.leafCommits,
          columns: stats.columns,
          buildTime: stats.buildTime,
        }))
      )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-commit'],
    (input) =>
      commitService
        .getCommit(toDomainRepositoryId(input.repositoryId), makeCommitHash(input.commitHash))
        .pipe(Effect.map(toSharedCommit))
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-commit-with-refs'],
    (input) =>
      commitService
        .getCommitWithRefs(
          toDomainRepositoryId(input.repositoryId),
          makeCommitHash(input.commitHash)
        )
        .pipe(
          Effect.map((commitWithRefs: any) => ({
            commit: toSharedCommit(commitWithRefs.commit),
            branches: commitWithRefs.branches,
            tags: commitWithRefs.tags,
            isHead: commitWithRefs.isHead,
          }))
        )
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-commit-history'],
    (input) =>
      commitService
        .getCommitHistory(
          toDomainRepositoryId(input.repositoryId),
          makeBranchName(input.branchName),
          input.maxCount
        )
        .pipe(Effect.map((commits) => commits.map(toSharedCommit)))
  )

  // ===== Working Tree Handlers =====
  // Note: These would be implemented once WorkingTreeService is created

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-status'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-status-summary'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:stage-files'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:unstage-files'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:discard-changes'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:get-diff'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:create-stash'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:list-stashes'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )

  registerIpcHandler(
    SourceControlIpcContracts['source-control:pop-stash'],
    () =>
      Effect.fail(new Error('Working tree operations not yet implemented')) as any
  )
})
