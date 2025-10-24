import { Terminal } from 'lucide-react'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Result } from '@effect-atom/atom-react'

import SleepLight from 'renderer/components/ui/SleepLight'
import { ToastViewport } from 'renderer/components/ui/ToastViewport'
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from 'renderer/components/ui/alert'
// import { RepositoryCarousel } from 'renderer/components/ui/RepositoryCarousel'
// import { RepositoryCarousel2 } from 'renderer/components/ui/RepositoryCarousel2'
// import {
//   RepositoryCarousel3,
//   type RepositoryCarouselRef,
// } from 'renderer/components/ui/RepositoryCarousel3'
import {
  RepositoryCarousel4,
  type RepositoryCarouselRef,
} from 'renderer/components/ui/RepositoryCarousel4'
import { RepositorySearch } from 'renderer/components/ui/RepositorySearch'
import { ClickSpark } from 'renderer/components/ui/ClickSpark'
import { AiUsageBars } from 'renderer/components/ui/AiUsageBars'
import {
  useProviderAuth,
  useAccountRepositories,
} from '../hooks/useProviderAtoms'
import {
  CONSOLE_ERROR_KEY,
  readConsoleError,
  clearConsoleError,
} from '../lib/console-error-channel'

export function MainScreen() {
  const { accountsResult, activeAccount, refreshProviderRepos } =
    useProviderAuth('github')

  // Get first account from accountsResult if activeAccount is null
  const firstAccountId = Result.match(accountsResult, {
    onSuccess: accounts => accounts[0]?.id ?? null,
    onFailure: () => null,
    onInitial: () => null,
  })

  const activeAccountId = activeAccount?.id ?? firstAccountId
  const { repositoriesResult: repos } = useAccountRepositories(activeAccountId)
  const [isFocused, setIsFocused] = useState(true)
  const carouselRef = useRef<RepositoryCarouselRef>(null)
  const [consoleError, setConsoleError] = useState(() => readConsoleError())

  const handleConsoleErrorChange = useCallback(() => {
    setConsoleError(readConsoleError())
  }, [])

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
      window.electron.ipcRenderer.removeListener(
        'window:unfocus',
        handleUnfocus
      )
    }
  }, [])

  // Extract username from currentUser Option
  const userName = activeAccount?.displayName ?? activeAccount?.username ?? null

  useEffect(() => {
    handleConsoleErrorChange()
    const listener = (event: StorageEvent) => {
      if (event.key === CONSOLE_ERROR_KEY) {
        handleConsoleErrorChange()
      }
    }

    window.addEventListener('storage', listener)
    return () => {
      window.removeEventListener('storage', listener)
    }
  }, [handleConsoleErrorChange])

  const dismissConsoleError = () => {
    clearConsoleError()
    handleConsoleErrorChange()
  }

  return (
    <>
      <ToastViewport />
      <main
        className="relative h-screen w-screen bg-transparent drag-region transition-opacity duration-500 overflow-hidden"
        style={{ opacity: isFocused ? 1 : 0 }}
      >
        {/* Click spark effect - only when focused */}
        <ClickSpark color="#00ffff" enabled={isFocused} />
        {/* Hi message - top left */}
        <div className="absolute top-8 left-8">
          <div className="relative">
            {/* Soft-edged dark background with blur - rounded corner card extending off-screen */}
            <div
              className="absolute backdrop-blur-md shadow-2xl"
              style={{
                top: '-100vh',
                left: '-100vw',
                right: '-8rem',
                bottom: '-3rem',
                borderRadius: '8rem',
                background:
                  'radial-gradient(ellipse 110% 100% at 60% 60%, rgba(3, 7, 18, 0.95) 0%, rgba(17, 24, 39, 0.92) 50%, rgba(17, 24, 39, 0.88) 70%, rgba(17, 24, 39, 0.5) 85%, rgba(17, 24, 39, 0.15) 93%, transparent 100%)',
                filter: 'blur(7px)',
              }}
            />

            {/* Inner glow for depth */}
            <div
              className="absolute"
              style={{
                top: '-100vh',
                left: '-100vw',
                right: '-8rem',
                bottom: '-3rem',
                borderRadius: '8rem',
                background:
                  'radial-gradient(ellipse 100% 95% at 60% 60%, rgba(31, 41, 55, 0.2) 0%, rgba(31, 41, 55, 0.1) 60%, transparent 85%)',
                filter: 'blur(3px)',
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

        {consoleError && (
          <div className="absolute top-36 left-8 max-w-md">
            <Alert className="bg-gray-950/85 border border-yellow-500/70 text-yellow-200 shadow-lg">
              <AlertTitle className="text-lg font-semibold uppercase tracking-wide text-yellow-300">
                Developer console message
              </AlertTitle>
              <AlertDescription className="text-sm text-yellow-100/85">
                {consoleError.message}
              </AlertDescription>
              <div className="mt-3 flex justify-end">
                <button
                  className="rounded-md border border-yellow-400/60 px-3 py-1 text-xs font-medium text-yellow-100/80 transition hover:bg-yellow-500/10 hover:text-yellow-50"
                  onClick={dismissConsoleError}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </Alert>
          </div>
        )}

        {/* AI Usage Bars - positioned in top left quadrant */}
        <AiUsageBars />

        {userName && activeAccountId && (
          <div
            className="absolute bottom-0 left-0 flex flex-col items-start justify-end pb-3 pl-8"
            style={{ height: '30vh', paddingTop: '3rem' }}
          >
            <div className="mb-6">
              <SleepLight color="#00ffff" speed={8} />
            </div>
            <div className="relative flex flex-col gap-3">
              {/* Carousel container with tight background */}
              <div className="relative" style={{ width: '500px' }}>
                {/* Glassy background hugged to carousel - extends off left edge */}
                <div
                  className="absolute backdrop-blur-md shadow-2xl pointer-events-none"
                  style={{
                    top: '-1rem',
                    left: '-100vw',
                    right: '-1rem',
                    bottom: '-0.75rem',
                    borderRadius: '1rem',
                    background:
                      'linear-gradient(135deg, rgba(3, 7, 18, 0.92) 0%, rgba(17, 24, 39, 0.88) 100%)',
                  }}
                />

                {/* Inner glow for depth */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    top: '-1rem',
                    left: '-100vw',
                    right: '-1rem',
                    bottom: '-0.75rem',
                    borderRadius: '1rem',
                    background:
                      'linear-gradient(135deg, rgba(31, 41, 55, 0.15) 0%, transparent 60%)',
                  }}
                />

                {/* Subtle border */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    top: '-1rem',
                    left: '-100vw',
                    right: '-1rem',
                    bottom: '-0.75rem',
                    borderRadius: '1rem',
                    boxShadow: 'inset 0 1px 0 0 rgba(107, 114, 128, 0.5)',
                  }}
                />

                <div
                  className="relative z-10 px-3"
                  style={{ minHeight: '160px' }}
                >
                  <RepositoryCarousel4
                    account={
                      activeAccount ??
                      Result.match(accountsResult, {
                        onSuccess: accounts =>
                          accounts.find(acc => acc.id === activeAccountId) ??
                          null,
                        onFailure: () => null,
                        onInitial: () => null,
                      })
                    }
                    isFocused={isFocused}
                    ref={carouselRef}
                    repos={repos}
                  />
                </div>
              </div>

              {/* Controls container with separate tight background */}
              <div className="relative inline-block">
                {/* Glassy background hugged to controls - extends off left and bottom edges */}
                <div
                  className="absolute backdrop-blur-md shadow-lg pointer-events-none"
                  style={{
                    top: '-0.5rem',
                    left: '-100vw',
                    right: '-0.75rem',
                    bottom: '-100vh',
                    borderRadius: '0.75rem',
                    background:
                      'linear-gradient(135deg, rgba(3, 7, 18, 0.85) 0%, rgba(17, 24, 39, 0.80) 100%)',
                  }}
                />

                {/* Inner glow */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    top: '-0.5rem',
                    left: '-100vw',
                    right: '-0.75rem',
                    bottom: '-100vh',
                    borderRadius: '0.75rem',
                    background:
                      'linear-gradient(135deg, rgba(31, 41, 55, 0.12) 0%, transparent 60%)',
                  }}
                />

                {/* Subtle border */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    top: '-0.5rem',
                    left: '-100vw',
                    right: '-0.75rem',
                    bottom: '-100vh',
                    borderRadius: '0.75rem',
                    boxShadow: 'inset 0 1px 0 0 rgba(107, 114, 128, 0.3)',
                  }}
                />

                <div className="text-gray-500 text-sm flex items-center gap-3 relative z-10 px-3 py-1.5">
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
                    onSuccess: successResult => (
                      <RepositorySearch
                        isFocused={isFocused}
                        onSelectRepo={index => {
                          carouselRef.current?.jumpToIndex(index, true)
                        }}
                        repos={successResult.value}
                      />
                    ),
                    onInitial: () => null,
                    onFailure: () => null,
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
