import { Effect, Ref, Schema as S } from 'effect'
import { CommitOperationsPort, CommitOptions, CherryPickOptions, RevertOptions } from '../ports/primary/commit-operations-port'
import { RepositoryService } from './repository-service'
import { NodeGitCommandRunner } from '../adapters/git/node-git-command-runner'
import {
  CommitGraph,
  GraphOptions,
  GraphUpdateResult,
  CommitGraphNode,
  CommitGraphNodeId,
  CommitGraphEdge,
  GraphStatistics,
  GraphBuildError,
  GraphUpdateError,
} from '../domain/aggregates/commit-graph'
import {
  Commit,
  CommitWithRefs,
  CommitRange,
  GitAuthor,
} from '../domain/entities/commit'
import { RepositoryId, RepositoryNotFoundError } from '../domain/aggregates/repository'
import { CommitHash, makeCommitHash } from '../domain/value-objects/commit-hash'
import { BranchName } from '../domain/value-objects/branch-name'
import {
  GitCommandRequest,
  GitWorktreeContext,
  GitCommandId,
} from '../../../shared/schemas/source-control'

/**
 * CommitGraphService - Application service for commit graph operations
 *
 * Implements CommitOperationsPort using GitCommandRunnerPort.
 * Builds and caches commit graphs for visualization.
 *
 * Dependencies:
 * - GitCommandRunnerPort: For executing git commands
 * - RepositoryManagementPort: For repository information
 */
