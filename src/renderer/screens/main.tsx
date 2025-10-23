import { Terminal } from 'lucide-react'
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
import { useProviderAuth, useAccountRepositories } from '../hooks/useProviderAtoms'

export function MainScreen() {
  const { accounts, activeAccount, refreshProviderRepos } = useProviderAuth('github')
  const activeAccountId = activeAccount?.id ?? accounts[0]?.id ?? null
  const { repositoriesResult: repos } = useAccountRepositories(activeAccountId)
  const [isFocused, setIsFocused] = useState(true)
  const carouselRef = useRef<RepositoryCarouselRef>(null)

  // Listen for auth changes from other windows
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
  const userName = activeAccount?.displayName ?? activeAccount?.username ?? null

  return (
    <main
      className="relative h-screen w-screen bg-transparent drag-region transition-opacity duration-500 overflow-hidden"
      style={{ opacity: isFocused ? 1 : 0 }}
    >
      {/* Click spark effect - only when focused */}
      <ClickSpark color="#00ffff" enabled={isFocused} />
      {/* Hi message - top left */}
      <div className="absolute top-8 left-8">
        <div className="relative">
          {/* Soft-edged dark background with blur - Ubuntu/Linear inspired, diagonal '/' shape */}
          <div
            className="absolute backdrop-blur-md shadow-2xl"
            style={{
              top: '-6rem',
              left: '-7rem',
              right: '-6rem',
              bottom: '-4rem',
              borderRadius: '45%',
              background: 'radial-gradient(ellipse 130% 110% at 30% 35%, rgba(3, 7, 18, 0.95) 0%, rgba(17, 24, 39, 0.92) 60%, rgba(17, 24, 39, 0.85) 80%, rgba(17, 24, 39, 0.4) 92%, transparent 100%)',
              filter: 'blur(8px)',
              transform: 'rotate(-12deg)',
              transformOrigin: 'center center'
            }}
          />

          {/* Inner glow for depth */}
          <div
            className="absolute"
            style={{
              top: '-6rem',
              left: '-7rem',
              right: '-6rem',
              bottom: '-4rem',
              borderRadius: '45%',
              background: 'radial-gradient(ellipse 130% 110% at 30% 35%, rgba(31, 41, 55, 0.2) 0%, rgba(31, 41, 55, 0.1) 70%, transparent 90%)',
              filter: 'blur(4px)',
              transform: 'rotate(-12deg)',
              transformOrigin: 'center center'
            }}
          />

          {/* Content */}
          <Alert className="relative bg-transparent border-transparent text-accent w-fit">
            <AlertTitle className="text-5xl text-teal-400 drop-shadow-[0_2px_8px_rgba(45,212,191,0.3)]">
              Hi{userName ? `, ${userName}` : ','}
            </AlertTitle>

            <AlertDescription className="flex items-center gap-2 text-lg">
              <Terminal className="size-6 text-fuchsia-300 drop-shadow-[0_2px_8px_rgba(232,121,249,0.3)]" />

              <span className="text-gray-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {userName
                  ? "It's time to build something awesome!"
                  : 'Sign in to get started!'}
              </span>
            </AlertDescription>
          </Alert>
        </div>
      </div>

      {/* Carousel and SleepLight - bottom left quadrant, bottom 6th of screen */}
      {userName && activeAccountId && (
        <div className="absolute bottom-0 left-0 w-1/2 flex flex-col items-start justify-end pb-8 pl-8 pr-8 gap-4" style={{ height: '25vh', paddingTop: '3rem' }}>
          <SleepLight color="#00ffff" speed={8} />
          <div className="w-full" style={{ minHeight: '180px' }}>
            <RepositoryCarousel3
              ref={carouselRef}
              repos={repos}
              isFocused={isFocused}
              account={activeAccount ?? accounts.find(acc => acc.id === activeAccountId) ?? null}
            />
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
