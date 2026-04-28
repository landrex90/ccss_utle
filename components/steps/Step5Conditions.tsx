'use client'

import { useState } from 'react'
import StepOption from '@/components/StepOption'
import { MOTIVOS_NO_ASISTIR } from '@/lib/types'

interface Props {
  onDone: (flexibilidad: 'si' | 'no', condiciones: 'si' | 'no', motivoNoAsistir: string | null) => void
}

type SubStep = '5a' | '5b' | '5b_motivos'

export default function Step5Conditions({ onDone }: Props) {
  const [subStep, setSubStep] = useState<SubStep>('5a')
  const [flexibilidad, setFlexibilidad] = useState<'si' | 'no' | null>(null)
  const [condiciones, setCondiciones] = useState<'si' | 'no' | null>(null)

  function handle5a(value: string) {
    const v = value as 'si' | 'no'
    setFlexibilidad(v)
    setSubStep('5b')
  }

  function handle5b(value: string) {
    const v = value as 'si' | 'no'
    setCondiciones(v)
    if (v === 'si') {
      onDone(flexibilidad!, 'si', null)
    } else {
      setSubStep('5b_motivos')
    }
  }

  function handleMotivo(value: string) {
    onDone(flexibilidad!, condiciones ?? 'no', value)
  }

  if (subStep === '5a') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-gray-800 text-base leading-relaxed">
            En caso de que se diera la oportunidad y con el fin de adelantar su atención, ¿estaría usted dispuesto(a) a ser atendido(a) en <strong>otro centro médico de la CCSS</strong>?
          </p>
        </div>
        <div className="space-y-3">
          <StepOption value="si" label="1 · Sí" onClick={handle5a} />
          <StepOption value="no" label="2 · No" onClick={handle5a} />
        </div>
      </div>
    )
  }

  if (subStep === '5b') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-gray-800 text-base leading-relaxed">
            Si se le asigna una cita próximamente, ¿se encuentra en <strong>condiciones de asistir</strong>?
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Por ejemplo: que esté en el país, que no tenga una enfermedad infecciosa activa o alguna situación temporal que le impida acudir.
          </p>
        </div>
        <div className="space-y-3">
          <StepOption value="si" label="1 · Sí" onClick={handle5b} />
          <StepOption value="no" label="2 · No" onClick={handle5b} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <p className="text-gray-800 text-base">¿Cuál es el motivo por el que no puede asistir?</p>
      </div>
      <div className="space-y-3">
        {MOTIVOS_NO_ASISTIR.map((m, i) => (
          <StepOption
            key={m.value}
            value={m.value}
            label={`${i + 1} · ${m.label}`}
            onClick={handleMotivo}
          />
        ))}
      </div>
    </div>
  )
}
