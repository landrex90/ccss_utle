'use client'

import { useEffect } from 'react'

interface Props {
  title:     string
  message:   string
  confirmLabel?: string
  cancelLabel?:  string
  onConfirm: () => void
  onCancel:  () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Sí, confirmar',
  cancelLabel  = 'Cancelar',
  onConfirm,
  onCancel,
}: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative card dark:bg-gray-800 dark:border-gray-700 w-full max-w-sm p-6 shadow-2xl animate-fade-in">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
          </div>
          <div>
            <h3 id="modal-title" className="font-semibold text-gray-800 dark:text-gray-100 text-base">
              {title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-5">
          <button
            onClick={onConfirm}
            className="w-full py-3 px-4 rounded-xl bg-ccss-primary dark:bg-ccss-accent text-white
                       font-semibold text-sm hover:bg-ccss-dark transition-colors
                       focus:outline-none focus:ring-2 focus:ring-ccss-primary focus:ring-offset-2"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            autoFocus
            className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 dark:border-gray-600
                       text-gray-700 dark:text-gray-200 font-semibold text-sm
                       hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
