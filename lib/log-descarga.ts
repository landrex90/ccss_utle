import { createClient } from '@/lib/supabase/server'

export async function logDescarga(
  username: string,
  tipoExport: 'consolidado' | 'registros' | 'respuestas',
  campanaId?: string | null
) {
  const supabase = createClient()
  await supabase.from('descargas_log').insert({
    username,
    tipo_export: tipoExport,
    campana_id: campanaId ?? null,
  })
}
