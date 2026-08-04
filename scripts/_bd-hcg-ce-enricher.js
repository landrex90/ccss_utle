#!/usr/bin/env node
/**
 * _bd-hcg-ce-enricher.js
 *
 * Procesa "Base de datos de c. externa subsecuentes HCG - Borrador COCO.xlsx"
 * y genera un Excel enriquecido listo para revisión de la UTLE antes de importar.
 *
 * Qué hace:
 *   1. Lee el Excel original (104k filas)
 *   2. Filtra elegibles: Selección final (col 42) !== 'NO'
 *   3. Descarga todos los id_registro existentes en Supabase (cross-dedup)
 *   4. Aplica reglas de depuración:
 *        - EXCLUIDO_YA_EN_BD       → ID_UTLE ya existe en Supabase
 *        - EXCLUIDO_DUPLICADO_INTRA → ID_UTLE repetido dentro del mismo archivo
 *        - EXCLUIDO_SIN_CONTACTO   → sin correo Y sin teléfono válido
 *        - EXCLUIDO_SELECCION_NO   → marcado NO por Mariam
 *        - EXCLUIDO_SOBRE_LIMITE   → fuera del cupo de 37,500
 *        - INCLUIR                 → pasa todos los filtros
 *   5. Ordena por prioridad: anio_registro 2024→2025→2026, luego fechaRegistro
 *   6. Selecciona los primeros TARGET_INCLUIR con correo válido
 *   7. Agrega columnas COCO_ESTADO y COCO_CORREO al Excel original
 *   8. Exporta Excel listo para revisión UTLE
 *
 * Uso:
 *   node --env-file=.env.local scripts/_bd-hcg-ce-enricher.js [--dry-run]
 *
 * Con --dry-run: no escribe archivo, solo muestra estadísticas.
 *
 * Estructura de columnas del archivo fuente (confirmada 2026-08-04):
 *   [0]  Eje
 *   [1]  ID_UTLE              ← clave primary key en registros
 *   [3]  Centro_Médico
 *   [5]  fechaRegistro
 *   [6]  anio_de_registro     ← para prioridad (2024 > 2025 > 2026)
 *   [7]  Servicio
 *   [8]  Especialidad
 *   [12] tipoIdentificacion   ("0 / CEDULA…" o "7 / EXTRANJERO…")
 *   [13] numeroIdentificacion ← cédula
 *   [14] nombrePaciente       ← en realidad primerApellido
 *   [15] primerApellido       ← en realidad segundoApellido
 *   [16] segundoApellido      ← en realidad nombres
 *   [17] Fecha de nacimiento
 *   [18] Edad
 *   [19] telefono ARCA        ← vacío
 *   [20] telefono2 ARCA       ← vacío
 *   [21] Numeros de telefono de SIAC  ← única fuente, parsear
 *   [22] Correo electronico SIAC     ← múltiples separados por " / "
 *   [23] Correo electronico ARCA     ← fallback
 *   [28] Tipo Consulta (Enfasis)
 *   [29] Fecha Atención
 *   [30] HORA CUPO
 *   [38] Sexo
 *   [42] Selección final cruce HCG-AES  ← 'NO' = excluir, blank = incluir
 */

const XLSX           = require('xlsx')
const path           = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno. Ejecutar con --env-file=.env.local')
  process.exit(1)
}

const FILE_PATH    = path.join(__dirname, '..', 'BD Nueva para completar los 100k',
                      'Base de datos de c. externa subsecuentes HCG - Borrador COCO.xlsx')
const OUTPUT_PATH       = path.join(__dirname, 'output', 'BD_HCG_CE_PROCESADA.xlsx')     // completo (local)
const OUTPUT_UTLE_PATH  = path.join(__dirname, 'output', 'BD_HCG_CE_PARA_UTLE.xlsx')    // solo INCLUIR (para enviar)
const TARGET_INCLUIR = 32000          // 71,307 actuales + 32,000 = 103,307 contractuales (meta ≥103k)
const DRY_RUN      = process.argv.includes('--dry-run')

const sb    = createClient(SUPABASE_URL, SERVICE_KEY)
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Helpers ──────────────────────────────────────────────────────────────────

