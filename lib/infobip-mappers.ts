// ── Shared value translation maps for Infobip WA and IVR imports ─────────────

export type Canal = 'whatsapp' | 'llamada'

export interface NormalizedRow {
  cedula_raw:                  string | null
  telefono:                    string | null
  campana_id:                  string | null
  enviado_at:                  string | null
  estado_canal:                string        // completado | no_respondio | error | no_contesta
  error:                       string | null
  // Response fields
  paso_1_consentimiento:       string | null
  paso_3_info_correcta:        string | null
  paso_4_desea_continuar:      string | null
  motivo_retiro:               string | null
  paso_5a_flexibilidad_centro: string | null
  paso_5b_condiciones_asistir: string | null
  paso_5b_motivo_no_asistir:   string | null
  paso_6_medio_contacto:       string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function val(s: string | null | undefined): string | null {
  if (!s || s.trim() === '-' || s.trim() === '') return null
  return s.trim()
}

function map(table: Record<string, string>, raw: string | null | undefined): string | null {
  const v = val(raw)
  if (!v) return null
  return table[v] ?? null
}

export function normalizarTelefono(tel: string | null | undefined): string | null {
  if (!tel) return null
  return tel.replace(/[\s\-\+]/g, '').replace(/^506/, '').slice(-8) || null
}

// ── WA Excel mappers ──────────────────────────────────────────────────────────

const WA_ESTADO_FINAL: Record<string, string> = {
  'Completó el flujo': 'completado',
}

const WA_DESEA_CONTINUAR: Record<string, string> = {
  'Sí, deseo continuar':         'si',
  'No, ya no la deseo':          'no_ya_no_deseo',
  'Sí, pero no estoy asegurado/a': 'no_asegurado',
}

const WA_FLEXIBILIDAD: Record<string, string> = {
  'Sí, está dispuesto/a': 'si',
  'No está disponible':   'no',
}

const WA_CONDICIONES: Record<string, string> = {
  'Sí, puede asistir':  'si',
  'No puede asistir':   'no',
}

const WA_MOTIVO_NO_ASISTIR: Record<string, string> = {
  'Problemas de salud':                        'problemas_salud',
  'Hospitalización o recuperación médica':     'hospitalizacion',
  'Falta de transporte o traslado':            'falta_transporte',
  'Falta de acompañante o situación familiar': 'falta_acompanante',
  'Obligaciones laborales, académicas o legales': 'obligaciones',
  'Problemas económicos':                      'problemas_economicos',
  'Fuera del país o de la zona':               'fuera_pais',
  'Decisión personal':                         'decision_personal',
  'Otro motivo':                               'otro_motivo',
}

const WA_MEDIO_CONTACTO: Record<string, string> = {
  'Llamada telefónica': 'llamada',
  'Correo electrónico': 'correo',
  'WhatsApp':           'whatsapp',
  'SMS':                'sms',
  'Cualquiera':         'cualquiera',
}

const WA_MOTIVO_RETIRO: Record<string, string> = {
  'Ya no deseo la atención':         'ya_no_deseo_la_atencion',
  'Acudí a otro centro de la CCSS':  'acudi_ccss',
  'Acudí a otro centro médico privado': 'acudi_privado',
  'Ya no necesito la atención':      'ya_no_necesito',
  'Contraindicación médica':         'contraindicacion_medica',
  'Fallecimiento':                   'fallecimiento',
}

// WA Excel row → NormalizedRow
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeWaRow(row: Record<string, any>, sheetName: string): NormalizedRow {
  const estadoFinal = val(row['Estado final'])
  const estadoCanal = WA_ESTADO_FINAL[estadoFinal ?? ''] ?? 'no_respondio'

  // Col name changed between Campaign_43 and Campaign_45+
  const paso5bCondiciones = val(row['Condiciones para asistir'])
  const paso5bMotivo      = val(row['Motivo de no asistencia'])

  return {
    cedula_raw:                  String(row['id'] ?? '').replace(/[^0-9]/g, '') || null,
    telefono:                    normalizarTelefono(String(row['phone'] ?? '')),
    campana_id:                  sheetName,
    enviado_at:                  val(String(row['hour_sent'] ?? '')) ,
    estado_canal:                estadoCanal,
    error:                       val(row['error']),
    paso_1_consentimiento:       null, // WA doesn't capture paso 1 (consent was implicit)
    paso_3_info_correcta:        null, // WA doesn't capture paso 3
    paso_4_desea_continuar:      map(WA_DESEA_CONTINUAR, row['¿Desea continuar con esta atención pendiente?']),
    motivo_retiro:               map(WA_MOTIVO_RETIRO,   row['Motivo de retiro de lista de espera']),
    paso_5a_flexibilidad_centro: map(WA_FLEXIBILIDAD,    row['Flexibilidad de centro médico']),
    paso_5b_condiciones_asistir: paso5bCondiciones ? (map(WA_CONDICIONES, paso5bCondiciones)) : null,
    paso_5b_motivo_no_asistir:   paso5bMotivo      ? (map(WA_MOTIVO_NO_ASISTIR, paso5bMotivo)) : null,
    paso_6_medio_contacto:       map(WA_MEDIO_CONTACTO,  row['Medio de contacto preferido']),
  }
}

// ── IVR Webhook — clasificación y normalización completa ─────────────────────
// Lógica portada del script _llamadas-import-results.js para uso en webhook

export interface IvrClasificacion {
  estadoFinal:    string | null
  estadoRegistro: string | null
  llamadaEstado:  'no_contestada' | 'completada'
  hasInteraction: boolean
  pasoAbandono:   number | null
}

export interface IvrRespuesta {
  canal:                        'llamada'
  paso_1_consentimiento:        string | null
  paso_2_verificacion:          string | null
  paso_3_info_correcta:         string | null
  paso_3_error:                 null
  paso_4_desea_continuar:       string | null
  motivo_retiro:                string | null
  paso_5a_flexibilidad_centro:  string | null
  paso_5b_condiciones_asistir:  string | null
  paso_5b_motivo_no_asistir:    string | null
  paso_6_medio_contacto:        string | null
  estado_final:                 string | null
  completado:                   boolean
  paso_abandono:                number | null
}

const IVR_MOTIVO_RETIRO_FULL: Record<string, string> = {
  'Ya no deseo la atención':            'ya_no_deseo_la_atencion',
  'Acudí a otro centro de la CCSS':     'acudi_ccss',
  'Acudí a otro centro médico privado': 'acudi_privado',
  'Ya no necesito la atención':         'ya_no_necesito',
  'Contraindicación médica':            'contraindicacion_medica',
  'Fallecimiento':                      'fallecimiento',
  'Ya no desea':                        'ya_no_deseo_la_atencion',
}

const IVR_MEDIO_CONTACTO_FULL: Record<string, string> = {
  'Llamada telefónica': 'llamada',
  'WhatsApp':           'whatsapp',
  'Whatsappp':          'whatsapp',
  'Whatsapp':           'whatsapp',
  'Correo electrónico': 'correo',
  'SMS':                'sms',
  'Cualquiera de opciones': 'cualquiera',
}

const IVR_MOTIVO_NO_ASISTIR_FULL: Record<string, string> = {
  'Problemas de salud':                           'problemas_salud',
  'Hospitalización o recuperación médica':        'hospitalizacion',
  'Falta de transporte o traslado':               'falta_transporte',
  'Falta de acompañante o situación familiar':    'falta_acompanante',
  'Obligaciones laborales, académicas o legales': 'obligaciones',
  'Problemas económicos':                         'problemas_economicos',
  'Fuera del país o de la zona':                  'fuera_pais',
  'Decisión personal':                            'decision_personal',
  'Otro motivo':                                  'otro_motivo',
}

function c(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return (!s || s === '-') ? null : s
}

function mlookup(table: Record<string, string>, raw: string | null): string | null {
  if (!raw) return null
  return table[raw] ?? raw
}

export function parseFechaInfobip(str: unknown): string | null {
  if (!str) return null
  try {
    const [fecha, hora] = String(str).trim().split(' ')
    if (!fecha) return null
    const [d, m, y] = fecha.split('/')
    return new Date(`${y}-${m}-${d}T${hora ?? '00:00:00'}`).toISOString()
  } catch { return null }
}

export function clasificarIvr(
  mapped: Record<string, unknown>,
  status: string | null,
  answeredBy: string | null
): IvrClasificacion {
  if (status !== 'Delivered') {
    return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'no_contestada', hasInteraction: false, pasoAbandono: null }
  }
  if (!answeredBy || answeredBy === 'NO_ANSWER') {
    return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'no_contestada', hasInteraction: false, pasoAbandono: null }
  }

  // CE-01 usa "Autorizo"; CIRUGIA-01 usa "Recolectar" — fallback entre ambas
  const cons   = c(mapped['Recolectar'] ?? mapped['Autorizo'])
  const datos  = c(mapped['Recolectar (3)'])
  const desea  = c(mapped['Recolectar (4)'])
  const retiro = c(mapped['MotivoRetiro'])

  if (cons?.toLowerCase().includes('no autorizo')) {
    return { estadoFinal: 'NO_AUTORIZO', estadoRegistro: 'NO_AUTORIZO', llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 1 }
  }
  if (datos && !datos.toLowerCase().includes('correcta')) {
    return { estadoFinal: 'INFO_INCORRECTA', estadoRegistro: null, llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 3 }
  }
  if ((desea?.toLowerCase().includes('no desea')) || retiro) {
    return { estadoFinal: 'DEPURADO_RENUNCIA', estadoRegistro: 'DEPURADO_RENUNCIA', llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 4 }
  }
  if (desea?.toLowerCase().includes('continuar')) {
    return { estadoFinal: 'ACTIVO', estadoRegistro: 'ACTIVO', llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: null }
  }
  if (cons?.toLowerCase().includes('si autorizo')) {
    return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'completada', hasInteraction: true, pasoAbandono: 3 }
  }
  return { estadoFinal: null, estadoRegistro: null, llamadaEstado: 'completada', hasInteraction: false, pasoAbandono: null }
}

