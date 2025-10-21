import { Terminal } from 'lucide-react'

import {
  Alert,
  AlertTitle,
  AlertDescription,
} from 'renderer/components/ui/alert'

import SleepLight from 'renderer/components/ui/SleepLight'

export function MainScreen() {
  const userName = 'Handfish'

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-transparent drag-region">
      <SleepLight color="#00ffff" speed={8} />
      <Alert className="mt-5 bg-transparent border-transparent text-accent w-fit">
        <AlertTitle className="text-5xl text-teal-400">
          Hi, {userName}!
        </AlertTitle>

        <AlertDescription className="flex items-center gap-2 text-lg">
          <Terminal className="size-6 text-fuchsia-300" />

          <span className="text-gray-400">
            It's time to build something awesome!
          </span>
        </AlertDescription>
      </Alert>
    </main>
  )
}
