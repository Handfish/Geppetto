/**
 * Git Error Testing Component
 *
 * Allows intentionally triggering git errors to verify stderr flows through to the UI.
 * This is a development-only tool for testing error handling.
 *
 * Note: Errors are shown in the results panel below. No toasts are displayed in
 * the developer console window. Toasts will appear in the main window via
 * normal error handling (ToastErrorPresenter).
 */

import { useState } from 'react'
import type { Repository } from '../../../shared/schemas/source-control'

interface ErrorTestResult {
  test: string
  timestamp: Date
  error: any
  stderr?: string
}

interface GitErrorTesterProps {
  repository: Repository | null
}

export function GitErrorTester({ repository }: GitErrorTesterProps) {
  const [testResults, setTestResults] = useState<ErrorTestResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const addResult = (test: string, error: any) => {
    const result: ErrorTestResult = {
      test,
      timestamp: new Date(),
      error,
      stderr: error?.stderr || error?.error?.stderr || undefined,
    }
    setTestResults((prev) => [result, ...prev])

    // No toasts in developer console - errors are only shown in the results panel
    // The main window will show toasts via normal error handling (ToastErrorPresenter)
  }

  const clearResults = () => {
    setTestResults([])
  }

  // Test 1: Try to create worktree with invalid base branch
  const testInvalidBaseBranch = async () => {
    if (!repository) return

    setIsRunning(true)
    try {
      console.log('[GitErrorTester] Testing invalid base branch...')
      const result = await window.electron.ipcRenderer.invoke(
        'source-control:create-worktree-for-issue',
        {
          repositoryId: repository.id,
          issueNumber: 999,
          baseBranch: 'this-branch-does-not-exist-12345',
        }
      )
      console.log('[GitErrorTester] Got result:', result)

      // Check if result is an error object
      if (result && typeof result === 'object' && '_tag' in result && result._tag === 'Error') {
        addResult('Invalid Base Branch', result.error || result)
      } else {
        addResult('Invalid Base Branch', { message: 'Unexpectedly succeeded!', result })
      }
    } catch (error: any) {
      console.log('[GitErrorTester] Caught exception:', error)
      addResult('Invalid Base Branch', error)
    } finally {
      setIsRunning(false)
    }
  }

  // Test 2: Try to create worktree for issue with invalid issue number (negative)
  const testInvalidIssueNumber = async () => {
    if (!repository) return

    setIsRunning(true)
    try {
      console.log('[GitErrorTester] Testing invalid issue number...')
      const result = await window.electron.ipcRenderer.invoke(
        'source-control:create-worktree-for-issue',
        {
          repositoryId: repository.id,
          issueNumber: -1,
          baseBranch: repository.defaultBranch || 'main',
        }
      )
      console.log('[GitErrorTester] Got result:', result)

      // Check if result is an error object
      if (result && typeof result === 'object' && '_tag' in result && result._tag === 'Error') {
        addResult('Invalid Issue Number', result.error || result)
      } else {
        addResult('Invalid Issue Number', { message: 'Unexpectedly succeeded!', result })
      }
    } catch (error: any) {
      console.log('[GitErrorTester] Caught exception:', error)
      addResult('Invalid Issue Number', error)
    } finally {
      setIsRunning(false)
    }
  }

  // Test 3: Try to remove non-existent worktree
  const testRemoveNonExistentWorktree = async () => {
    if (!repository) return

    setIsRunning(true)
    try {
      console.log('[GitErrorTester] Testing remove non-existent worktree...')
      const result = await window.electron.ipcRenderer.invoke('source-control:remove-worktree', {
        repositoryId: repository.id,
        worktreePath: '/this/path/does/not/exist/worktree-test-12345',
      })
      console.log('[GitErrorTester] Got result:', result)

      // Check if result is an error object
      if (result && typeof result === 'object' && '_tag' in result && result._tag === 'Error') {
        addResult('Remove Non-Existent Worktree', result.error || result)
      } else {
        addResult('Remove Non-Existent Worktree', { message: 'Unexpectedly succeeded!', result })
      }
    } catch (error: any) {
      console.log('[GitErrorTester] Caught exception:', error)
      addResult('Remove Non-Existent Worktree', error)
    } finally {
      setIsRunning(false)
    }
  }

  // Test 4: Try to list worktrees on non-existent repository
  const testListWorktreesInvalidRepo = async () => {
    setIsRunning(true)
    try {
      console.log('[GitErrorTester] Testing list worktrees on invalid repo...')
      // Use a valid UUID format that doesn't exist
      const result = await window.electron.ipcRenderer.invoke('source-control:list-worktrees', {
        repositoryId: { value: '00000000-0000-0000-0000-000000000000' },
      })
      console.log('[GitErrorTester] Got result:', result)

      // Check if result is an error object
      if (result && typeof result === 'object' && '_tag' in result && result._tag === 'Error') {
        addResult('List Worktrees (Invalid Repo)', result.error || result)
      } else {
        addResult('List Worktrees (Invalid Repo)', { message: 'Unexpectedly succeeded!', result })
      }
    } catch (error: any) {
      console.log('[GitErrorTester] Caught exception:', error)
      addResult('List Worktrees (Invalid Repo)', error)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-4">
        <h4 className="text-yellow-400 font-medium mb-2">⚠️ Git Error Testing</h4>
        <p className="text-sm text-gray-300">
          These tests intentionally trigger git errors to verify stderr is properly
          displayed in the UI. Check the console and results below to see full error
          details.
        </p>
      </div>

      {/* Test Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={testInvalidBaseBranch}
          disabled={!repository || isRunning}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          🔴 Invalid Base Branch
        </button>

        <button
          onClick={testInvalidIssueNumber}
          disabled={!repository || isRunning}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          🔴 Invalid Issue Number
        </button>

        <button
          onClick={testRemoveNonExistentWorktree}
          disabled={!repository || isRunning}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          🔴 Remove Non-Existent Worktree
        </button>

        <button
          onClick={testListWorktreesInvalidRepo}
          disabled={isRunning}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          🔴 Invalid Repository ID
        </button>
      </div>

      {/* Clear Button */}
      {testResults.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={clearResults}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            Clear Results
          </button>
        </div>
      )}

      {/* Test Results */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {testResults.map((result, index) => (
          <div
            key={index}
            className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-2"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-medium text-white">{result.test}</h5>
              <span className="text-xs text-gray-500">
                {result.timestamp.toLocaleTimeString()}
              </span>
            </div>

            {/* Error Message */}
            <div className="bg-red-950/50 border border-red-800/50 rounded p-3">
              <div className="text-xs font-mono text-red-300 mb-2">
                {result.error?.message || result.error?.error?.message || 'Unknown error'}
              </div>

              {/* Stderr - This is what we're testing! */}
              {result.stderr && (
                <div className="mt-2 pt-2 border-t border-red-800/50">
                  <div className="text-xs text-red-400 font-semibold mb-1">
                    📋 STDERR (Git Error Output):
                  </div>
                  <pre className="text-xs font-mono text-red-200 whitespace-pre-wrap break-all">
                    {result.stderr}
                  </pre>
                </div>
              )}

              {/* Full Error Object (collapsed by default) */}
              <details className="mt-2 pt-2 border-t border-red-800/50">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                  Full Error Object
                </summary>
                <pre className="mt-2 text-xs font-mono text-gray-400 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                  {JSON.stringify(result.error, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        ))}

        {testResults.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            No test results yet. Click a test button above to trigger an error.
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-900/20 border border-blue-600/50 rounded-lg p-4 text-sm">
        <h5 className="text-blue-400 font-medium mb-2">How to Use</h5>
        <ol className="text-gray-300 space-y-1 list-decimal list-inside">
          <li>Select a repository from the Repositories tab (if needed)</li>
          <li>Click any test button above to trigger a git error</li>
          <li>
            Check the result below - you should see the stderr from git in the "STDERR"
            section
          </li>
          <li>Open the browser console (F12) to see detailed logging</li>
        </ol>
      </div>
    </div>
  )
}