function clean(val) {
  return String(val ?? '').trim()
}

function parseCorreo(siac, arca) {
  const FALSOS = ['NO INDICA', 'notiene@', 'noindica@', 'notiene', 'noemail', 'sin correo']
  const INST   = ['@ccss.sa.cr', '@alberguehospitalario']

  const candidatos = [
    ...clean(siac).split(/\s*\/\s*/),
    ...clean(arca).split(/\s*\/\s*/),
  ].map(e => e.trim().toLowerCase()).filter(Boolean)

  for (const c of candidatos) {
    if (!c.includes('@')) continue
    if (FALSOS.some(f => c.includes(f.toLowerCase()))) continue
    if (INST.some(i => c.includes(i))) continue
    return c
  }
  return null
}

const TEL_PLACEHOLDER = new Set(['22222222','33333333','44444444','55555555','66666666','77777777','88888888','99999999','00000000','11111111','12345678','87654321'])

function parseTelefono(siacRaw) {
  const digitos = clean(siacRaw)
    .split(/[^\d]+/)
    .map(s => s.trim())
    .filter(s => s.length === 8)

  for (const d of digitos) {
    if (TEL_PLACEHOLDER.has(d)) continue
    const p = d[0]
    if (['6', '7', '8'].includes(p)) return { tel: d, tipo: 'movil' }
    if (p === '2')                   return { tel: d, tipo: 'fijo' }
  }
  return null
}

function parseAnio(val, fechaRegFallback) {
  const n = parseInt(String(val ?? '').trim(), 10)
  if (!isNaN(n) && n > 1900 && n < 2100) return n
  if (fechaRegFallback) return fechaRegFallback.getFullYear()
  return 9999
}

