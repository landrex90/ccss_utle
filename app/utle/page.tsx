import Image from 'next/image'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { PatientPublicData } from '@/lib/types'
import UTLEForm from '@/components/UTLEForm'

function parseDevice(ua: string): string {
  const mobile  = /Mobile|Android|iPhone|iPad/i.test(ua)
  let os        = 'Desconocido'
  if      (/Windows/i.test(ua))          os = 'Windows'
  else if (/iPhone|iPad/i.test(ua))      os = 'iOS'
  else if (/Android/i.test(ua))          os = 'Android'
  else if (/Mac OS/i.test(ua))           os = 'macOS'
  else if (/Linux/i.test(ua))            os = 'Linux'
  let browser   = 'Desconocido'
  if      (/Edg/i.test(ua))             browser = 'Edge'
  else if (/Chrome/i.test(ua))          browser = 'Chrome'
  else if (/Firefox/i.test(ua))         browser = 'Firefox'
  else if (/Safari/i.test(ua))          browser = 'Safari'
  return `${mobile ? 'Móvil' : 'Escritorio'} / ${os} / ${browser}`
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { t?: string }
}

const CONTACT_EMAIL = 'gm_utle_gelisespera@ccss.sa.cr'

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <CCSSHeader />
        <div className="mt-8 card p-8">
          <p className="text-gray-700 dark:text-gray-200 text-lg leading-relaxed">{message}</p>
          <p className="mt-4 text-ccss-primary dark:text-ccss-accent font-medium text-sm">{CONTACT_EMAIL}</p>
        </div>
      </div>
    </main>
  )
}

function CCSSHeader() {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-3">
        <Image
          src="/logos/ccss-logo.jpg"
          alt="Caja Costarricense de Seguro Social"
          width={80}
          height={80}
          className="rounded-full dark:invert"
          priority
        />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-300 font-medium">
        Caja Costarricense de Seguro Social
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        Unidad Técnica de Listas de Espera
      </p>
    </div>
  )
}

export default async function UTLEPage({ searchParams }: Props) {
  const { t } = searchParams

  if (!t) {
    return <ErrorPage message="El enlace no es válido. Por favor verifique que el enlace sea el correcto o comuníquese a:" />
  }

  const supabase = createClient()

  const { data: registro, error } = await supabase
    .from('registros')
    .select(
      'nombre_paciente, tipo_atencion, nombre_servicio, especialidad, centro_medico, lateralidad, procedimiento, tipo_consulta, fecha_cita, hora_cita, link_expires_at, estado, primer_acceso_at'
    )
    .eq('token', t)
    .single()

  if (error || !registro) {
    return <ErrorPage message="No encontramos su registro en el sistema. Para asistencia comuníquese a:" />
  }

  if (new Date(registro.link_expires_at) < new Date()) {
    return <ErrorPage message="Este enlace ha expirado. Para solicitar uno nuevo, comuníquese a:" />
  }

  if (registro.estado !== 'PENDIENTE') {
    return <ErrorPage message="Ya hemos recibido su respuesta. Muchas gracias por su participación. Si tiene consultas, comuníquese a:" />
  }

  // Registrar primer acceso: IP, dispositivo y geolocalización
  if (!registro.primer_acceso_at) {
    const headersList = headers()
    const ip          = headersList.get('x-forwarded-for')?.split(',')[0].trim()
                     ?? headersList.get('x-real-ip')
                     ?? null
    const ua          = headersList.get('user-agent') ?? null
    const dispositivo = ua ? parseDevice(ua) : null

    let pais: string | null = null
    let ciudad: string | null = null
    if (ip) {
      try {
        const geo = await fetch(`http://ip-api.com/json/${ip}?fields=country,city&lang=es`, {
          cache: 'no-store',
        }).then(r => r.ok ? r.json() : null)
        pais   = geo?.country ?? null
        ciudad = geo?.city    ?? null
      } catch { /* no bloquear el flujo si la geo falla */ }
    }

    const ahora          = new Date()
    const nuevaExpiracion = new Date(ahora.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

    await supabase
      .from('registros')
      .update({
        primer_acceso_at:          ahora.toISOString(),
        primer_acceso_ip:          ip,
        primer_acceso_dispositivo: dispositivo,
        primer_acceso_pais:        pais,
        primer_acceso_ciudad:      ciudad,
        link_expires_at:           nuevaExpiracion,
      })
      .eq('token', t)
  }

  const patient: PatientPublicData = {
    nombre_paciente: registro.nombre_paciente,
    tipo_atencion:   registro.tipo_atencion,
    nombre_servicio: registro.nombre_servicio ?? null,
    especialidad:    registro.especialidad    ?? null,
    centro_medico:   registro.centro_medico,
    lateralidad:     registro.lateralidad     ?? null,
    procedimiento:   registro.procedimiento   ?? null,
    tipo_consulta:   registro.tipo_consulta   ?? null,
    fecha_cita:      registro.fecha_cita      ?? null,
    hora_cita:       registro.hora_cita       ?? null,
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 hc-page py-8 px-4">
      <div className="max-w-lg mx-auto">
        <CCSSHeader />
        <UTLEForm patient={patient} token={t} />
      </div>
    </main>
  )
}
