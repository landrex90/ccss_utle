'use client'

import { useState } from 'react'
import StepOption from '@/components/StepOption'
import { TipoAtencion, MOTIVOS_RETIRO } from '@/lib/types'

type MainOption = 'si' | 'no_ya_realizada' | 'no_ya_programada' | 'no_ya_no_deseo'

interface Props {
  tipoAtencion: TipoAtencion
  onContinue: () => void
  onDepurado: (reason: 'ya_realizada' | 'ya_programada') => void
  onRenuncia: (motivo: string) => void
}

export default function Step4Continue({ tipoAtencion, onContinue, onDepurado, onRenuncia }: Props) {
  const [selected, setSelected] = useState<MainOption | null>(null)
  const [showMotivos, setShowMotivos] = useState(false)

  function handleMain(value: string) {
    const v = value as MainOption
    setSelected(v)

    if (v === 'si') {
      onContinue()
    } else if (v === 'no_ya_realizada') {
      onDepurado('ya_realizada')
    } else if (v === 'no_ya_programada') {
      onDepurado('ya_programada')
    } else if (v === 'no_ya_no_deseo') {
      setShowMotivos(true)
    }
  }

  if (showMotivos) {
    const motivos = MOTIVOS_RETIRO[tipoAtencion]
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-gray-800 text-base">
            ¿Cuál es el motivo por el que ya no desea continuar con esta atención?
          </p>
        </div>
        <div className="space-y-3">
          {motivos.map((m, i) => (
            <StepOption
              key={m.value}
              value={m.value}
              label={`${i + 1} · ${m.label}`}
              onClick={(v) => onRenuncia(v)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <p className="text-gray-800 text-base">
          ¿Desea continuar con esta atención pendiente?
        </p>
      </div>
      <div className="space-y-3">
        <StepOption value="si" label="1 · Sí, deseo continuar" selected={selected === 'si'} onClick={handleMain} />
        <StepOption value="no_ya_realizada" label="2 · No, ya me fue realizada" selected={selected === 'no_ya_realizada'} onClick={handleMain} />
        <StepOption value="no_ya_programada" label="3 · No, ya la tengo programada" selected={selected === 'no_ya_programada'} onClick={handleMain} />
        <StepOption value="no_ya_no_deseo" label="4 · No, ya no la deseo" selected={selected === 'no_ya_no_deseo'} onClick={handleMain} />
      </div>
    </div>
  )
}
