import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Type-safe IPC listener function
type IpcListener = (event: IpcRendererEvent, ...args: unknown[]) => void

const electronAPI = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void): void => {
      const wrappedListener: IpcListener = (_event, ...args) => listener(...args)
      ipcRenderer.on(channel, wrappedListener)
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void): void => {
      const wrappedListener: IpcListener = (_event, ...args) => listener(...args)
      ipcRenderer.removeListener(channel, wrappedListener)
    },
  },
}

contextBridge.exposeInMainWorld('electron', electronAPI)

declare global {
  interface Window {
    electron: typeof electronAPI
  }
}
