export type TipoAtencion = 'consulta' | 'cirugia' | 'procedimiento'

export type EstadoFinal =
  | 'NO_AUTORIZO'
  | 'NO_VERIFICADO'
  | 'INFO_INCORRECTA'
  | 'DEPURADO_YA_ATENDIDO'
  | 'DEPURADO_YA_PROGRAMADO'
  | 'DEPURADO_RENUNCIA'
  | 'NO_ASEGURADO'
  | 'ACTIVO'

export interface PatientPublicData {
  nombre_paciente: string
  tipo_atencion: TipoAtencion
  nombre_servicio: string | null
  especialidad: string | null
  centro_medico: string
  lateralidad: string | null
  procedimiento: string | null
  tipo_consulta: string | null
  fecha_cita: string | null
  hora_cita: string | null
}

export interface FormAnswers {
  token: string
  canal: 'correo'
  verification_token?: string
  paso_1_consentimiento?: 'si_autorizo' | 'no_autorizo'
  paso_2_verificacion?: 'exitosa' | 'fallida'
  paso_2_intentos?: number
  paso_3_info_correcta?: 'si' | 'no'
  paso_4_desea_continuar?: 'si' | 'no_ya_no_deseo' | 'no_asegurado'
  motivo_retiro?: string | null
  paso_5a_flexibilidad_centro?: 'si' | 'no'
  paso_5b_condiciones_asistir?: 'si' | 'no'
  paso_5b_motivo_no_asistir?: string | null
  paso_6_medio_contacto?: 'llamada' | 'whatsapp' | 'correo' | 'sms' | 'cualquiera'
  estado_final?: EstadoFinal
  completado?: boolean
  paso_abandono?: number | null
}

export const MOTIVOS_RETIRO: { value: string; label: string }[] = [
  { value: 'ya_no_deseo_la_atencion', label: 'Ya no deseo la atención' },
  { value: 'acudi_ccss',              label: 'Acudí a otro centro de la CCSS' },
  { value: 'acudi_privado',           label: 'Acudí a otro centro médico privado' },
  { value: 'ya_no_necesito',          label: 'Ya no necesito la atención' },
  { value: 'contraindicacion_medica', label: 'Contraindicación médica' },
  { value: 'fallecimiento',           label: 'Fallecimiento' },
]

export const MOTIVOS_NO_ASISTIR = [
  { value: 'problemas_salud',       label: 'Problemas de salud' },
  { value: 'hospitalizacion',       label: 'Hospitalización o recuperación médica' },
  { value: 'falta_transporte',      label: 'Falta de transporte o traslado' },
  { value: 'falta_acompanante',     label: 'Falta de acompañante o situación familiar' },
  { value: 'obligaciones',          label: 'Obligaciones laborales, académicas o legales' },
  { value: 'problemas_economicos',  label: 'Problemas económicos' },
  { value: 'fuera_pais',            label: 'Fuera del país o de la zona' },
  { value: 'decision_personal',     label: 'Decisión personal' },
  { value: 'otro_motivo',           label: 'Otro motivo' },
]
