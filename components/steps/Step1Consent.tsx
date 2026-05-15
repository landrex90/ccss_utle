import StepOption from '@/components/StepOption'

interface Props {
  nombrePaciente:    string
  onAnswer:          (authorized: boolean) => void
  pendingSelection?: string | null
}

export default function Step1Consent({ nombrePaciente, onAnswer, pendingSelection }: Props) {
  const disabled = !!pendingSelection

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card dark:bg-gray-800 dark:border-gray-700 p-6 space-y-4">
        <p className="text-gray-800 dark:text-gray-100 text-base leading-relaxed">
          Hola <strong>{nombrePaciente}</strong>, soy el asistente virtual de la CCSS.
        </p>
        <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
          Este contacto forma parte de una campaña oficial de actualización de datos de las listas de espera.
        </p>
        <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
          Le contactamos para actualizar información relacionada con su atención pendiente.
          Su participación es voluntaria.
        </p>
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
            Por seguridad, recuerde que la CCSS nunca solicitará:
          </p>
          <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside leading-relaxed">
            <li>contraseñas</li>
            <li>códigos de verificación</li>
            <li>información bancaria</li>
            <li>depósitos o pagos</li>
          </ul>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Si tiene dudas sobre este proceso:{' '}
          <span className="font-medium text-ccss-primary dark:text-ccss-accent">
            gm_utle_gelisespera@ccss.sa.cr
          </span>
        </p>
      </div>

      <p className="text-gray-700 dark:text-gray-200 font-semibold text-base px-1">
        ¿Autoriza el uso de la información brindada para este proceso?
      </p>

      <div className="space-y-3">
        <StepOption value="si" label="1 · Sí, autorizo"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onAnswer(true)} />
        <StepOption value="no" label="2 · No autorizo"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onAnswer(false)} />
      </div>
    </div>
  )
}
