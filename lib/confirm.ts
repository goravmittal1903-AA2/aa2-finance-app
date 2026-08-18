import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

interface ConfirmStore {
  isOpen: boolean
  options: ConfirmOptions
  resolve: ((value: boolean) => void) | null
  confirm: (options: ConfirmOptions) => Promise<boolean>
  handleConfirm: () => void
  handleCancel: () => void
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  isOpen: false,
  options: { title: '', message: '' },
  resolve: null,
  confirm: (options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      set({ isOpen: true, options, resolve })
    })
  },
  handleConfirm: () => {
    const { resolve } = get()
    if (resolve) resolve(true)
    set({ isOpen: false, resolve: null })
  },
  handleCancel: () => {
    const { resolve } = get()
    if (resolve) resolve(false)
    set({ isOpen: false, resolve: null })
  },
}))

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().confirm(options)
}
