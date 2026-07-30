import { create } from 'zustand'

export interface ToastMessage {
  id: string
  title: string
  message?: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

type ToastStore = {
  toasts: ToastMessage[]
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    const duration = toast.duration ?? 4000
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (title: string, message?: string, duration = 4000) =>
    useToastStore.getState().addToast({ title, message, type: 'success', duration }),
  error: (title: string, message?: string, duration = 6000) =>
    useToastStore.getState().addToast({ title, message, type: 'error', duration }),
  warning: (title: string, message?: string, duration = 5000) =>
    useToastStore.getState().addToast({ title, message, type: 'warning', duration }),
  info: (title: string, message?: string, duration = 4000) =>
    useToastStore.getState().addToast({ title, message, type: 'info', duration }),
}
