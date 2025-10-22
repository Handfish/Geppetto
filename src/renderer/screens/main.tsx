import { Terminal } from 'lucide-react'
import { Option } from 'effect'
import { useEffect, useState, useRef } from 'react'
import { Result } from '@effect-atom/atom-react'

import {
  Alert,
  AlertTitle,
  AlertDescription,
} from 'renderer/components/ui/alert'

import SleepLight from 'renderer/components/ui/SleepLight'
// import { RepositoryCarousel } from 'renderer/components/ui/RepositoryCarousel'
// import { RepositoryCarousel2 } from 'renderer/components/ui/RepositoryCarousel2'
import {
  RepositoryCarousel3,
  type RepositoryCarouselRef
} from 'renderer/components/ui/RepositoryCarousel3'
import { RepositorySearch } from 'renderer/components/ui/RepositorySearch'
import { ClickSpark } from 'renderer/components/ui/ClickSpark'
import { useGitHubAuth, useUserRepos } from '../hooks/useGitHubAtoms'

export function MainScreen() {
  const { currentUser, refresh } = useGitHubAuth()
  const { repos } = useUserRepos()
  const [isFocused, setIsFocused] = useState(true)
  const carouselRef = useRef<RepositoryCarouselRef>(null)

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

  // Listen for focus/unfocus events
  useEffect(() => {
    const handleFocus = () => {
      console.log('[MainScreen] Window focused')
      setIsFocused(true)
    }

    const handleUnfocus = () => {
      console.log('[MainScreen] Window unfocused')
      setIsFocused(false)
    }

    window.electron.ipcRenderer.on('window:focus', handleFocus)
    window.electron.ipcRenderer.on('window:unfocus', handleUnfocus)

    return () => {
      window.electron.ipcRenderer.removeListener('window:focus', handleFocus)
      window.electron.ipcRenderer.removeListener('window:unfocus', handleUnfocus)
    }
  }, [])

  // Extract username from currentUser Option
  const userName = Option.match(currentUser, {
    onNone: () => null as string | null,
    onSome: user => user.login,
  })

  return (
    <main
      className="relative h-screen w-screen bg-transparent drag-region transition-opacity duration-500"
      style={{ opacity: isFocused ? 1 : 0 }}
    >
      {/* Click spark effect - only when focused */}
      <ClickSpark color="#00ffff" enabled={isFocused} />
      {/* Hi message - top left */}
      <div className="absolute top-8 left-8">
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

      {/* Carousel and SleepLight - bottom left quadrant, bottom 6th of screen */}
      {userName && (
        <div className="absolute bottom-0 left-0 w-1/2 flex flex-col items-start justify-end pb-8 pl-8 pr-8 gap-4" style={{ height: '25vh', paddingTop: '3rem' }}>
          <SleepLight color="#00ffff" speed={8} />
          <div className="w-full" style={{ minHeight: '180px' }}>
            <RepositoryCarousel3 ref={carouselRef} repos={repos} isFocused={isFocused} />
          </div>
          <div className="text-gray-500 text-sm flex items-center gap-3">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-800/50 rounded border border-gray-700/50 text-teal-400">
                ←
              </kbd>
              <kbd className="px-2 py-1 bg-gray-800/50 rounded border border-gray-700/50 text-teal-400">
                →
              </kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-800/50 rounded border border-gray-700/50 text-teal-400">
                Space
              </kbd>
              <span>Menu</span>
            </div>
            {Result.match(repos, {
              onSuccess: (successResult) => (
                <RepositorySearch
                  repos={successResult.value}
                  isFocused={isFocused}
                  onSelectRepo={(index) => {
                    carouselRef.current?.jumpToIndex(index, true)
                  }}
                />
              ),
              onInitial: () => null,
              onFailure: () => null,
            })}
          </div>
        </div>
      )}
    </main>
  )
}
