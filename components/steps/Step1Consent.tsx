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
          Hola <strong>{nombrePaciente}</strong>, la Caja Costarricense de Seguro Social (CCSS)
          le contacta para actualizar la información de su atención pendiente en lista de espera.
        </p>
        <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
          La información que usted brinde será utilizada únicamente para la gestión y
          actualización de su caso, de acuerdo con la normativa vigente.
          Su participación es voluntaria y puede cerrar esta página en cualquier momento.
        </p>
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Aviso de seguridad
          </p>
          <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside leading-relaxed">
            <li>En ningún momento le solicitaremos contraseñas, números de cuentas bancarias ni códigos de seguridad.</li>
            <li>Este enlace es personal e intransferible.</li>
            <li>
              Si tiene dudas sobre la autenticidad de este mensaje, escríbanos a:{' '}
              <span className="font-medium">gm_utle_gelisespera@ccss.sa.cr</span>
            </li>
          </ul>
        </div>
      </div>

      <p className="text-gray-700 dark:text-gray-200 font-semibold text-base px-1">
        ¿Autoriza el uso de la información que proporcione para estos fines?
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
