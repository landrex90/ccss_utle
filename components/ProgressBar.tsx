interface Props {
  currentStep: number
  totalSteps: number
}

export default function ProgressBar({ currentStep, totalSteps }: Props) {
  const pct = Math.round((currentStep / totalSteps) * 100)

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-500">
          Paso {currentStep} de {totalSteps}
        </span>
        <span className="text-sm font-medium text-ccss-primary">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-ccss-primary h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
        />
      </div>
    </div>
  )
}
