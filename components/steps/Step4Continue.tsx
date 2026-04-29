'use client'

import { useState } from 'react'
import StepOption from '@/components/StepOption'
import { TipoAtencion, MOTIVOS_RETIRO } from '@/lib/types'

interface Props {
  tipoAtencion:        TipoAtencion
  onContinue:          () => void
  onDepurado:          (reason: 'ya_realizada' | 'ya_programada') => void
  onRenunciaIntent:    () => void
  onRenunciaConfirmed: (motivo: string) => void
  pendingSelection?:   string | null
  confirmModalOpen:    boolean
}

export default function Step4Continue({
  tipoAtencion, onContinue, onDepurado,
  onRenunciaIntent, onRenunciaConfirmed,
  pendingSelection, confirmModalOpen,
}: Props) {
  const [showMotivos, setShowMotivos] = useState(false)
  const disabled = !!pendingSelection || confirmModalOpen

  // After confirm modal closes (confirmModalOpen goes false), show motivos
  // We track if we entered renuncia flow
  const [renunciaFlow, setRenunciaFlow] = useState(false)

  if (!confirmModalOpen && renunciaFlow && !showMotivos) {
    setShowMotivos(true)
    setRenunciaFlow(false)
  }

  if (showMotivos) {
    const motivos = MOTIVOS_RETIRO[tipoAtencion]
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
          <p className="text-gray-800 dark:text-gray-100 text-base">
            ¿Cuál es el motivo por el que ya no desea continuar con esta atención?
          </p>
        </div>
        <div className="space-y-3">
          {motivos.map((m, i) => (
            <StepOption
              key={m.value}
              value={m.value}
              label={`${i + 1} · ${m.label}`}
              onClick={(v) => onRenunciaConfirmed(v)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
        <p className="text-gray-800 dark:text-gray-100 text-base">
          ¿Desea continuar con esta atención pendiente?
        </p>
      </div>
      <div className="space-y-3">
        <StepOption value="si" label="1 · Sí, deseo continuar"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onContinue()} />
        <StepOption value="no_ya_realizada" label="2 · No, ya me fue realizada"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onDepurado('ya_realizada')} />
        <StepOption value="no_ya_programada" label="3 · No, ya la tengo programada"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onDepurado('ya_programada')} />
        <StepOption value="no_ya_no_deseo" label="4 · No, ya no la deseo"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => { setRenunciaFlow(true); onRenunciaIntent() }} />
      </div>
    </div>
  )
}
