import { NextRequest, NextResponse } from 'next/server'
import { validateViewerSession } from '@/lib/viewer-auth'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'

const COOLDOWN_MS = 60 * 60 * 1000 // 1 hora

export async function POST(request: NextRequest) {
  const username = validateViewerSession(request) ?? (validateAdminSession(request) ? 'admin' : null)
  if (!username) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createClient()

  // ── Límite: 1 descarga consolidada por hora por usuario ──────────────────
  const desde = new Date(Date.now() - COOLDOWN_MS).toISOString()
  const { data: recientes } = await supabase
    .from('descargas_log')
    .select('descargado_at')
    .eq('username', username)
    .eq('tipo_export', 'consolidado')
    .gte('descargado_at', desde)
    .order('descargado_at', { ascending: false })
    .limit(1)

  if (recientes && recientes.length > 0) {
    const proxima = new Date(new Date(recientes[0].descargado_at).getTime() + COOLDOWN_MS)
    const minutosRestantes = Math.ceil((proxima.getTime() - Date.now()) / 60000)
    return NextResponse.json(
      { error: `Ya descargaste el consolidado recientemente. Intenta de nuevo en ${minutosRestantes} minuto(s).` },
      { status: 429 }
    )
  }

  const { data: job, error } = await supabase
    .from('export_jobs')
    .insert({ username, status: 'pending' })
    .select('id')
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'No se pudo iniciar el export' }, { status: 500 })
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_URL || ''
  fetch(`${siteUrl}/.netlify/functions/generate-export-completo-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: job.id }),
  }).catch(err => console.error('[export-start] no se pudo disparar la función de fondo:', err))

  return NextResponse.json({ jobId: job.id })
}
