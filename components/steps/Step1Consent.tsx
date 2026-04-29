import StepOption from '@/components/StepOption'

interface Props {
  nombrePaciente:  string
  onAnswer:        (authorized: boolean) => void
  pendingSelection?: string | null
}

export default function Step1Consent({ nombrePaciente, onAnswer, pendingSelection }: Props) {
  const disabled = !!pendingSelection

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
        <p className="text-gray-800 dark:text-gray-100 text-base leading-relaxed whitespace-pre-line">
          {`Hola ${nombrePaciente}, somos el asistente virtual de la Caja Costarricense de Seguro Social (CCSS).

Le contactamos para actualizar la información de su atención pendiente en lista de espera.

La información que usted brinde será utilizada únicamente para la gestión y actualización de su caso, de acuerdo con la normativa vigente.

Su participación es voluntaria y puede cerrar esta página en cualquier momento.

En ningún momento le solicitaremos contraseñas, cuentas bancarias ni códigos de seguridad.`}
        </p>
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
