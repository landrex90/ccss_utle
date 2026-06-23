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
