#!/usr/bin/env node
/**
 * Convierte todos los documentos markdown del proyecto CCSS a formato Word (.docx)
 * Uso: node scripts/md-to-docx.js
 * Salida: docs/word/*.docx
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  UnderlineType, PageBreak, Header, ImageRun,
} = require('docx')
const fs = require('fs')
const path = require('path')

// ── Colores CCSS ──────────────────────────────────────────────────────────────
const CCSS_BLUE   = '004B83'
const CCSS_LIGHT  = 'e6f2f8'
const GRAY_HEADER = 'f3f4f6'
const GRAY_TEXT   = '6b7280'
const WHITE       = 'FFFFFF'

// ── Helpers de texto inline ───────────────────────────────────────────────────
function parseInline(text) {
  // Devuelve array de TextRun procesando **bold**, *italic*, `code`
  const runs = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), font: 'Calibri', size: 22 }))
    if (m[2]) runs.push(new TextRun({ text: m[2], bold: true, font: 'Calibri', size: 22 }))
    else if (m[3]) runs.push(new TextRun({ text: m[3], italics: true, font: 'Calibri', size: 22 }))
    else if (m[4]) runs.push(new TextRun({ text: m[4], font: 'Courier New', size: 20, color: '003668' }))
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: 'Calibri', size: 22 }))
  return runs.length ? runs : [new TextRun({ text, font: 'Calibri', size: 22 })]
}

// ── Párrafo de metadatos (líneas **Clave:** Valor al inicio) ──────────────────
function metaParagraph(line) {
  const clean = line.replace(/^[\s*]+|[\s*]+$/g, '')
  const colon = clean.indexOf(':')
  if (colon === -1) return new Paragraph({ children: parseInline(line.replace(/\*\*/g, '')), spacing: { after: 60 } })
  const key = clean.slice(0, colon).trim()
  const val = clean.slice(colon + 1).trim()
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: key + ': ', bold: true, font: 'Calibri', size: 22, color: CCSS_BLUE }),
      new TextRun({ text: val, font: 'Calibri', size: 22 }),
    ],
  })
}

// ── Heading ───────────────────────────────────────────────────────────────────
function makeHeading(text, level) {
  const levels = {
    1: { heading: HeadingLevel.HEADING_1, size: 32, color: CCSS_BLUE, bold: true, spacing: { before: 360, after: 120 } },
    2: { heading: HeadingLevel.HEADING_2, size: 26, color: CCSS_BLUE, bold: true, spacing: { before: 280, after: 80 } },
    3: { heading: HeadingLevel.HEADING_3, size: 22, color: '003668', bold: true, spacing: { before: 200, after: 60 } },
  }
  const cfg = levels[level] || levels[3]
  return new Paragraph({
    heading: cfg.heading,
    spacing: cfg.spacing,
    children: [new TextRun({ text: text.replace(/^#+\s*/, ''), bold: cfg.bold, color: cfg.color, size: cfg.size, font: 'Calibri' })],
  })
}

// ── Separador ─────────────────────────────────────────────────────────────────
function makeDivider() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { color: CCSS_LIGHT, style: BorderStyle.SINGLE, size: 6 } },
    children: [],
  })
}

// ── Bullet ────────────────────────────────────────────────────────────────────
function makeBullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: parseInline(text.replace(/^[-*]\s+/, '').replace(/^\s+[-*]\s+/, '')),
  })
}

// ── Párrafo normal ────────────────────────────────────────────────────────────
function makeParagraph(text) {
  return new Paragraph({ spacing: { after: 120 }, children: parseInline(text) })
}

// ── Bloque de código ──────────────────────────────────────────────────────────
function makeCodeBlock(lines) {
  return lines.map(l =>
    new Paragraph({
      spacing: { after: 0, before: 0 },
      shading: { type: ShadingType.CLEAR, fill: 'f8f9fa' },
      indent: { left: 360 },
      children: [new TextRun({ text: l, font: 'Courier New', size: 18, color: '003668' })],
    })
  )
}

