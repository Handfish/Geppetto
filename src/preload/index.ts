import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type IpcListener = (event: IpcRendererEvent, ...args: unknown[]) => void

// Map original listener -> wrapped listener
const listenerMap = new WeakMap<Function, IpcListener>()

const electronAPI = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),

    on: (channel: string, listener: (...args: unknown[]) => void) => {
      let wrapped = listenerMap.get(listener)
      if (!wrapped) {
        wrapped = (_event, ...args) => listener(...args)
        listenerMap.set(listener, wrapped)
      }
      ipcRenderer.on(channel, wrapped)
    },

    removeListener: (
      channel: string,
      listener: (...args: unknown[]) => void
    ) => {
      const wrapped = listenerMap.get(listener)
      if (wrapped) {
        ipcRenderer.removeListener(channel, wrapped)
        listenerMap.delete(listener)
      }
    },

    once: (channel: string, listener: (...args: unknown[]) => void) => {
      const wrapped = (_event: IpcRendererEvent, ...args: unknown[]) =>
        listener(...args)
      ipcRenderer.once(channel, wrapped)
    },
  },
}

contextBridge.exposeInMainWorld('electron', electronAPI)

declare global {
  interface Window {
    electron: typeof electronAPI
  }
}
