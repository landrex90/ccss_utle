import { FormAnswers, PatientPublicData, MOTIVOS_RETIRO, MOTIVOS_NO_ASISTIR } from '@/lib/types'

const CONTACT_LABELS: Record<string, string> = {
  llamada:    'Llamada telefónica',
  whatsapp:   'WhatsApp',
  correo:     'Correo electrónico',
  sms:        'Mensaje de texto (SMS)',
  cualquiera: 'Cualquiera de las anteriores',
}

interface Row { label: string; value: string }

function SummaryRow({ label, value }: Row) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-3
                    border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 sm:text-right">{value}</span>
    </div>
  )
}

interface Props {
  answers:   FormAnswers
  patient:   PatientPublicData
  onConfirm: () => void
  onBack:    () => void
  loading:   boolean
}

export default function SummaryScreen({ answers, patient, onConfirm, onBack, loading }: Props) {
  const tipo = patient.tipo_atencion

  const motivoNoAsistirLabel = MOTIVOS_NO_ASISTIR.find(
    m => m.value === answers.paso_5b_motivo_no_asistir
  )?.label ?? answers.paso_5b_motivo_no_asistir ?? ''

  const rows: Row[] = [
    { label: 'Consentimiento',   value: 'Autorizado ✓' },
    { label: 'Verificación',     value: `Exitosa (${answers.paso_2_intentos ?? 1} intento${(answers.paso_2_intentos ?? 1) !== 1 ? 's' : ''})` },
    { label: 'Información',      value: 'Correcta ✓' },
    ...(patient.nombre_servicio  ? [{ label: 'Servicio',         value: patient.nombre_servicio }]  : []),
    ...(patient.especialidad     ? [{ label: 'Especialidad',     value: patient.especialidad }]     : []),
    { label: 'Centro médico',      value: patient.centro_medico },
    // Cirugía
    ...(tipo === 'cirugia' && patient.procedimiento ? [{ label: 'Procedimiento', value: patient.procedimiento }] : []),
    ...(tipo === 'cirugia' && patient.lateralidad   ? [{ label: 'Lateralidad',   value: patient.lateralidad }]   : []),
    // Consulta / Procedimiento
    ...(tipo !== 'cirugia' && patient.tipo_consulta ? [{ label: 'Tipo de consulta', value: patient.tipo_consulta }] : []),
    ...(tipo !== 'cirugia' && patient.lateralidad   ? [{ label: 'Lateralidad',      value: patient.lateralidad }]   : []),
    ...(tipo !== 'cirugia' && patient.fecha_cita    ? [{ label: 'Fecha de cita',    value: patient.fecha_cita }]    : []),
    ...(tipo !== 'cirugia' && patient.hora_cita     ? [{ label: 'Hora de cita',     value: patient.hora_cita }]     : []),
    { label: 'Decisión',           value: 'Desea continuar ✓' },
    { label: 'Centro alternativo', value: answers.paso_5a_flexibilidad_centro === 'si' ? 'Sí, acepta' : 'No acepta' },
    { label: 'Condiciones para asistir', value: answers.paso_5b_condiciones_asistir === 'si'
        ? 'Puede asistir ✓'
        : `No puede asistir — ${motivoNoAsistirLabel}` },
    { label: 'Contacto preferido', value: CONTACT_LABELS[answers.paso_6_medio_contacto ?? ''] ?? '' },
  ]

  return (
    <div className="animate-fade-in">
      <div className="card dark:bg-gray-800 dark:border-gray-700 p-5 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-ccss-light dark:bg-ccss-primary/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-ccss-primary dark:text-ccss-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Revise su información</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Confirme que todo es correcto antes de enviar</p>
          </div>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.filter(r => r.value).map(r => <SummaryRow key={r.label} {...r} />)}
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Enviando...
            </span>
          ) : 'Confirmar y enviar'}
        </button>

        <button
          onClick={onBack}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 dark:border-gray-600
                     text-gray-600 dark:text-gray-300 font-medium text-sm
                     hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
                     disabled:opacity-50"
        >
          ← Volver y corregir
        </button>
      </div>
    </div>
  )
}
