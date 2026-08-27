import { NextRequest, NextResponse } from 'next/server'
import { validateViewerSession } from '@/lib/viewer-auth'
import { validateAdminSession } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'

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
    .select('status, error_message, username')
    .eq('id', jobId)
    .single()

  if (error || !job || job.username !== username) {
    return NextResponse.json({ error: 'Trabajo no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ status: job.status, error: job.error_message ?? null })
}
