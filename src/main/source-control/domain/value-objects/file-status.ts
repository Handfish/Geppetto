import { Schema as S } from 'effect'

/**
 * FileStatus - Value object representing Git file status
 *
 * Git file statuses indicate the state of a file in the working tree and index:
 * - Unmodified: File hasn't changed
 * - Modified: File has been modified but not staged
 * - Added: File has been added to the index
 * - Deleted: File has been deleted
 * - Renamed: File has been renamed
 * - Copied: File has been copied
 * - Untracked: File is not tracked by Git
 * - Ignored: File is ignored by .gitignore
 * - Conflicted: File has merge conflicts
 */
export const FileStatus = S.Literal(
  'unmodified',
  'modified',
  'added',
  'deleted',
  'renamed',
  'copied',
  'untracked',
  'ignored',
  'conflicted'
).annotations({
  title: 'File Status',
  description: 'Git file status in the working tree',
})

export type FileStatus = S.Schema.Type<typeof FileStatus>

/**
 * FileStatusCode - Git status porcelain v1 format codes
 *
 * Git status --porcelain returns two-character status codes:
 * - First character: index status
 * - Second character: working tree status
 *
 * Common codes:
 * - ' M': Modified in working tree
 * - 'M ': Modified in index
 * - 'MM': Modified in both
 * - 'A ': Added to index
 * - 'D ': Deleted from index
 * - ' D': Deleted in working tree
 * - 'R ': Renamed in index
 * - 'C ': Copied in index
 * - '??': Untracked
 * - '!!': Ignored
 * - 'UU': Both modified (conflict)
 */
export class FileStatusCode extends S.Class<FileStatusCode>('FileStatusCode')({
  index: S.String.pipe(S.maxLength(1)),
  workingTree: S.String.pipe(S.maxLength(1)),
}) {
  /**
   * Check if file is staged (has changes in index)
   */
  isStaged(): boolean {
    return this.index !== ' ' && this.index !== '?'
  }

  /**
   * Check if file is modified in working tree
   */
  isModifiedInWorkingTree(): boolean {
    return this.workingTree !== ' ' && this.workingTree !== '?'
  }

  /**
   * Check if file is untracked
   */
  isUntracked(): boolean {
    return this.index === '?' && this.workingTree === '?'
  }

  /**
   * Check if file is ignored
   */
  isIgnored(): boolean {
    return this.index === '!' && this.workingTree === '!'
  }

  /**
   * Check if file has conflicts
   */
  hasConflicts(): boolean {
    return this.index === 'U' || this.workingTree === 'U'
  }

  /**
   * Convert to FileStatus enum
   */
  toFileStatus(): FileStatus {
    if (this.isIgnored()) return 'ignored'
    if (this.hasConflicts()) return 'conflicted'
    if (this.isUntracked()) return 'untracked'

    // Index status takes precedence
    switch (this.index) {
      case 'A':
        return 'added'
      case 'D':
        return 'deleted'
      case 'R':
        return 'renamed'
      case 'C':
        return 'copied'
      case 'M':
        return 'modified'
    }

    // Working tree status
    switch (this.workingTree) {
      case 'M':
        return 'modified'
      case 'D':
        return 'deleted'
    }

    return 'unmodified'
  }

  /**
   * Get a human-readable description of the status
   */
  getDescription(): string {
    if (this.isIgnored()) return 'Ignored'
    if (this.hasConflicts()) return 'Conflicted'
    if (this.isUntracked()) return 'Untracked'

    const parts: string[] = []

    if (this.index !== ' ') {
      switch (this.index) {
        case 'A':
          parts.push('Added')
          break
        case 'D':
          parts.push('Deleted')
          break
        case 'R':
          parts.push('Renamed')
          break
        case 'C':
          parts.push('Copied')
          break
        case 'M':
          parts.push('Modified')
          break
      }
      parts.push('(staged)')
    }

    if (this.workingTree !== ' ') {
      switch (this.workingTree) {
        case 'M':
          parts.push('Modified')
          break
        case 'D':
          parts.push('Deleted')
          break
      }
      parts.push('(unstaged)')
    }

    return parts.length > 0 ? parts.join(' ') : 'Unmodified'
  }
}

/**
 * Parse Git status porcelain code into FileStatusCode
 */
export const parseFileStatusCode = (code: string): FileStatusCode => {
  if (code.length !== 2) {
    return new FileStatusCode({ index: ' ', workingTree: ' ' })
  }

  return new FileStatusCode({
    index: code[0] || ' ',
    workingTree: code[1] || ' ',
  })
}
