'use client'

import { useConfirmStore } from '@/lib/confirm'
import { AlertTriangle, Trash2, HelpCircle, X } from 'lucide-react'

export function ConfirmDialog() {
  const { isOpen, options, handleConfirm, handleCancel } = useConfirmStore()

  if (!isOpen) return null

  const isDanger = options.variant === 'danger' || options.title.toLowerCase().includes('delete') || options.title.toLowerCase().includes('purge')
  const confirmLabel = options.confirmText || (isDanger ? 'Yes, Delete' : 'Confirm')
  const cancelLabel = options.cancelText || 'Cancel'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      {/* Sticky Note / System Themed Modal Card */}
      <div className="bg-slate-900 border border-slate-700 text-white w-full max-w-md p-6 rounded-3xl shadow-2xl space-y-4 relative overflow-hidden">
        {/* Sticky Accent Top Bar */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${isDanger ? 'bg-red-500' : 'bg-amber-400'}`} />

        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
              isDanger
                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              {isDanger ? <Trash2 className="w-5.5 h-5.5" /> : <AlertTriangle className="w-5.5 h-5.5" />}
            </div>
            <div>
              <h3 className="font-bold text-base text-white">{options.title}</h3>
              <p className="text-[11px] text-slate-400 font-mono">AA2 Security & Action Validation</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Box */}
        <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed font-medium">
          {options.message}
        </div>

        {/* Actions */}
        <div className="flex gap-2.5 pt-1">
          <button
            onClick={handleCancel}
            className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 py-3 px-4 text-white font-bold text-xs rounded-xl transition shadow-lg ${
              isDanger
                ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
