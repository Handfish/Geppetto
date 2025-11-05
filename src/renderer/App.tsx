import React, { useState } from 'react'
import { AuthCard } from './components/AuthCard'
import { RepositoryList } from './components/RepositoryList'
import SleepLight from './components/ui/SleepLight'
import { useProviderAuth } from './hooks/useProviderAtoms'
import { AiUsageCard } from './components/AiUsageCard'
import { ToastViewport } from './components/ui/ToastViewport'
import { ErrorTester } from './components/dev/ErrorTester'
import { ProcessRunnerDevPanel } from './components/dev/AiRunnerDevPanel'
import { WorkspaceSelector } from './components/WorkspaceSelector'
import { SourceControlDevPanel } from './components/dev/SourceControlDevPanel'
import { TerminalPanel } from './components/terminal/TerminalPanel'
import { Terminal as TerminalIcon } from 'lucide-react'

export function App() {
  const { isAuthenticated } = useProviderAuth('github')
  const [showTerminal, setShowTerminal] = useState(false)

  const content = (
    <div className="min-h-screen bg-gray-900 p-6 relative">
      <ToastViewport />
      <WorkspaceSelector />
      {process.env.NODE_ENV === 'development' && (
        <>
          <ProcessRunnerDevPanel />
          <SourceControlDevPanel />
        </>
      )}
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="space-y-4">
          <div className="flex items-center justify-center">
            <SleepLight color="#60a5fa" speed={8} />
          </div>
          <h1 className="text-3xl font-bold text-white text-center">
            Geppetto
          </h1>
          <p className="text-gray-400 text-center">
            Manage your repositories with Effect and Electron
          </p>
        </header>

        <AuthCard />

        <AiUsageCard />

        {isAuthenticated && (
          <>
            <RepositoryList />
          </>
        )}
      </div>

      {/* Terminal Toggle Button */}
      <button
        onClick={() => setShowTerminal(!showTerminal)}
        className="fixed bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors z-50"
        title="Toggle Terminal"
      >
        <TerminalIcon className="h-5 w-5 text-white" />
      </button>

      {/* Terminal Panel */}
      {showTerminal && (
        <div className="fixed bottom-0 left-0 right-0 h-1/2 z-40">
          <TerminalPanel onClose={() => setShowTerminal(false)} />
        </div>
      )}
    </div>
  )

  // Wrap with ErrorTester in development mode
  if (process.env.NODE_ENV === 'development') {
    return <ErrorTester>{content}</ErrorTester>
  }

  return content
}
