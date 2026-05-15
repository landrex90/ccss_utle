'use client'

import { useState } from 'react'
import StepOption from '@/components/StepOption'
import { MOTIVOS_NO_ASISTIR } from '@/lib/types'

interface Props {
  onDone:            (flexibilidad: 'si'|'no', condiciones: 'si'|'no', motivoNoAsistir: string|null) => void
  pendingSelection?: string | null
}

type SubStep = '5a' | '5b' | '5b_motivos'

export default function Step5Conditions({ onDone, pendingSelection }: Props) {
  const [subStep,      setSubStep]      = useState<SubStep>('5a')
  const [flexibilidad, setFlexibilidad] = useState<'si'|'no'|null>(null)
  const disabled = !!pendingSelection

  function handle5a(value: string) {
    const v = value as 'si'|'no'
    setFlexibilidad(v)
    setSubStep('5b')
  }

  function handle5b(value: string) {
    const v = value as 'si'|'no'
    if (v === 'si') { onDone(flexibilidad!, 'si', null); return }
    setSubStep('5b_motivos')
  }

  if (subStep === '5a') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card dark:bg-gray-800 dark:border-gray-700 p-6 space-y-3">
          <p className="text-gray-800 dark:text-gray-100 text-base leading-relaxed">
            ¿Estaría dispuesto/a a ser atendido/a en otro centro médico de la CCSS
            si existiera una oportunidad mediante un programa especial o campaña?
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            En ocasiones esto permite adelantar atenciones médicas.
          </p>
        </div>
        <div className="space-y-3">
          <StepOption value="si" label="1 · Sí"
            selectedValue={pendingSelection ?? undefined} disabled={disabled}
            onClick={handle5a} />
          <StepOption value="no" label="2 · No"
            selectedValue={pendingSelection ?? undefined} disabled={disabled}
            onClick={handle5a} />
        </div>
      </div>
    )
  }

  if (subStep === '5b') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
          <p className="text-gray-800 dark:text-gray-100 text-base leading-relaxed">
            Si se le asigna una cita próximamente, ¿se encuentra en condiciones de asistir?
          </p>
        </div>
        <div className="space-y-3">
          <StepOption value="si" label="1 · Sí"
            selectedValue={pendingSelection ?? undefined} disabled={disabled}
            onClick={handle5b} />
          <StepOption value="no" label="2 · No"
            selectedValue={pendingSelection ?? undefined} disabled={disabled}
            onClick={handle5b} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
        <p className="text-gray-800 dark:text-gray-100 text-base">
          Motivo de no asistencia
        </p>
      </div>
      <div className="space-y-3">
        {MOTIVOS_NO_ASISTIR.map((m, i) => (
          <StepOption
            key={m.value} value={m.value}
            label={`${i + 1} · ${m.label}`}
            onClick={(v) => onDone(flexibilidad!, 'no', v)}
          />
        ))}
      </div>
    </div>
  )
}
