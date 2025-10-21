import { Terminal } from 'lucide-react'
import { Option } from 'effect'
import { useEffect } from 'react'

import {
  Alert,
  AlertTitle,
  AlertDescription,
} from 'renderer/components/ui/alert'

import SleepLight from 'renderer/components/ui/SleepLight'
// import { RepositoryCarousel } from 'renderer/components/ui/RepositoryCarousel'
// import { RepositoryCarousel2 } from 'renderer/components/ui/RepositoryCarousel2'
import { RepositoryCarousel3 } from 'renderer/components/ui/RepositoryCarousel3'
import { useGitHubAuth, useUserRepos } from '../hooks/useGitHubAtoms'

export function MainScreen() {
  const { currentUser, refresh } = useGitHubAuth()
  const { repos } = useUserRepos()

  // Listen for auth changes from other windows
  useEffect(() => {
    const handleAuthChange = () => {
      console.log('[MainScreen] Auth changed, refreshing...')
      refresh()
    }

    window.electron.ipcRenderer.on('github:auth-changed', handleAuthChange)

    return () => {
      window.electron.ipcRenderer.removeListener(
        'github:auth-changed',
        handleAuthChange
      )
    }
  }, [refresh])

  // Extract username from currentUser Option
  const userName = Option.match(currentUser, {
    onNone: () => null as string | null,
    onSome: user => user.login,
  })

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-transparent drag-region gap-8">
      <div className="flex flex-col items-center gap-4">
        <SleepLight color="#00ffff" speed={8} />
        <Alert className="bg-transparent border-transparent text-accent w-fit">
          <AlertTitle className="text-5xl text-teal-400">
            Hi{userName ? `, ${userName}` : ','}
          </AlertTitle>

          <AlertDescription className="flex items-center gap-2 text-lg">
            <Terminal className="size-6 text-fuchsia-300" />

            <span className="text-gray-400">
              {userName
                ? "It's time to build something awesome!"
                : 'Sign in to get started!'}
            </span>
          </AlertDescription>
        </Alert>
      </div>

      {/* {userName && <RepositoryCarousel repos={repos} />} */}
      {/* {userName && <RepositoryCarousel2 repos={repos} />} */}
      {userName && <RepositoryCarousel3 repos={repos} />}

      {userName && (
        <div className="text-gray-500 text-sm flex items-center gap-2">
          <kbd className="px-2 py-1 bg-gray-800/50 rounded border border-gray-700/50 text-teal-400">
            ←
          </kbd>
          <kbd className="px-2 py-1 bg-gray-800/50 rounded border border-gray-700/50 text-teal-400">
            →
          </kbd>
          <span>Navigate repositories</span>
        </div>
      )}
    </main>
  )
}