export function normalizarIvrRespuesta(
  mapped: Record<string, unknown>,
  payload: Record<string, unknown>,
  clas: IvrClasificacion
): IvrRespuesta {
  const cons     = c(mapped['Recolectar'] ?? mapped['Autorizo'])
  const digitos  = c(mapped['Recolectar (2)'])
  const comparar = c(payload['COMPARA_4_DIGITOS'] ?? payload['VALIDACION_ID'])
  const datos    = c(mapped['Recolectar (3)'])
  const desea    = c(mapped['Recolectar (4)'])
  const retiro   = c(mapped['MotivoRetiro'])
  const flex     = c(mapped['Recolectar (5)'])
  const cond     = c(mapped['Recolectar 5b'])
  const motivoNo = c(mapped['Recolectar (7)'])
  const medio    = c(mapped['Recolectar 6 Medio Contacto'])

  const paso1 = !cons ? null
    : cons.toLowerCase().includes('no autorizo') ? 'no_autorizo'
    : cons.toLowerCase().includes('si autorizo') ? 'si_autorizo'
    : null

  const verificado = digitos && comparar ? digitos === comparar : null
  const paso2 = verificado === null ? null : (verificado ? 'exitosa' : 'fallida')

  const paso3 = !datos ? null : (datos.toLowerCase().includes('correcta') ? 'si' : 'no')

  const paso4 = !desea ? null
    : desea.toLowerCase().includes('continuar') ? 'si'
    : desea.toLowerCase().includes('no desea')  ? 'no_ya_no_deseo'
    : null

  const bool = (v: string | null) =>
    !v ? null : (v === 'Sí' || v === 'Si') ? 'si' : v === 'No' ? 'no' : null

  return {
    canal:                       'llamada',
    paso_1_consentimiento:       paso1,
    paso_2_verificacion:         paso2,
    paso_3_info_correcta:        paso3,
    paso_3_error:                null,
    paso_4_desea_continuar:      paso4,
    motivo_retiro:               mlookup(IVR_MOTIVO_RETIRO_FULL, retiro ?? (desea?.includes('no desea') ? desea : null)),
    paso_5a_flexibilidad_centro: bool(flex),
    paso_5b_condiciones_asistir: bool(cond),
    paso_5b_motivo_no_asistir:   mlookup(IVR_MOTIVO_NO_ASISTIR_FULL, motivoNo),
    paso_6_medio_contacto:       mlookup(IVR_MEDIO_CONTACTO_FULL, medio),
    estado_final:                clas.estadoFinal,
    completado:                  clas.estadoFinal === 'ACTIVO',
    paso_abandono:               clas.pasoAbandono,
  }
}

