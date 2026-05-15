import StepOption from '@/components/StepOption'
import { PatientPublicData } from '@/lib/types'

interface Props {
  patient:           PatientPublicData
  onAnswer:          (correct: boolean) => void
  pendingSelection?: string | null
}

function CaseDetail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <span className="text-gray-500 dark:text-gray-400 text-sm sm:w-40 shrink-0">{label}:</span>
      <span className="text-gray-800 dark:text-gray-100 font-medium text-sm">{value}</span>
    </div>
  )
}

export default function Step3Case({ patient, onAnswer, pendingSelection }: Props) {
  const disabled    = !!pendingSelection
  const tipo        = patient.tipo_atencion
  const tipoLabel   = { consulta: 'Consulta externa', cirugia: 'Cirugía', procedimiento: 'Procedimiento' }[tipo]
  const servicioLabel = tipo === 'cirugia' ? 'Cirugía' : tipo === 'procedimiento' ? 'Procedimiento' : 'Consulta'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
        <p className="text-gray-800 dark:text-gray-100 text-base mb-4">
          Según nuestros registros, usted se encuentra en lista de espera para la siguiente atención:
        </p>
        <div className="bg-ccss-light dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
          <CaseDetail label="Tipo de atención" value={tipoLabel} />
          <CaseDetail label={servicioLabel}     value={patient.nombre_servicio} />
          <CaseDetail label="Especialidad"      value={patient.especialidad} />
          <CaseDetail label="Centro médico"     value={patient.centro_medico} />

          {/* Cirugía: procedimiento + lateralidad */}
          {tipo === 'cirugia' && (
            <>
              <CaseDetail label="Procedimiento" value={patient.procedimiento} />
              <CaseDetail label="Lateralidad"   value={patient.lateralidad} />
            </>
          )}

          {/* Consulta / Procedimiento: tipo de consulta, lateralidad, fecha y hora */}
          {(tipo === 'consulta' || tipo === 'procedimiento') && (
            <>
              <CaseDetail label="Tipo de consulta" value={patient.tipo_consulta} />
              <CaseDetail label="Lateralidad"      value={patient.lateralidad} />
              <CaseDetail label="Fecha de cita"    value={patient.fecha_cita} />
              <CaseDetail label="Hora de cita"     value={patient.hora_cita} />
            </>
          )}
        </div>
      </div>

      <p className="text-gray-700 dark:text-gray-200 font-semibold text-base px-1">
        ¿Es correcta esta información?
      </p>

      <div className="space-y-3">
        <StepOption value="si" label="1 · Sí, es correcta"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onAnswer(true)} />
        <StepOption value="no" label="2 · No es correcta"
          selectedValue={pendingSelection ?? undefined} disabled={disabled}
          onClick={() => onAnswer(false)} />
      </div>
    </div>
  )
}
