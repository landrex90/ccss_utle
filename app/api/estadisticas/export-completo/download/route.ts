import { NextRequest, NextResponse } from 'next/server'
import { validateViewerSession } from '@/lib/viewer-auth'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import { logDescarga } from '@/lib/log-descarga'

export async function GET(request: NextRequest) {
  const username = validateViewerSession(request) ?? (validateAdminSession(request) ? 'admin' : null)
  if (!username) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Falta jobId' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: job, error } = await supabase
    .from('export_jobs')
    .select('status, csv_content, username')
    .eq('id', jobId)
    .single()

  if (error || !job || job.username !== username) {
    return NextResponse.json({ error: 'Trabajo no encontrado' }, { status: 404 })
  }
  if (job.status !== 'completed' || !job.csv_content) {
    return NextResponse.json({ error: 'El export aún no está listo' }, { status: 409 })
  }

  await logDescarga(username, 'consolidado')

  const fecha = new Date().toISOString().slice(0, 10)
  // BOM para que Excel abra el CSV con acentos correctamente
  const buf = Buffer.concat([Buffer.from('﻿', 'utf-8'), Buffer.from(job.csv_content, 'utf-8')])

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="CCSS_UTLE_consolidado_${fecha}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
