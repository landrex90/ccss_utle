import { createClient } from '@/lib/supabase/server'
import { PatientPublicData } from '@/lib/types'
import UTLEForm from '@/components/UTLEForm'

interface Props {
  searchParams: { id?: string; token?: string }
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <CCSSHeader />
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <p className="text-gray-600 text-lg leading-relaxed">{message}</p>
          <p className="mt-4 text-ccss-primary font-semibold text-lg">905-MISALUD</p>
        </div>
      </div>
    </main>
  )
}

function CCSSHeader() {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ccss-primary mb-3">
        <span className="text-white font-bold text-xl">CCSS</span>
      </div>
      <p className="text-sm text-gray-500 font-medium">
        Caja Costarricense de Seguro Social
      </p>
      <p className="text-xs text-gray-400 mt-1">
        Unidad Técnica de Listas de Espera
      </p>
    </div>
  )
}

export default async function UTLEPage({ searchParams }: Props) {
  const { id, token } = searchParams

  if (!id || !token) {
    return <ErrorPage message="El enlace no es válido. Por favor verifique que el enlace sea el correcto o comuníquese al 905-MISALUD." />
  }

  const supabase = createClient()

  const { data: registro, error } = await supabase
    .from('registros')
    .select(
      'id_registro, nombre_paciente, tipo_atencion, nombre_servicio, especialidad, centro_medico, lateralidad, token, link_expires_at, estado'
    )
    .eq('id_registro', id)
    .single()

  if (error || !registro) {
    return <ErrorPage message="No encontramos su registro en el sistema. Por favor comuníquese al 905-MISALUD." />
  }

  if (registro.token !== token) {
    return <ErrorPage message="El enlace no es válido. Por favor comuníquese al 905-MISALUD." />
  }

  if (new Date(registro.link_expires_at) < new Date()) {
    return <ErrorPage message="Este enlace ha expirado. Por favor comuníquese al 905-MISALUD para solicitar uno nuevo." />
  }

  if (registro.estado !== 'PENDIENTE') {
    return <ErrorPage message="Ya hemos recibido su respuesta. Muchas gracias por su participación. Si tiene consultas, comuníquese al 905-MISALUD." />
  }

  const patient: PatientPublicData = {
    id_registro: registro.id_registro,
    nombre_paciente: registro.nombre_paciente,
    tipo_atencion: registro.tipo_atencion,
    nombre_servicio: registro.nombre_servicio ?? null,
    especialidad: registro.especialidad ?? null,
    centro_medico: registro.centro_medico,
    lateralidad: registro.lateralidad ?? null,
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <CCSSHeader />
        <UTLEForm patient={patient} />
      </div>
    </main>
  )
}
