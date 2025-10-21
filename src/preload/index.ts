import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (event, ...args) => listener(...args))
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener)
    },
  },
}

contextBridge.exposeInMainWorld('electron', electronAPI)

declare global {
  interface Window {
    electron: typeof electronAPI
  }
}