function parseFecha(val) {
  if (!val) return null
  // XLSX puede devolver número serial o string DD/MM/YYYY
  if (typeof val === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(val)
      return new Date(Date.UTC(d.y, d.m - 1, d.d))
    } catch { return null }
  }
  const s = String(val).trim()
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function formatFecha(d) {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📊 BD HCG CE — PROCESAMIENTO Y DEPURACIÓN')
  console.log(`   Modo: ${DRY_RUN ? 'DRY RUN (no escribe archivo)' : 'PRODUCCIÓN (genera Excel)'}\n`)

  // ── 1. Leer Excel ──────────────────────────────────────────────────────────
  console.log('📥 Leyendo Excel fuente...')
  let wb
  try {
    wb = XLSX.readFile(FILE_PATH)
  } catch (e) {
    console.error('❌ No se pudo leer el archivo:', e.message)
    process.exit(1)
  }

  const sheetName = 'base de datos'
  const sheet = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const header  = rawRows[0]
  const dataRows = rawRows.slice(1)
  console.log(`   Total filas (con header): ${rawRows.length}`)
  console.log(`   Filas de datos          : ${dataRows.length}`)

  // ── 2. Cross-dedup — descargar id_registro existentes en Supabase ──────────
  console.log('\n🔗 Descargando ID_UTLE existentes en Supabase...')
  const existentesDB = new Set()
  let fromDB = 0
  while (true) {
    const { data, error } = await sb
      .from('registros')
      .select('id_registro')
      .range(fromDB, fromDB + 999)
    if (error) { console.error('❌ Supabase:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    for (const r of data) existentesDB.add(String(r.id_registro).trim())
    process.stdout.write(`\r   Descargados: ${existentesDB.size}...`)
    if (data.length < 1000) break
    fromDB += 1000
    await sleep(80)
  }
  console.log(`\r   ID_UTLE existentes en BD: ${existentesDB.size} ✓`)

  // ── 3. Parsear y clasificar filas ──────────────────────────────────────────
  console.log('\n🔍 Procesando filas...')

  const HOY = new Date()
  HOY.setUTCHours(0, 0, 0, 0)

  const conteo = {
    total: 0,
    seleccion_no: 0,
    ya_en_bd: 0,
    duplicado_intra: 0,
    menor_edad: 0,
    centenario: 0,
    cita_vencida: 0,
    sin_contacto: 0,
    incluir: 0,
    sobre_limite: 0,
  }

  const idUTLEVistos = new Set()  // para dedup intra-archivo
  const procesadas   = []

  for (const r of dataRows) {
    conteo.total++

    const idUTLE    = clean(r[1])
    const seleccion = clean(r[42]).toUpperCase()
    const fechaRegTmp = parseFecha(r[5])
    const anio        = parseAnio(r[6], fechaRegTmp)
    const fechaReg  = fechaRegTmp
    const cedula    = clean(r[13])
    const edad      = parseInt(clean(r[18]), 10)
    const fechaCita = parseFecha(r[29])
    const correo    = parseCorreo(r[22], r[23])
    const telParsed = parseTelefono(r[21])
    const telefono  = telParsed?.tel ?? null
    const tipoTel   = telParsed?.tipo ?? null

    // Nombre: r[16]=nombres, r[14]=primerApellido, r[15]=segundoApellido
    const nombre = [clean(r[16]), clean(r[14]), clean(r[15])].filter(Boolean).join(' ')

    // Canal según contacto disponible
    const canalOrden = correo && telefono && tipoTel === 'movil' ? 'correo,whatsapp,llamada'
                     : correo && telefono                        ? 'correo,llamada'
                     : correo                                    ? 'correo'
                     : telefono && tipoTel === 'movil'           ? 'whatsapp,llamada'
                     :                                            'llamada'

    const base = { r, idUTLE, cedula, correo, telefono, tipoTel, nombre, anio, fechaReg, canalOrden }

    // Regla 1: Selección = NO (Mariam)
    if (seleccion === 'NO') {
      conteo.seleccion_no++
      procesadas.push({ ...base, coco_estado: 'EXCLUIDO_SELECCION_NO', coco_correo: correo ?? '' })
      continue
    }

    // Regla 2: Ya en Supabase (cross-dedup por ID_UTLE)
    if (existentesDB.has(idUTLE)) {
      conteo.ya_en_bd++
      procesadas.push({ ...base, coco_estado: 'EXCLUIDO_YA_EN_BD', coco_correo: correo ?? '' })
      continue
    }

    // Regla 3: Duplicado intra-archivo
    if (idUTLEVistos.has(idUTLE)) {
      conteo.duplicado_intra++
      procesadas.push({ ...base, coco_estado: 'EXCLUIDO_DUPLICADO_INTRA', coco_correo: correo ?? '' })
      continue
    }
    idUTLEVistos.add(idUTLE)

    // Regla 4: Menor de edad (<18)
    if (!isNaN(edad) && edad < 18) {
      conteo.menor_edad++
      procesadas.push({ ...base, coco_estado: 'EXCLUIDO_MENOR_EDAD', coco_correo: correo ?? '' })
      continue
    }

    // Regla 5: Centenario (>100)
    if (!isNaN(edad) && edad > 100) {
      conteo.centenario++
      procesadas.push({ ...base, coco_estado: 'EXCLUIDO_CENTENARIO', coco_correo: correo ?? '' })
      continue
    }

    // Regla 6: Fecha de cita vencida (cliente confirmó excluir)
    if (fechaCita && fechaCita < HOY) {
      conteo.cita_vencida++
      procesadas.push({ ...base, coco_estado: 'EXCLUIDO_CITA_VENCIDA', coco_correo: correo ?? '' })
      continue
    }

    // Regla 7: Sin ningún contacto
    if (!correo && !telefono) {
      conteo.sin_contacto++
      procesadas.push({ ...base, coco_estado: 'EXCLUIDO_SIN_CONTACTO', coco_correo: '' })
      continue
    }

    // Candidato a INCLUIR
    procesadas.push({ ...base, coco_estado: 'CANDIDATO', coco_correo: correo ?? '' })
  }

  // ── 4. Ordenar candidatos y aplicar límite ─────────────────────────────────
  // Prioridad:
  //   1. correo + celular (6/7/8)  → los más valiosos para el proyecto
  //   2. correo + sin teléfono     → al menos llegan por correo
  //   3. correo + fijo             → fijos NO se usan en el proyecto, van de último
  // Dentro de cada grupo: anio_registro ASC (2024 primero), luego fechaRegistro ASC

  function grupoPrioridad(p) {
    if (p.correo && p.tipoTel === 'movil') return 0  // mejor: correo + celular
    if (p.correo && !p.telefono)           return 1  // medio:  correo solo
    if (p.correo && p.tipoTel === 'fijo')  return 2  // peor:   correo + fijo (fijo no se usa)
    return 3                                          // sin correo (no debería llegar aquí)
  }

  const candidatos = procesadas.filter(p => p.coco_estado === 'CANDIDATO')
  candidatos.sort((a, b) => {
    // 1. Canal: correo+celular (0) > correo solo (1) > correo+fijo (2)
    const ga = grupoPrioridad(a), gb = grupoPrioridad(b)
    if (ga !== gb) return ga - gb
    // 2. Año ASC — 2024 antes que 2025 antes que 2026 (dentro del mismo grupo canal)
    if (a.anio !== b.anio) return a.anio - b.anio
    // 3. Fecha de registro ASC
    if (a.fechaReg && b.fechaReg) return a.fechaReg - b.fechaReg
    return 0
  })

  let incluirCount = 0
  for (const p of candidatos) {
    if (incluirCount < TARGET_INCLUIR) {
      p.coco_estado = 'INCLUIR'
      conteo.incluir++
      incluirCount++
    } else {
      p.coco_estado = 'EXCLUIDO_SOBRE_LIMITE'
      conteo.sobre_limite++
    }
  }

  // ── 5. Estadísticas ────────────────────────────────────────────────────────
  const incluidos = procesadas.filter(p => p.coco_estado === 'INCLUIR')
  const incluidosConCorreo  = incluidos.filter(p => p.correo !== null).length
  const incluidosSinCorreo  = incluidos.filter(p => p.correo === null).length
  const incluidosMovil      = incluidos.filter(p => p.tipoTel === 'movil').length
  const incluidosFijo       = incluidos.filter(p => p.tipoTel === 'fijo').length
  const incluidosSinTel     = incluidos.filter(p => !p.telefono).length

  // Por año
  const porAnio = {}
  for (const p of incluidos) {
    porAnio[p.anio] = (porAnio[p.anio] ?? 0) + 1
  }

  // Por especialidad (incluidos)
  const porEsp = {}
  for (const p of incluidos) {
    const esp = clean(p.r[8]) || 'SIN ESP'
    porEsp[esp] = (porEsp[esp] ?? 0) + 1
  }

  console.log('\n' + '═'.repeat(60))
  console.log('📊 RESULTADO DE DEPURACIÓN')
  console.log('═'.repeat(60))
  console.log(`\n   Total filas analizadas    : ${conteo.total}`)
  console.log(`   Selección = NO (Mariam)   : ${conteo.seleccion_no}`)
  console.log(`   Ya en BD (cross-dedup)    : ${conteo.ya_en_bd}`)
  console.log(`   Duplicado intra-archivo   : ${conteo.duplicado_intra}`)
  console.log(`   Menor de edad (<18)       : ${conteo.menor_edad}`)
  console.log(`   Centenario (>100)         : ${conteo.centenario}`)
  console.log(`   Cita vencida (< hoy)      : ${conteo.cita_vencida}`)
  console.log(`   Sin contacto              : ${conteo.sin_contacto}`)
  console.log(`   Sobre límite (${TARGET_INCLUIR.toLocaleString()})   : ${conteo.sobre_limite}`)
  console.log(`\n   ✅ INCLUIR                : ${conteo.incluir}`)
  console.log(`      → Con correo válido    : ${incluidosConCorreo}`)
  console.log(`      → Sin correo (WA+tel)  : ${incluidosSinCorreo}`)
  console.log(`      → Teléfono móvil       : ${incluidosMovil}`)
  console.log(`      → Teléfono fijo        : ${incluidosFijo}`)
  console.log(`      → Sin teléfono         : ${incluidosSinTel}`)

  console.log('\n   Distribución por año registro (INCLUIR):')
  Object.entries(porAnio).sort((a, b) => a[0] - b[0]).forEach(([anio, n]) =>
    console.log(`      ${anio}: ${n.toLocaleString()}`)
  )

  console.log('\n   Top 10 especialidades (INCLUIR):')
  Object.entries(porEsp)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([esp, n]) => console.log(`      ${esp.padEnd(35)}: ${n.toLocaleString()}`))

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN — no se generó archivo.\n')
    return
  }

  // ── 6. Generar Excel de salida ─────────────────────────────────────────────
  console.log('\n📝 Generando Excel de salida...')

  // ── Detectar columnas vacías para excluirlas del output ───────────────────
  // (columnas ARCA teléfonos, procedimientos, lateralidad, etc. vacías en CE)
  const totalCols = header.length
  const colTieneValor = new Array(totalCols).fill(false)
  for (const p of procesadas) {
    for (let c = 0; c < totalCols; c++) {
      const v = String(p.r[c] ?? '').trim()
      if (v !== '' && v !== '-') colTieneValor[c] = true
    }
  }
  const colsActivas = colTieneValor.map((tiene, i) => tiene ? i : -1).filter(i => i >= 0)
  const colsVacias  = colTieneValor.map((tiene, i) => tiene ? -1 : i).filter(i => i >= 0)
  console.log(`\n   Columnas vacías excluidas del output (${colsVacias.length}): ${colsVacias.map(i => `[${i}] ${header[i]}`).join(', ')}`)

  // Header filtrado + COCO columns
  const newHeader   = [...colsActivas.map(i => header[i]), 'COCO_ESTADO', 'COCO_CORREO', 'COCO_TELEFONO', 'COCO_TIPO_TEL', 'COCO_NOMBRE', 'COCO_CANAL']

  const outputRows  = [newHeader]
  for (const p of procesadas) {
    outputRows.push([
      ...colsActivas.map(i => p.r[i]),
      p.coco_estado,
      p.coco_correo,
      p.telefono ?? '',
      p.tipoTel ?? '',
      p.nombre,
      p.canalOrden ?? '',
    ])
  }

  function buildSparseSheet(rows) {
    const ws = {}
    let maxC = 0
    rows.forEach((row, R) => {
      row.forEach((val, C) => {
        if (val === '' || val === null || val === undefined) return
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        const t = typeof val === 'number' ? 'n' : 's'
        ws[addr] = { v: val, t }
        if (C > maxC) maxC = C
      })
    })
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: maxC } })
    return ws
  }

  const wbOut = XLSX.utils.book_new()
  const wsOut = buildSparseSheet(outputRows)
  XLSX.utils.book_append_sheet(wbOut, wsOut, 'procesada')

  // Hoja de resumen
  const resumen = [
    ['Metrica', 'Valor'],
    ['Fecha procesamiento', new Date().toISOString().slice(0, 10)],
    ['Total filas analizadas', conteo.total],
    ['INCLUIR', conteo.incluir],
    ['  Con correo valido', incluidosConCorreo],
    ['  Sin correo (WA+tel)', incluidosSinCorreo],
    ['  Movil (apto WA)', incluidosMovil],
    ['  Fijo (solo llamada)', incluidosFijo],
    ['Excl. Seleccion NO', conteo.seleccion_no],
    ['Excl. Ya en BD', conteo.ya_en_bd],
    ['Excl. Duplicado intra', conteo.duplicado_intra],
    ['Excl. Menor edad (<18)', conteo.menor_edad],
    ['Excl. Centenario (>100)', conteo.centenario],
    ['Excl. Cita vencida', conteo.cita_vencida],
    ['Excl. Sin contacto', conteo.sin_contacto],
    ['Excl. Sobre limite', conteo.sobre_limite],
    ['Target configurado', TARGET_INCLUIR],
  ]
  const wsRes = buildSparseSheet(resumen)
  XLSX.utils.book_append_sheet(wbOut, wsRes, 'resumen')

  const fs = require('fs')
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })

  // ── Archivo completo (local, referencia) ───────────────────────────────────
  XLSX.writeFile(wbOut, OUTPUT_PATH, { compression: true, bookSST: true })
  const sizeCompleto = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1)

  console.log(`\n✅ Excel generado: ${OUTPUT_PATH}  [${sizeCompleto} MB]`)
  console.log('   Contiene todos los registros + columnas COCO. La UTLE filtra por COCO_ESTADO.')
  console.log('   Siguiente paso: enviar a UTLE para revisión antes de importar a Supabase.\n')
  console.log('═'.repeat(60))
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
