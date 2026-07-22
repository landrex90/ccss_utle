/**
 * Ejecuta la migración 016 (viewer_users) directamente contra Supabase prod.
 * Uso: node --env-file=.env.local scripts/run-migration-016.js
 */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const url    = process.env.NEXT_PUBLIC_SUPABASE_URL
const key    = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Hashes SHA-256 de cédulas del equipo UTLE
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

const VIEWERS = [
  { username: 'jcchacov',  cedula: '114150004', nombre: 'Jeancarlo Chacón Villalobos' },
  { username: 'mcastillc', cedula: '114130264', nombre: 'Mariam Castillo Carvajal' },
  { username: 'erarriet',  cedula: '503400320', nombre: 'Enué Rodrigo Arrieta Espinoza' },
  { username: 'kcolby',    cedula: '402110069', nombre: 'Katherine Colby Jiménez' },
]

async function main() {
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // 1. Crear tabla si no existe (via Management API)
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  if (!projectRef) {
    console.error('No se pudo extraer el project ref de la URL')
    process.exit(1)
  }

  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
  const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN

  const createSQL = `
    CREATE TABLE IF NOT EXISTS viewer_users (
      id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
      username    text    UNIQUE NOT NULL,
      cedula_hash text    NOT NULL,
      nombre      text    NOT NULL,
      activo      boolean DEFAULT true,
      created_at  timestamptz DEFAULT now()
    );
  `

  if (supabaseToken) {
    console.log('Creando tabla viewer_users via Management API...')
    const res = await fetch(managementUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: createSQL }),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error('Error creando tabla:', txt)
    } else {
      console.log('✅ Tabla creada (o ya existía)')
    }
  } else {
    console.log('⚠️  SUPABASE_ACCESS_TOKEN no encontrado — se omite CREATE TABLE')
    console.log('   Si la tabla viewer_users no existe, créela manualmente con el SQL del archivo')
    console.log('   supabase/migrations/016_viewer_users.sql\n')
  }

  // 2. Insertar usuarios (PostgREST sí soporta INSERT)
  console.log('Insertando usuarios viewer...')
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
      console.error(`❌ Error con ${v.username}:`, error.message)
    } else {
      console.log(`✅ ${v.username} (${v.nombre})`)
    }
  }

  console.log('\nMigración completada.')
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
