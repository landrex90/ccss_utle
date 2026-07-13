import { createClient } from '@/lib/supabase/server'
import ExportButton from './ExportButton'

// ── Queries de conteo paralelas ────────────────────────────────────────────────
async function getStats() {
  const sb = createClient()

  const [
    { count: total },
    // Warmup (campana_id = 'WARMUP-CORREO-*')
    { count: warmupEnviado },
    { count: warmupCirugia },
    { count: warmupConsulta },
    { count: warmupProced },
    // Encuesta (encuesta_campana_id = 'ENCUESTA-*') — columna separada, no se mezcla con warmup
    { count: encuestaAsignada },
    { count: correoEnviado },
    { count: correoAbierto },
    { count: correoClick },
    { count: encuestaCompleta },
    { count: noAutorizo },
    { count: depurado },
  ] = await Promise.all([
    sb.from('registros').select('*', { count: 'exact', head: true }),
    // Warmup
    sb.from('registros').select('*', { count: 'exact', head: true }).eq('warmup_estado', 'enviado'),
    sb.from('registros').select('*', { count: 'exact', head: true }).eq('warmup_estado', 'enviado').eq('tipo_atencion', 'cirugia'),
    sb.from('registros').select('*', { count: 'exact', head: true }).eq('warmup_estado', 'enviado').eq('tipo_atencion', 'consulta'),
    sb.from('registros').select('*', { count: 'exact', head: true }).eq('warmup_estado', 'enviado').eq('tipo_atencion', 'procedimiento'),
    // Encuesta — filtra por encuesta_campana_id (independiente del warmup)
    sb.from('registros').select('*', { count: 'exact', head: true }).not('encuesta_campana_id', 'is', null),
    sb.from('registros').select('*', { count: 'exact', head: true }).eq('correo_estado', 'enviado').not('encuesta_campana_id', 'is', null),
    sb.from('registros').select('*', { count: 'exact', head: true }).not('correo_abierto_at', 'is', null).not('encuesta_campana_id', 'is', null),
    sb.from('registros').select('*', { count: 'exact', head: true }).not('correo_click_at', 'is', null).not('encuesta_campana_id', 'is', null),
    sb.from('registros').select('*', { count: 'exact', head: true }).not('encuesta_completada_at', 'is', null),
    sb.from('registros').select('*', { count: 'exact', head: true }).eq('estado', 'NO_AUTORIZO'),
    sb.from('registros').select('*', { count: 'exact', head: true }).like('estado', 'DEPURADO%'),
  ])

  return {
    total:    total ?? 0,
    warmup:   { enviado: warmupEnviado ?? 0, cirugia: warmupCirugia ?? 0, consulta: warmupConsulta ?? 0, procedimiento: warmupProced ?? 0 },
    correo:   { asignada: encuestaAsignada ?? 0, enviado: correoEnviado ?? 0, abierto: correoAbierto ?? 0, click: correoClick ?? 0 },
    encuesta: { completada: encuestaCompleta ?? 0, noAutorizo: noAutorizo ?? 0, depurado: depurado ?? 0 },
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function pct(n: number, d: number) {
  if (!d) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

function fmt(n: number) {
  return n.toLocaleString('es-CR')
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default async function AdminDashboard() {
  const s = await getStats()

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Dashboard CLEO</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {fmt(s.total)} pacientes en BD · Campaña {s.total > 0 ? 'WARMUP-CORREO-01' : 'sin datos'}
          </p>
        </div>
        <ExportButton />
      </div>

      {/* ── Resumen top ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total en BD"        value={s.total}                color="blue"   />
        <StatCard label="Warmup enviado"     value={s.warmup.enviado}       color="green"  />
        <StatCard label="Encuesta enviada"   value={s.correo.enviado}       color="yellow" />
        <StatCard label="Respuestas recibidas" value={s.encuesta.completada} color="purple" />
      </div>

      {/* ── Warmup ──────────────────────────────────────────────────────────── */}
      <Section title="Campaña Warmup — Aviso previo" badge="WARMUP-CORREO-01" badgeColor="green">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <EjeCard label="Cirugía"          value={s.warmup.cirugia}       total={s.warmup.enviado} color="#16a34a" />
          <EjeCard label="Consulta Externa" value={s.warmup.consulta}      total={s.warmup.enviado} color="#2563eb" />
          <EjeCard label="Procedimientos"   value={s.warmup.procedimiento} total={s.warmup.enviado} color="#7c3aed" />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Total enviado: <strong>{fmt(s.warmup.enviado)}</strong> correos de aviso previo — 2026-07-09
        </p>
      </Section>

      {/* ── Encuesta correo ─────────────────────────────────────────────────── */}
      <Section
        title="Campaña Encuesta — Canal Correo"
        badge={s.correo.asignada > 0 ? `${fmt(s.correo.asignada)} asignados` : 'Pendiente de inicio'}
        badgeColor={s.correo.asignada > 0 ? 'blue' : 'yellow'}
      >
        {s.correo.asignada === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
            Ningún registro tiene aún <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">encuesta_campana_id</code> asignado.
            El lote piloto de ~1,500 Cirugía se asignará con ID <strong>ENCUESTA-CIRUGIA-01</strong> al ejecutar el script.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2 font-medium">Etapa</th>
                  <th className="text-right px-4 py-2 font-medium">Cantidad</th>
                  <th className="text-right px-4 py-2 font-medium">% del lote</th>
                  <th className="px-4 py-2 w-48">Barra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                <FunnelRow label="Asignados al lote"    value={s.correo.asignada}      base={s.correo.asignada} color="bg-blue-400"   />
                <FunnelRow label="Correo enviado"       value={s.correo.enviado}        base={s.correo.asignada} color="bg-blue-500"   />
                <FunnelRow label="Correo abierto"       value={s.correo.abierto}        base={s.correo.asignada} color="bg-indigo-500" />
                <FunnelRow label="Click en enlace"      value={s.correo.click}          base={s.correo.asignada} color="bg-purple-500" />
                <FunnelRow label="Encuesta completada"  value={s.encuesta.completada}   base={s.correo.asignada} color="bg-green-500"  />
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          ID campaña encuesta es independiente del ID warmup — se gestionan en columnas separadas.
        </p>
      </Section>

      {/* ── Respuestas ──────────────────────────────────────────────────────── */}
      <Section title="Respuestas recibidas" badge={`${fmt(s.encuesta.completada)} completadas`} badgeColor="purple">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MiniStat label="Completadas"    value={s.encuesta.completada} color="text-green-600 dark:text-green-400" />
          <MiniStat label="No autorizaron" value={s.encuesta.noAutorizo} color="text-red-600 dark:text-red-400"   />
          <MiniStat label="Depurados"      value={s.encuesta.depurado}   color="text-gray-600 dark:text-gray-400" />
        </div>
        {s.encuesta.completada === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            Sin respuestas aún — iniciará cuando se envíe la campaña encuesta.
          </p>
        )}
      </Section>

      {/* ── Acciones rápidas ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <QuickAction href="/admin/campanas" label="Ver campañas"       icon="☰" />
        <QuickAction href="/admin/importar" label="Importar pacientes" icon="↑" />
        <QuickAction href="/admin/resultados" label="Importar resultados" icon="↻" />
      </div>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: 'blue' | 'green' | 'yellow' | 'purple' | 'gray' }) {
  const cls = {
    blue:   'text-[#004B83] dark:text-[#0066aa]',
    green:  'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    purple: 'text-purple-600 dark:text-purple-400',
    gray:   'text-gray-500 dark:text-gray-400',
  }[color]
  return (
    <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 px-5 py-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${cls}`}>{fmt(value)}</p>
    </div>
  )
}

function Section({
  title, badge, badgeColor, children,
}: {
  title: string; badge: string; badgeColor: 'green' | 'yellow' | 'purple' | 'blue'; children: React.ReactNode
}) {
  const badgeCls = {
    green:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
    blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  }[badgeColor]
  return (
    <div className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
        <h2 className="font-medium text-gray-700 dark:text-gray-200">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeCls}`}>{badge}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function EjeCard({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{fmt(value)}</p>
      <div className="mt-2 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{p}% del total warmup</p>
    </div>
  )
}

function FunnelRow({ label, value, base, color }: { label: string; value: number; base: number; color: string }) {
  const p = base > 0 ? Math.round((value / base) * 100) : 0
  return (
    <tr>
      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{label}</td>
      <td className="text-right px-4 py-3 font-medium text-gray-800 dark:text-gray-100 tabular-nums">{fmt(value)}</td>
      <td className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 tabular-nums">{pct(value, base)}</td>
      <td className="px-4 py-3">
        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${Math.max(p, value > 0 ? 1 : 0)}%` }} />
        </div>
      </td>
    </tr>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4 text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{fmt(value)}</p>
    </div>
  )
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a
      href={href}
      className="hc-surface bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center gap-3 hover:border-[#004B83] dark:hover:border-[#0066aa] hover:shadow-md transition-all group"
    >
      <span className="text-2xl text-[#004B83] dark:text-[#0066aa] group-hover:scale-110 transition-transform">{icon}</span>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
    </a>
  )
}