// ── Tabla markdown ────────────────────────────────────────────────────────────
function parseTable(lines) {
  const rows = lines.filter(l => !l.match(/^\|[\s:-]+\|/))
  const tableRows = rows.map((row, ri) => {
    const cells = row.split('|').slice(1, -1).map(c => c.trim())
    const isHeader = ri === 0
    return new TableRow({
      tableHeader: isHeader,
      children: cells.map(cell =>
        new TableCell({
          shading: isHeader
            ? { type: ShadingType.CLEAR, fill: CCSS_BLUE }
            : { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? WHITE : 'f0f7fb' },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({
              text: cell.replace(/\*\*/g, '').replace(/`/g, ''),
              bold: isHeader,
              color: isHeader ? WHITE : '1f2937',
              font: 'Calibri',
              size: 20,
            })],
          })],
        })
      ),
    })
  })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    rows: tableRows,
  })
}

// ── Pie de página ─────────────────────────────────────────────────────────────
function makeFooter(text) {
  return new Paragraph({
    spacing: { before: 240 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: text.replace(/^\*/, '').replace(/\*$/, '').trim(), italics: true, font: 'Calibri', size: 18, color: GRAY_TEXT })],
  })
}

// ── Parser principal de markdown ──────────────────────────────────────────────
function parseMarkdown(content) {
  const lines = content.split('\n')
  const elements = []
  let i = 0
  let inCode = false
  let codeLines = []

  while (i < lines.length) {
    const line = lines[i]

    // Bloque de código
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true
        codeLines = []
      } else {
        inCode = false
        elements.push(...makeCodeBlock(codeLines))
        elements.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
      }
      i++; continue
    }
    if (inCode) { codeLines.push(line); i++; continue }

    // Heading
    const hMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (hMatch) {
      elements.push(makeHeading(hMatch[2], hMatch[1].length))
      i++; continue
    }

    // Separador ---
    if (line.match(/^---+\s*$/) && !line.match(/\|/)) {
      elements.push(makeDivider())
      i++; continue
    }

    // Tabla
    if (line.startsWith('|')) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]); i++
      }
      elements.push(parseTable(tableLines))
      elements.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
      continue
    }

    // Bullet
    if (line.match(/^[-*]\s/) || line.match(/^\s{2,}[-*]\s/)) {
      const level = line.match(/^\s{2,}/) ? 1 : 0
      elements.push(makeBullet(line, level))
      i++; continue
    }

    // Línea de metadatos al inicio (**Clave:** Valor)
    if (line.match(/^\*\*[^*]+:\*\*/)) {
      elements.push(metaParagraph(line))
      i++; continue
    }

    // Pie de página (*texto*)
    if (line.match(/^\*[^*].*\*$/) && !line.match(/\*\*/)) {
      elements.push(makeFooter(line))
      i++; continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      elements.push(new Paragraph({
        spacing: { after: 120 },
        indent: { left: 360 },
        border: { left: { color: CCSS_BLUE, style: BorderStyle.SINGLE, size: 8 } },
        children: parseInline(line.replace(/^>\s*/, '')),
      }))
      i++; continue
    }

    // Vacío
    if (!line.trim()) {
      i++; continue
    }

    // Párrafo normal
    elements.push(makeParagraph(line))
    i++
  }

  return elements
}

// ── Crear documento Word ──────────────────────────────────────────────────────
function createDoc(content) {
  const children = parseMarkdown(content)
  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
        },
      },
      children,
    }],
  })
}

// ── Archivos a convertir ──────────────────────────────────────────────────────
const DOCS = [
  { src: '01_ficha_alcance_sistema.md',  out: '01_Ficha_Alcance_Sistema.docx' },
  { src: '02_flujo_datos_estados.md',    out: '02_Flujo_Datos_Estados.docx' },
  { src: '03_ficha_seguridad_datos.md',  out: '03_Ficha_Seguridad_Datos.docx' },
  { src: '04_manual_operativo.md',       out: '04_Manual_Operativo_SOP.docx' },
  { src: '05_minuta_acuerdos.md',        out: '05_Minuta_Reunion_21may2026.docx' },
  { src: '06_informe_ejecutivo.md',      out: '06_Informe_Ejecutivo.docx' },
]

async function main() {
  const docsDir  = path.join(__dirname, '..', 'docs')
  const wordDir  = path.join(docsDir, 'word')
  if (!fs.existsSync(wordDir)) fs.mkdirSync(wordDir, { recursive: true })

  for (const { src, out } of DOCS) {
    const srcPath = path.join(docsDir, src)
    if (!fs.existsSync(srcPath)) { console.log(`⚠  No encontrado: ${src}`); continue }
    const content = fs.readFileSync(srcPath, 'utf8')
    const doc = createDoc(content)
    const buffer = await Packer.toBuffer(doc)
    const outPath = path.join(wordDir, out)
    fs.writeFileSync(outPath, buffer)
    console.log(`✓  ${out}  (${Math.round(buffer.length / 1024)} KB)`)
  }
  console.log(`\nArchivos en: docs/word/`)
}

main().catch(err => { console.error(err); process.exit(1) })
