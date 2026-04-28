import StepOption from '@/components/StepOption'
import { PatientPublicData } from '@/lib/types'

interface Props {
  patient: PatientPublicData
  onAnswer: (correct: boolean) => void
}

function CaseDetail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <span className="text-gray-500 text-sm sm:w-40 shrink-0">{label}:</span>
      <span className="text-gray-800 font-medium text-sm">{value}</span>
    </div>
  )
}

export default function Step3Case({ patient, onAnswer }: Props) {
  const tipoLabel = {
    consulta: 'Consulta externa',
    cirugia: 'Cirugía',
    procedimiento: 'Procedimiento',
  }[patient.tipo_atencion]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <p className="text-gray-800 text-base mb-4">
          Según nuestros registros, usted se encuentra en lista de espera para la siguiente atención:
        </p>

        <div className="bg-ccss-light rounded-xl p-4 space-y-2">
          <CaseDetail label="Tipo de atención" value={tipoLabel} />
          {patient.tipo_atencion !== 'consulta' && (
            <CaseDetail
              label={patient.tipo_atencion === 'cirugia' ? 'Cirugía' : 'Procedimiento'}
              value={patient.nombre_servicio}
            />
          )}
          {patient.tipo_atencion === 'cirugia' && (
            <CaseDetail label="Lateralidad" value={patient.lateralidad} />
          )}
          <CaseDetail label="Especialidad" value={patient.especialidad} />
          <CaseDetail label="Centro médico" value={patient.centro_medico} />
        </div>
      </div>

      <p className="text-gray-700 font-semibold text-base px-1">
        ¿Es correcta esta información?
      </p>

      <div className="space-y-3">
        <StepOption value="si" label="1 · Sí, es correcta" onClick={() => onAnswer(true)} />
        <StepOption value="no" label="2 · No es correcta" onClick={() => onAnswer(false)} />
      </div>
    </div>
  )
}
