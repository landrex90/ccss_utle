const STEP_NAMES = ['Consentimiento', 'Verificación', 'Sus datos', 'Decisión', 'Disponibilidad', 'Contacto']

interface Props {
  currentStep: number
  totalSteps:  number
  onBack?:     () => void
  canGoBack:   boolean
}

export default function ProgressBar({ currentStep, totalSteps, onBack, canGoBack }: Props) {
  const pct      = Math.round((currentStep / totalSteps) * 100)
  const stepName = STEP_NAMES[currentStep - 1] ?? ''

  return (
    <div className="mb-6">
      {/* Top row: back + step name + percentage */}
      <div className="flex items-center gap-3 mb-2">
        {canGoBack ? (
          <button
            onClick={onBack}
            aria-label="Volver al paso anterior"
            className="flex-shrink-0 flex items-center gap-1 text-sm text-ccss-primary dark:text-ccss-accent
                       font-medium hover:underline focus:outline-none focus:ring-2
                       focus:ring-ccss-primary rounded-md px-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            Volver
          </button>
        ) : (
          <span className="flex-shrink-0 w-14" />
        )}

        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {stepName}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
            {currentStep}/{totalSteps}
          </span>
        </div>

        <span className="flex-shrink-0 w-14 text-right text-sm font-semibold text-ccss-primary dark:text-ccss-accent">
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="progress-bar-fill bg-ccss-primary dark:bg-ccss-accent h-2 rounded-full
                     transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label={`Paso ${currentStep} de ${totalSteps}: ${stepName}`}
        />
      </div>
    </div>
  )
}
