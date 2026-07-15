/**
 * Crea las cuentas viewer de CoCo Tech AI en viewer_users.
 * Ejecutar UNA sola vez: node --env-file=.env.local scripts/_create-viewers-coco.js
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function sha256(text) {
  return crypto.createHash('sha256').update(text.trim()).digest('hex')
}

const USUARIOS = [
  { username: 'mariamn',  password: 'Coco#MN2026', nombre: 'Mariam Naranjo Bustos' },
  { username: 'ncorrea',  password: 'Coco#NC2026', nombre: 'Natalia Correa' },
]

for (const u of USUARIOS) {
  const { error } = await sb
    .from('viewer_users')
    .upsert({
      username:    u.username,
      cedula_hash: sha256(u.password),
      nombre:      u.nombre,
      activo:      true,
    }, { onConflict: 'username' })

  if (error) {
    console.error(`❌ ${u.username}: ${error.message}`)
  } else {
    console.log(`✅ ${u.username} — ${u.nombre}`)
  }
}
