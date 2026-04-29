import StepOption from '@/components/StepOption'
import { FormAnswers } from '@/lib/types'

type MedioContacto = NonNullable<FormAnswers['paso_6_medio_contacto']>

interface Props {
  onDone:            (medio: MedioContacto) => void
  pendingSelection?: string | null
}

const MEDIOS: { value: MedioContacto; label: string }[] = [
  { value: 'llamada',    label: 'Llamada telefónica' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'correo',    label: 'Correo electrónico' },
  { value: 'sms',       label: 'Mensaje de texto (SMS)' },
  { value: 'cualquiera',label: 'Cualquiera de las anteriores' },
]

export default function Step6Contact({ onDone, pendingSelection }: Props) {
  const disabled = !!pendingSelection

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
        <p className="text-gray-800 dark:text-gray-100 text-base">
          ¿Por cuál medio prefiere que lo contactemos en el futuro?
        </p>
      </div>
      <div className="space-y-3">
        {MEDIOS.map((m, i) => (
          <StepOption
            key={m.value} value={m.value}
            label={`${i + 1} · ${m.label}`}
            selectedValue={pendingSelection ?? undefined}
            disabled={disabled}
            onClick={(v) => onDone(v as MedioContacto)}
          />
        ))}
      </div>
    </div>
  )
}
