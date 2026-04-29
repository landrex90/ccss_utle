interface Props {
  label:         string
  value:         string
  selectedValue?: string   // set by parent while auto-advance delay runs
  onClick:       (value: string) => void
  disabled?:     boolean
}

export default function StepOption({ label, value, selectedValue, onClick, disabled }: Props) {
  const isSelected = selectedValue === value

  return (
    <button
      type="button"
      onClick={() => !disabled && onClick(value)}
      disabled={disabled}
      aria-pressed={isSelected}
      className={`step-option-btn${isSelected ? ' selected' : ''}${disabled ? ' opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="flex-1">{label}</span>

      {/* Checkmark — animates in when selected */}
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                    transition-all duration-150
                    ${isSelected
                      ? 'bg-ccss-primary dark:bg-ccss-accent animate-check'
                      : 'bg-gray-100 dark:bg-gray-700'
                    }`}
        aria-hidden="true"
      >
        {isSelected && (
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
          </svg>
        )}
      </span>
    </button>
  )
}
