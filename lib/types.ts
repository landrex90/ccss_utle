export type TipoAtencion = 'consulta' | 'cirugia' | 'procedimiento'

export type EstadoFinal =
  | 'NO_AUTORIZO'
  | 'NO_VERIFICADO'
  | 'INFO_INCORRECTA'
  | 'DEPURADO_YA_ATENDIDO'
  | 'DEPURADO_YA_PROGRAMADO'
  | 'DEPURADO_RENUNCIA'
  | 'ACTIVO'

export interface PatientPublicData {
  nombre_paciente: string
  tipo_atencion: TipoAtencion
  nombre_servicio: string | null
  especialidad: string | null
  centro_medico: string
  lateralidad: string | null
}

export interface FormAnswers {
  token: string
  canal: 'correo'
  verification_token?: string
  paso_1_consentimiento?: 'si_autorizo' | 'no_autorizo'
  paso_2_verificacion?: 'exitosa' | 'fallida'
  paso_2_intentos?: number
  paso_3_info_correcta?: 'si' | 'no'
  paso_4_desea_continuar?: 'si' | 'no_ya_realizada' | 'no_ya_programada' | 'no_ya_no_deseo'
  motivo_retiro?: string | null
  paso_5a_flexibilidad_centro?: 'si' | 'no'
  paso_5b_condiciones_asistir?: 'si' | 'no'
  paso_5b_motivo_no_asistir?: string | null
  paso_6_medio_contacto?: 'llamada' | 'whatsapp' | 'correo' | 'sms' | 'cualquiera'
  estado_final?: EstadoFinal
  completado?: boolean
  paso_abandono?: number | null
}

export const MOTIVOS_RETIRO: Record<TipoAtencion, { value: string; label: string }[]> = {
  consulta: [
    { value: 'ya_no_deseo_la_cita', label: 'Ya no deseo la cita' },
    { value: 'acudi_otro_centro', label: 'Acudí a cita en otro centro médico' },
    { value: 'ya_no_necesito_cita', label: 'Ya no necesito cita' },
    { value: 'no_asegurado', label: 'No asegurado' },
    { value: 'fallecimiento', label: 'Fallecimiento' },
  ],
  cirugia: [
    { value: 'ya_no_deseo_operarme', label: 'Ya no deseo operarme' },
    { value: 'operado_otro_centro', label: 'Operado en otro centro médico' },
    { value: 'ya_no_necesito_cirugia', label: 'Ya no necesito la cirugía' },
    { value: 'contraindicacion_medica', label: 'Contraindicación médica' },
    { value: 'no_asegurado', label: 'No asegurado' },
    { value: 'fallecimiento', label: 'Fallecimiento' },
  ],
  procedimiento: [
    { value: 'ya_no_deseo_procedimiento', label: 'Ya no deseo el procedimiento' },
    { value: 'realizado_otro_centro', label: 'Me lo realicé en otro centro médico' },
    { value: 'ya_no_necesito_procedimiento', label: 'Ya no necesito el procedimiento' },
    { value: 'contraindicacion_medica', label: 'Contraindicación médica' },
    { value: 'no_asegurado', label: 'No asegurado' },
    { value: 'fallecimiento', label: 'Fallecimiento' },
  ],
}

export const MOTIVOS_NO_ASISTIR = [
  { value: 'fuera_del_pais', label: 'Fuera del país o lugar de residencia' },
  { value: 'enfermo', label: 'Me encuentro enfermo' },
  { value: 'recuperandome_cirugia', label: 'Me estoy recuperando de una cirugía' },
  { value: 'sin_medios_traslado', label: 'No tengo los medios para poder trasladarme' },
  { value: 'sin_acompanante', label: 'No tengo acompañante' },
  { value: 'otros', label: 'Otros' },
]
