import React from 'react'
import { AuthCard } from './components/AuthCard'
import { RepositoryList } from './components/RepositoryList'
import SleepLight from './components/ui/SleepLight'
import { useProviderAuth } from './hooks/useProviderAtoms'
import { AiUsageCard } from './components/AiUsageCard'
import { ToastViewport } from './components/ui/ToastViewport'

export function App() {
  const { isAuthenticated } = useProviderAuth('github')

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <ToastViewport />
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
    </div>
  )
}