// ── IVR CSV mappers ───────────────────────────────────────────────────────────

const IVR_DESEA_CONTINUAR: Record<string, string> = {
  'Desea continuar':  'si',
  'No desea':         'no_ya_no_deseo',
  'No ya no deseo':   'no_ya_no_deseo',
  'No asegurado':     'no_asegurado',
}

const IVR_BOOL: Record<string, string> = {
  'Si': 'si',
  'No': 'no',
}

const IVR_MEDIO_CONTACTO: Record<string, string> = {
  'Llamada':          'llamada',
  'Whatsappp':        'whatsapp', // typo in Infobip data
  'Whatsapp':         'whatsapp',
  'WhatsApp':         'whatsapp',
  'Correo electrónico': 'correo',
  'Correo':           'correo',
  'SMS':              'sms',
  'Cualquiera':       'cualquiera',
}

const IVR_MOTIVO_NO_ASISTIR: Record<string, string> = {
  'Problemas de salud':         'problemas_salud',
  'Hospitalización':            'hospitalizacion',
  'Falta de transporte':        'falta_transporte',
  'Falta de acompañante':       'falta_acompanante',
  'Obligaciones':               'obligaciones',
  'Problemas económicos':       'problemas_economicos',
  'Fuera del país':             'fuera_pais',
  'Decisión personal':          'decision_personal',
  'Otro motivo':                'otro_motivo',
}

