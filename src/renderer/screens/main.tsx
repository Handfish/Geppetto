import { Terminal } from 'lucide-react'
import { Option } from 'effect'
import { useEffect } from 'react'

import {
  Alert,
  AlertTitle,
  AlertDescription,
} from 'renderer/components/ui/alert'

import SleepLight from 'renderer/components/ui/SleepLight'
import { useGitHubAuth } from '../hooks/useGitHubAtoms'

export function MainScreen() {
  const { currentUser, refresh } = useGitHubAuth()

  // Listen for auth changes from other windows
  useEffect(() => {
    const handleAuthChange = () => {
      console.log('[MainScreen] Auth changed, refreshing...')
      refresh()
    }

    window.electron.ipcRenderer.on('github:auth-changed', handleAuthChange)

    return () => {
      window.electron.ipcRenderer.removeListener('github:auth-changed', handleAuthChange)
    }
  }, [refresh])

  // Extract username from currentUser Option
  const userName = Option.match(currentUser, {
    onNone: () => null as string | null,
    onSome: (user) => user.login,
  })

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-transparent drag-region">
      <SleepLight color="#00ffff" speed={8} />
      <Alert className="mt-5 bg-transparent border-transparent text-accent w-fit">
        <AlertTitle className="text-5xl text-teal-400">
          Hi{userName ? `, ${userName}` : ','}
        </AlertTitle>

        <AlertDescription className="flex items-center gap-2 text-lg">
          <Terminal className="size-6 text-fuchsia-300" />

          <span className="text-gray-400">
            {userName
              ? "It's time to build something awesome!"
              : "Sign in to get started!"}
          </span>
        </AlertDescription>
      </Alert>
    </main>
  )
}
