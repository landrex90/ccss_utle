import StepOption from '@/components/StepOption'

type MedioContacto = 'llamada' | 'whatsapp' | 'correo' | 'sms' | 'cualquiera'

interface Props {
  onDone: (medio: MedioContacto) => void
}

const MEDIOS: { value: MedioContacto; label: string }[] = [
  { value: 'llamada', label: 'Llamada telefónica' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'correo', label: 'Correo electrónico' },
  { value: 'sms', label: 'Mensaje de texto (SMS)' },
  { value: 'cualquiera', label: 'Cualquiera de las anteriores' },
]

export default function Step6Contact({ onDone }: Props) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <p className="text-gray-800 text-base">
          ¿Por cuál medio prefiere que lo contactemos en el futuro?
        </p>
      </div>
      <div className="space-y-3">
        {MEDIOS.map((m, i) => (
          <StepOption
            key={m.value}
            value={m.value}
            label={`${i + 1} · ${m.label}`}
            onClick={(v) => onDone(v as MedioContacto)}
          />
        ))}
      </div>
    </div>
  )
}
