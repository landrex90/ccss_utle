/**
 * Ruta de uso único para crear la tabla viewer_users y hacer seed del equipo UTLE.
 * Protegida por admin cookie. Después de ejecutar, eliminar este archivo.
 * GET /api/admin/init-viewers
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateAdminSessionServer } from '@/lib/admin-auth'
import crypto from 'crypto'

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

const VIEWERS = [
  { username: 'jcchacov',  cedula: '114150004', nombre: 'Jeancarlo Chacón Villalobos' },
  { username: 'mcastillc', cedula: '114130264', nombre: 'Mariam Castillo Carvajal' },
  { username: 'erarriet',  cedula: '503400320', nombre: 'Enué Rodrigo Arrieta Espinoza' },
  { username: 'kcolby',    cedula: '402110069', nombre: 'Katherine Colby Jiménez' },
]

export async function GET(_request: NextRequest) {
  if (!validateAdminSessionServer()) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const sb = createClient()

  // Usar rpc para ejecutar DDL — requiere que la función exec_sql exista en Supabase
  // Si no existe, hacemos upsert directo y la tabla se crea vía el SQL editor manual
  const log: string[] = []

  // Intentar crear la tabla via rpc si está disponible
  try {
    const { error: rpcError } = await sb.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS viewer_users (
          id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
          username    text    UNIQUE NOT NULL,
          cedula_hash text    NOT NULL,
          nombre      text    NOT NULL,
          activo      boolean DEFAULT true,
          created_at  timestamptz DEFAULT now()
        );
      `
    })
    if (rpcError) {
      log.push(`CREATE TABLE via rpc falló (${rpcError.message}) — tabla debe ya existir o créela manualmente`)
    } else {
      log.push('✅ Tabla viewer_users creada')
    }
  } catch {
    log.push('rpc exec_sql no disponible — asumiendo que tabla ya existe')
  }

  // Insertar usuarios
  for (const v of VIEWERS) {
    const { error } = await sb
      .from('viewer_users')
      .upsert({
        username:    v.username,
        cedula_hash: sha256(v.cedula),
        nombre:      v.nombre,
        activo:      true,
      }, { onConflict: 'username' })

    if (error) {
      log.push(`❌ ${v.username}: ${error.message}`)
    } else {
      log.push(`✅ ${v.username} — ${v.nombre}`)
    }
  }

  return NextResponse.json({ ok: true, log }, { status: 200 })
}
