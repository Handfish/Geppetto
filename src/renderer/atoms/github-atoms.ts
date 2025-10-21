import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Option, Duration } from 'effect'
import { GitHubClient } from '../lib/ipc-client'
import type { GitHubRepository, GitHubUser } from '../../shared/schemas'

const githubRuntime = Atom.runtime(GitHubClient.Default)

export const authStateAtom = githubRuntime
  .atom(
    Effect.gen(function* () {
      const github = yield* GitHubClient
      return yield* github.checkAuth()
    })
  )
  .pipe(
    Atom.withReactivity(['github:auth']),
    Atom.keepAlive
  )

export const isAuthenticatedAtom = Atom.make((get) => {
  const authResult = get(authStateAtom)
  const auth = Result.getOrElse(authResult, () => ({
    authenticated: false as const,
  }))
  return auth.authenticated
})

export const currentUserAtom = Atom.make((get) => {
  const authResult = get(authStateAtom)
  const auth = Result.getOrElse(authResult, () => ({
    authenticated: false as const,
  }))
  return auth.authenticated && 'user' in auth && auth.user
    ? Option.some(auth.user)
    : Option.none()
})

export const signInAtom = githubRuntime.fn(
  Effect.fnUntraced(function* () {
    const github = yield* GitHubClient
    return yield* github.signIn()
  }),
  { reactivityKeys: ['github:auth'] }
)

export const signOutAtom = githubRuntime.fn(
  Effect.fnUntraced(function* () {
    const github = yield* GitHubClient
    yield* github.signOut()
  }),
  { reactivityKeys: ['github:auth'] }
)

export const userReposAtom = Atom.make((get) => {
  const userOption = get(currentUserAtom)
  if (Option.isNone(userOption)) {
    return Result.success([] as GitHubRepository[])
  }
  const user = userOption.value
  return get(reposAtom(user.login))
})

export const reposAtom = Atom.family((username?: string) =>
  githubRuntime
    .atom(
      Effect.gen(function* () {
        const github = yield* GitHubClient
        return yield* github.getRepos(username)
      })
    )
    .pipe(
      Atom.withReactivity([`github:repos:${username || 'user'}`]),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

export const repoAtom = Atom.family(
  ({ owner, repo }: { owner: string; repo: string }) =>
    githubRuntime
      .atom(
        Effect.gen(function* () {
          const github = yield* GitHubClient
          return yield* github.getRepo(owner, repo)
        })
      )
      .pipe(
        Atom.withReactivity([`github:repo:${owner}/${repo}`]),
        Atom.setIdleTTL(Duration.minutes(10))
      )
)

export const issuesAtom = Atom.family(
  ({
    owner,
    repo,
    state = 'open',
  }: {
    owner: string
    repo: string
    state?: 'open' | 'closed' | 'all'
  }) =>
    githubRuntime
      .atom(
        Effect.gen(function* () {
          const github = yield* GitHubClient
          return yield* github.getIssues(owner, repo, state)
        })
      )
      .pipe(
        Atom.withReactivity([`github:issues:${owner}/${repo}:${state}`]),
        Atom.setIdleTTL(Duration.minutes(3))
      )
)

export const pullRequestsAtom = Atom.family(
  ({
    owner,
    repo,
    state = 'open',
  }: {
    owner: string
    repo: string
    state?: 'open' | 'closed' | 'all'
  }) =>
    githubRuntime
      .atom(
        Effect.gen(function* () {
          const github = yield* GitHubClient
          return yield* github.getPullRequests(owner, repo, state)
        })
      )
      .pipe(
        Atom.withReactivity([`github:prs:${owner}/${repo}:${state}`]),
        Atom.setIdleTTL(Duration.minutes(3))
      )
)

