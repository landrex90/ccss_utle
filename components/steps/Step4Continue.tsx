'use client'

import { useState } from 'react'
import StepOption from '@/components/StepOption'
import { MOTIVOS_RETIRO } from '@/lib/types'

interface Props {
  onContinue:          () => void
  onNoAsegurado:       () => void
  onRenunciaIntent:    () => void
  onRenunciaConfirmed: (motivo: string) => void
  pendingSelection?:   string | null
  confirmModalOpen:    boolean
}

export default function Step4Continue({
  onContinue, onNoAsegurado,
  onRenunciaIntent, onRenunciaConfirmed,
  pendingSelection, confirmModalOpen,
}: Props) {
  const [showMotivos, setShowMotivos]   = useState(false)
  const [renunciaFlow, setRenunciaFlow] = useState(false)
  const disabled = !!pendingSelection || confirmModalOpen

  if (!confirmModalOpen && renunciaFlow && !showMotivos) {
    setShowMotivos(true)
    setRenunciaFlow(false)
  }

  if (showMotivos) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
          <p className="text-gray-800 dark:text-gray-100 text-base">
            Motivo del retiro
          </p>
        </div>
        <div className="space-y-3">
          {MOTIVOS_RETIRO.map((m, i) => (
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
        <StepOption value="no_ya_no_deseo" label="2 · No, ya no la deseo"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => { setRenunciaFlow(true); onRenunciaIntent() }} />
        <StepOption value="no_asegurado" label="3 · Sí, pero no estoy asegurado"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onNoAsegurado()} />
      </div>
    </div>
  )
}