export class CommitGraphService extends Effect.Service<CommitGraphService>()('CommitGraphService', {
  effect: Effect.gen(function* () {
    const gitRunner = yield* NodeGitCommandRunner
    const repoService = yield* RepositoryService

    // Cache for commit graphs
    const graphCache = yield* Ref.make(new Map<string, { graph: CommitGraph; timestamp: number }>())

    /**
     * Helper: Parse git log output into Commit entities
     */
    const parseCommits = (output: string): Commit[] => {
      const commits: Commit[] = []
      const commitBlocks = output.split('\x00\x00') // Delimiter between commits

      for (const block of commitBlocks) {
        if (!block.trim()) continue

        const lines = block.split('\x00') // Field delimiter
        if (lines.length < 7) continue

        const [hash, parentHashes, authorName, authorEmail, authorDate, subject, body] = lines

        const parents = parentHashes
          ? parentHashes.split(' ').filter(Boolean).map(makeCommitHash)
          : []

        commits.push(
          new Commit({
            hash: makeCommitHash(hash),
            parents,
            author: new GitAuthor({
              name: authorName,
              email: authorEmail,
              timestamp: new Date(authorDate),
            }),
            committer: new GitAuthor({
              name: authorName,
              email: authorEmail,
              timestamp: new Date(authorDate),
            }),
            message: `${subject}\n${body || ''}`.trim(),
            subject: subject,
            body: body || undefined,
            tree: '', // Would need separate git command to get tree SHA
          })
        )
      }

      return commits
    }

    /**
     * Helper: Build graph from commits
     */
    const buildGraphFromCommits = (
      repositoryId: RepositoryId,
      commits: Commit[],
      options: GraphOptions
    ): CommitGraph => {
      const nodes: CommitGraphNode[] = []
      const edges: CommitGraphEdge[] = []

      // Create nodes
      for (const commit of commits) {
        nodes.push(
          new CommitGraphNode({
            id: CommitGraphNodeId.fromCommitHash(commit.hash),
            commit,
            refs: [], // Would need to parse git refs
            isHead: false, // Would need to check current HEAD
            column: 0, // Would need layout algorithm
          })
        )
      }

      // Create edges (parent-child relationships)
      for (const commit of commits) {
        const childId = CommitGraphNodeId.fromCommitHash(commit.hash)

        for (const parentHash of commit.parents) {
          const parentId = CommitGraphNodeId.fromCommitHash(parentHash)

          edges.push(
            new CommitGraphEdge({
              from: parentId,
              to: childId,
              isMerge: commit.isMergeCommit(),
              column: 0, // Would need layout algorithm
            })
          )
        }
      }

      const latestCommit = commits.length > 0 ? commits[0].hash : undefined
      const oldestCommit = commits.length > 0 ? commits[commits.length - 1].hash : undefined

      return new CommitGraph({
        repositoryId,
        nodes,
        edges,
        options,
        buildTime: new Date(),
        latestCommit,
        oldestCommit,
        totalCommits: commits.length,
        totalBranches: 0, // Would need to count unique branches
      })
    }

    /**
     * Helper: Get commits from repository
     */
    const getCommitsFromRepo = (
      repoPath: string,
      options: GraphOptions
    ): Effect.Effect<Commit[], GraphBuildError> =>
      Effect.gen(function* () {
        // Build git log command with custom format
        const args = [
          'log',
          `--max-count=${options.maxCommits}`,
          '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x00', // Custom format with null delimiters
          '--all', // All branches
        ]

        if (options.since) {
          args.push(`--since=${options.since.toISOString()}`)
        }

        if (options.until) {
          args.push(`--until=${options.until.toISOString()}`)
        }

        if (options.author) {
          args.push(`--author=${options.author}`)
        }

        const output = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args,
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout ?? ''
          })
        )

        return parseCommits(output)
      }).pipe(
        Effect.catchAll((error) =>
          Effect.fail(
            new GraphBuildError({
              repositoryId: new RepositoryId({ value: '' }),
              reason: 'Failed to get commits from repository',
              cause: error,
            })
          )
        )
      )

    // Implementation of CommitOperationsPort
    const port: CommitOperationsPort = {
      buildCommitGraph: (repositoryId: RepositoryId, options?: GraphOptions) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)
          const graphOptions = options ?? GraphOptions.default()

          const commits = yield* getCommitsFromRepo(repo.path, graphOptions)
          const graph = buildGraphFromCommits(repositoryId, commits, graphOptions)

          // Cache the graph
          yield* Ref.update(graphCache, (cache) => {
            cache.set(repositoryId.value, {
              graph,
              timestamp: Date.now(),
            })
            return cache
          })

          return graph
        }),

      refreshCommitGraph: (repositoryId: RepositoryId, existingGraph: CommitGraph) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          // Get new commits since latest commit in graph
          const args = ['log', '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x00', '--all']

          if (existingGraph.latestCommit) {
            args.push(`${existingGraph.latestCommit.value}..HEAD`)
          }

          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          )

          const newCommits = parseCommits(output)

          if (newCommits.length === 0) {
            // No new commits
            return new GraphUpdateResult({
              graph: existingGraph,
              addedNodes: 0,
              addedEdges: 0,
              removedNodes: 0,
              removedEdges: 0,
            })
          }

          // Rebuild graph with new commits
          const allCommits = [...newCommits, ...existingGraph.nodes.map((n) => n.commit)]
          const newGraph = buildGraphFromCommits(repositoryId, allCommits, existingGraph.options)

          return new GraphUpdateResult({
            graph: newGraph,
            addedNodes: newCommits.length,
            addedEdges: 0, // Would need to calculate
            removedNodes: 0,
            removedEdges: 0,
          })
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new GraphUpdateError({
                repositoryId,
                reason: 'Failed to refresh commit graph',
                cause: error,
              })
            )
          )
        ),

      getCommitGraphStatistics: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const graph = yield* port.buildCommitGraph(repositoryId, GraphOptions.recent(100))

          return new GraphStatistics({
            totalNodes: graph.nodes.length,
            totalEdges: graph.edges.length,
            mergeCommits: graph.getMergeCommits().length,
            leafCommits: graph.getLeafCommits().length,
            columns: graph.getColumnCount(),
            buildTime: graph.buildTime,
          })
        }),

      getCommit: (repositoryId: RepositoryId, commitHash: CommitHash) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: [
                  'show',
                  '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x00',
                  '--no-patch',
                  commitHash.value,
                ],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get commit',
                  cause: error,
                })
              )
            )
          )

          const commits = parseCommits(output)
          if (commits.length === 0) {
            return yield* Effect.fail(
              new GraphBuildError({
                repositoryId,
                reason: 'Commit not found',
              })
            )
          }

          return commits[0]
        }),

      getCommitWithRefs: (repositoryId: RepositoryId, commitHash: CommitHash) =>
        Effect.gen(function* () {
          const commit = yield* port.getCommit(repositoryId, commitHash)

          // Get refs pointing to this commit
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const refsOutput = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['branch', '--contains', commitHash.value, '--format=%(refname:short)'],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          ).pipe(Effect.catchAll(() => Effect.succeed('')))

          const branches = refsOutput.split('\n').filter(Boolean)

          const tagsOutput = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['tag', '--contains', commitHash.value],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          ).pipe(Effect.catchAll(() => Effect.succeed('')))

          const tags = tagsOutput.split('\n').filter(Boolean)

          return new CommitWithRefs({
            commit,
            branches,
            tags,
            isHead: false, // Would need to check current HEAD
          })
        }),

      getCommitHistory: (repositoryId: RepositoryId, branchName: BranchName, maxCount?: number) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)
          const count = maxCount ?? 100

          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: [
                  'log',
                  `--max-count=${count}`,
                  '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x00',
                  branchName.value,
                ],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get commit history',
                  cause: error,
                })
              )
            )
          )

          return parseCommits(output)
        }),

      getCommitsInRange: (repositoryId: RepositoryId, range: CommitRange) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: [
                  'log',
                  '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x00',
                  range.toGitNotation(),
                ],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get commits in range',
                  cause: error,
                })
              )
            )
          )

          return parseCommits(output)
        }),

      getCommitsByAuthor: (repositoryId: RepositoryId, authorEmail: string, maxCount?: number) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)
          const count = maxCount ?? 100

          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: [
                  'log',
                  `--max-count=${count}`,
                  `--author=${authorEmail}`,
                  '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x00',
                  '--all',
                ],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get commits by author',
                  cause: error,
                })
              )
            )
          )

          return parseCommits(output)
        }),

      createCommit: (repositoryId: RepositoryId, options: CommitOptions) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const args = ['commit', '-m', options.message]

          if (options.amend) {
            args.push('--amend')
          }

          if (options.allowEmpty) {
            args.push('--allow-empty')
          }

          if (options.signOff) {
            args.push('--signoff')
          }

          yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              yield* handle.awaitResult
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to create commit',
                  cause: error,
                })
              )
            )
          )

          // Get new HEAD commit
          const headOutput = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['rev-parse', 'HEAD'],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout?.trim() ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get HEAD commit',
                  cause: error,
                })
              )
            )
          )

          return makeCommitHash(headOutput)
        }),

      amendCommit: (repositoryId: RepositoryId, message?: string) =>
        Effect.gen(function* () {
          return yield* port.createCommit(
            repositoryId,
            new CommitOptions(message ?? '', undefined, true)
          )
        }),

      cherryPickCommit: (repositoryId: RepositoryId, commitHash: CommitHash, options?: CherryPickOptions) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const args = ['cherry-pick', commitHash.value]

          if (options?.noCommit) {
            args.push('--no-commit')
          }

          if (options?.mainline !== undefined) {
            args.push(`--mainline=${options.mainline}`)
          }

          yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              yield* handle.awaitResult
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to cherry-pick commit',
                  cause: error,
                })
              )
            )
          )

          if (options?.noCommit) {
            return undefined
          }

          // Get new HEAD
          const headOutput = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['rev-parse', 'HEAD'],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout?.trim() ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get HEAD commit',
                  cause: error,
                })
              )
            )
          )

          return makeCommitHash(headOutput)
        }),

      revertCommit: (repositoryId: RepositoryId, commitHash: CommitHash, options?: RevertOptions) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const args = ['revert', commitHash.value]

          if (options?.noCommit) {
            args.push('--no-commit')
          }

          if (options?.mainline !== undefined) {
            args.push(`--mainline=${options.mainline}`)
          }

          yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              yield* handle.awaitResult
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to revert commit',
                  cause: error,
                })
              )
            )
          )

          // Get new HEAD
          const headOutput = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['rev-parse', 'HEAD'],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout?.trim() ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get HEAD commit',
                  cause: error,
                })
              )
            )
          )

          return makeCommitHash(headOutput)
        }),

      getParentCommits: (repositoryId: RepositoryId, commitHash: CommitHash) =>
        Effect.gen(function* () {
          const commit = yield* port.getCommit(repositoryId, commitHash)
          return yield* Effect.all(commit.parents.map((hash) => port.getCommit(repositoryId, hash)))
        }),

      getChildCommits: (repositoryId: RepositoryId, commitHash: CommitHash) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: [
                  'log',
                  '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%x00',
                  '--all',
                  '--ancestry-path',
                  `${commitHash.value}..HEAD`,
                ],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to get child commits',
                  cause: error,
                })
              )
            )
          )

          const allCommits = parseCommits(output)
          // Filter to direct children only
          return allCommits.filter((c) => c.parents.some((p) => p.equals(commitHash)))
        }),

      isAncestor: (repositoryId: RepositoryId, ancestorHash: CommitHash, descendantHash: CommitHash) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const result = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['merge-base', '--is-ancestor', ancestorHash.value, descendantHash.value],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.exitCode === 0
            })
          ).pipe(Effect.catchAll(() => Effect.succeed(false)))

          return result
        }),

      findMergeBase: (repositoryId: RepositoryId, commit1: CommitHash, commit2: CommitHash) =>
        Effect.gen(function* () {
          const repo = yield* repoService.getRepositoryById(repositoryId)

          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['merge-base', commit1.value, commit2.value],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout?.trim() ?? ''
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new GraphBuildError({
                  repositoryId,
                  reason: 'Failed to find merge base',
                  cause: error,
                })
              )
            )
          )

          return makeCommitHash(output)
        }),
    }

    return port
  }),
  dependencies: [NodeGitCommandRunner.Default, RepositoryService.Default],
}) {}
