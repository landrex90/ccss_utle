interface Props {
  label: string
  value: string
  selected?: boolean
  onClick: (value: string) => void
}

export default function StepOption({ label, value, selected = false, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`step-option-btn${selected ? ' selected' : ''}`}
      aria-pressed={selected}
    >
      {label}
    </button>
  )
}
