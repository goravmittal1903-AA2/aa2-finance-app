'use client'

import { useToastStore, type ToastMessage } from '@/lib/toast'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const styles = {
    success: {
      bg: 'bg-slate-900/95 text-white border-emerald-500/50 shadow-emerald-500/10',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />,
      bar: 'bg-emerald-500',
    },
    error: {
      bg: 'bg-slate-900/95 text-white border-red-500/50 shadow-red-500/10',
      icon: <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />,
      bar: 'bg-red-500',
    },
    warning: {
      bg: 'bg-slate-900/95 text-white border-amber-500/50 shadow-amber-500/10',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />,
      bar: 'bg-amber-500',
    },
    info: {
      bg: 'bg-slate-900/95 text-white border-blue-500/50 shadow-blue-500/10',
      icon: <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />,
      bar: 'bg-blue-500',
    },
  }[toast.type]

  return (
    <div className={`pointer-events-auto relative overflow-hidden rounded-2xl border backdrop-blur-md p-4 shadow-2xl transition-all duration-300 animate-in slide-in-from-right-5 ${styles.bg}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${styles.bar}`} />
      <div className="flex items-start gap-3 pl-1.5">
        {styles.icon}
        <div className="flex-1 min-w-0 pr-2">
          <h4 className="text-xs font-bold leading-snug">{toast.title}</h4>
          {toast.message && (
            <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed font-normal">{toast.message}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
