import React from 'react'
import type { Commit } from '../../../../shared/schemas/source-control'

/**
 * CommitInfo Component
 *
 * Displays detailed metadata for a commit:
 * - Commit hash (full and short)
 * - Author information (name, email, date)
 * - Committer information (if different from author)
 * - Commit message (subject and body)
 * - Parent commits
 */

interface CommitInfoProps {
  commit: Commit
}

export function CommitInfo({ commit }: CommitInfoProps) {
  const authorDate = new Date(commit.author.timestamp)
  const committerDate = new Date(commit.committer.timestamp)

  const isDifferentCommitter =
    commit.author.email !== commit.committer.email ||
    commit.author.name !== commit.committer.name

  return (
    <div className="space-y-4">
      {/* Commit Hash */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Commit</label>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-blue-400">
            {commit.hash.slice(0, 7)}
          </code>
          <code className="text-xs font-mono text-gray-500 truncate">
            {commit.hash}
          </code>
        </div>
      </div>

      {/* Commit Message */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-white">
          {commit.subject}
        </h3>
        {commit.body && (
          <p className="text-sm text-gray-300 whitespace-pre-wrap">
            {commit.body}
          </p>
        )}
      </div>

      {/* Author Info */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Author</label>
        <div className="text-sm text-gray-300">
          <div className="font-medium">{commit.author.name}</div>
          <div className="text-gray-400 text-xs">{commit.author.email}</div>
          <div className="text-gray-500 text-xs mt-1">
            {authorDate.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Committer Info (only show if different from author) */}
      {isDifferentCommitter && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Committer</label>
          <div className="text-sm text-gray-300">
            <div className="font-medium">{commit.committer.name}</div>
            <div className="text-gray-400 text-xs">{commit.committer.email}</div>
            <div className="text-gray-500 text-xs mt-1">
              {committerDate.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Parent Commits */}
      {commit.parents.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">
            Parent{commit.parents.length > 1 ? 's' : ''}
            {commit.parents.length > 1 && (
              <span className="ml-1 text-yellow-400">(Merge commit)</span>
            )}
          </label>
          <div className="space-y-1">
            {commit.parents.map((parent) => (
              <code
                key={parent}
                className="block text-xs font-mono text-gray-400 hover:text-blue-400 cursor-pointer"
              >
                {parent.slice(0, 7)}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Tree SHA */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Tree</label>
        <code className="block text-xs font-mono text-gray-500">
          {commit.tree.slice(0, 7)}
        </code>
      </div>
    </div>
  )
}
