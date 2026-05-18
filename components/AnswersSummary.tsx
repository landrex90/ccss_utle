'use client'

import { useState } from 'react'

export interface AnswerEntry {
  step:     number
  stepName: string
  answer:   string
}

interface Props {
  entries: AnswerEntry[]
}

export default function AnswersSummary({ entries }: Props) {
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="hc-surface w-full flex items-center justify-between px-4 py-2.5 rounded-xl
                   bg-ccss-light dark:bg-gray-700/50 border border-ccss-primary/20 dark:border-gray-600
                   text-sm font-medium text-ccss-primary dark:text-ccss-accent
                   hover:bg-ccss-light/80 transition-colors
                   focus:outline-none focus:ring-2 focus:ring-ccss-primary focus:ring-offset-2"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          Ver mis respuestas anteriores ({entries.length})
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {open && (
        <div className="mt-2 card dark:bg-gray-800 dark:border-gray-700 p-4 space-y-2 animate-fade-in">
          {entries.map((e) => (
            <div key={e.step} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-ccss-primary dark:bg-ccss-accent
                               flex items-center justify-center mt-0.5">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
              </span>
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {e.stepName}
                </span>
                <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">{e.answer}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