const IVR_CONSENTIMIENTO: Record<string, string> = {
  'Si autorizo':  'si_autorizo',
  'No autorizo':  'no_autorizo',
}

const IVR_INFO_CORRECTA: Record<string, string> = {
  'Si es correcta':  'si',
  'No es correcta':  'no',
}

// IVR CSV row → NormalizedRow
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeIvrRow(row: Record<string, any>): NormalizedRow {
  let mapped: Record<string, string> = {}
  try {
    mapped = JSON.parse(row['IVR Mapped Responses'] ?? '{}')
  } catch { /* leave empty */ }

  const status   = (row['Status'] ?? '').trim()
  const hasR4    = !!val(mapped['Recolectar (4)'])

  let estadoCanal: string
  if (status === 'Rejected') {
    estadoCanal = 'error'
  } else if (hasR4) {
    estadoCanal = 'completado'
  } else {
    estadoCanal = 'no_respondio'
  }

  const to = String(row['To'] ?? '')
  const telefono = normalizarTelefono(to)

  return {
    cedula_raw:                  null, // IVR doesn't reliably expose cédula — lookup by phone
    telefono,
    campana_id:                  val(row['Bulk Id']),
    enviado_at:                  val(row['Start Time']),
    estado_canal:                estadoCanal,
    error:                       val(row['Reason']),
    paso_1_consentimiento:       map(IVR_CONSENTIMIENTO,   val(mapped['Recolectar'])),
    paso_3_info_correcta:        map(IVR_INFO_CORRECTA,    val(mapped['Recolectar (3)'])),
    paso_4_desea_continuar:      map(IVR_DESEA_CONTINUAR,  val(mapped['Recolectar (4)'])),
    motivo_retiro:               null,
    paso_5a_flexibilidad_centro: map(IVR_BOOL,             val(mapped['Recolectar (5)'])),
    paso_5b_condiciones_asistir: map(IVR_BOOL,             val(mapped['Recolectar 5b'])),
    paso_5b_motivo_no_asistir:   map(IVR_MOTIVO_NO_ASISTIR, val(mapped['Recolectar (7)'])),
    paso_6_medio_contacto:       map(IVR_MEDIO_CONTACTO,  val(mapped['Recolectar 6 Medio Contacto'])),
  }
}
