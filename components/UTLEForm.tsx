'use client'

import { useState, useCallback } from 'react'
import { PatientPublicData, FormAnswers, EstadoFinal, TipoAtencion } from '@/lib/types'
import ProgressBar from './ProgressBar'
import ClosingMessage from './ClosingMessage'
import Step1Consent from './steps/Step1Consent'
import Step2Identity from './steps/Step2Identity'
import Step3Case from './steps/Step3Case'
import Step4Continue from './steps/Step4Continue'
import Step5Conditions from './steps/Step5Conditions'
import Step6Contact from './steps/Step6Contact'

interface Props {
  patient: PatientPublicData
}

type Screen =
  | { type: 'step'; step: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'closing'; title: string; message: string }

const CLOSING: Record<string, { title: string; message: string }> = {
  NO_AUTORIZO: {
    title: 'Entendemos su decisión',
    message:
      'Si desea información o actualizar sus datos, puede comunicarse al 905-MISALUD.\nMuchas gracias.',
  },
  NO_VERIFICADO: {
    title: 'No pudimos verificar su identidad',
    message:
      'Lamentablemente no pudimos verificar su identificación.\nSi usted se encuentra en lista de espera para atención en la CCSS, por favor comuníquese al 905-MISALUD.',
  },
  INFO_INCORRECTA: {
    title: 'Información no coincide',
    message:
      'Gracias por la información.\nSi considera que esto es un error, puede comunicarse al 905-MISALUD para recibir asesoramiento.\nMuchas gracias por su tiempo.',
  },
  DEPURADO_YA_ATENDIDO: {
    title: 'Muchas gracias',
    message:
      'Nos alegra saber que ya recibió la atención que necesitaba.\nLa CCSS está para servirle.',
  },
  DEPURADO_YA_PROGRAMADO: {
    title: 'Muchas gracias',
    message:
      'Nos alegra saber que ya tiene programada su atención.\nLa CCSS está para servirle.',
  },
  DEPURADO_RENUNCIA: {
    title: 'Entendemos su decisión',
    message:
      'Registraremos que no desea continuar con esta atención y su caso será retirado de la lista de espera.\nSi en el futuro desea retomar el proceso, puede comunicarse al 905-MISALUD.\nMuchas gracias.',
  },
  ACTIVO: {
    title: 'Muchas gracias por su información',
    message:
      'Estos datos nos ayudan a mantener actualizado su registro y avanzar con la gestión de la lista de espera.\nPor favor esté pendiente de llamadas, mensajes o correos de la CCSS.',
  },
}

async function submitResponse(answers: FormAnswers) {
  await fetch('/api/survey-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(answers),
  })
}

export default function UTLEForm({ patient }: Props) {
  const [screen, setScreen] = useState<Screen>({ type: 'step', step: 1 })
  const [answers, setAnswers] = useState<FormAnswers>({
    id_registro: patient.id_registro,
    canal: 'correo',
  })

  const visibleStep = screen.type === 'step' ? screen.step : null

  const closeWithState = useCallback(
    async (estado: EstadoFinal, extra: Partial<FormAnswers> = {}, paso: number) => {
      const finalAnswers: FormAnswers = {
        ...answers,
        ...extra,
        estado_final: estado,
        completado: true,
        paso_abandono: estado === 'ACTIVO' ? null : paso,
      }
      setAnswers(finalAnswers)
      await submitResponse(finalAnswers)
      setScreen({ type: 'closing', ...CLOSING[estado] })
    },
    [answers]
  )

  // --- Step 1: Consent ---
  function handleConsent(authorized: boolean) {
    const updated = { ...answers, paso_1_consentimiento: authorized ? 'si_autorizo' : 'no_autorizo' } as FormAnswers
    setAnswers(updated)
    if (!authorized) {
      closeWithState('NO_AUTORIZO', { paso_1_consentimiento: 'no_autorizo' }, 1)
      return
    }
    setScreen({ type: 'step', step: 2 })
  }

  // --- Step 2: Identity ---
  function handleIdentitySuccess(intentos: number) {
    setAnswers((prev) => ({ ...prev, paso_2_verificacion: 'exitosa', paso_2_intentos: intentos }))
    setScreen({ type: 'step', step: 3 })
  }

  function handleIdentityFailed(intentos: number) {
    closeWithState('NO_VERIFICADO', { paso_2_verificacion: 'fallida', paso_2_intentos: intentos }, 2)
  }

  // --- Step 3: Case ---
  function handleCaseConfirm(correct: boolean) {
    setAnswers((prev) => ({ ...prev, paso_3_info_correcta: correct ? 'si' : 'no' }))
    if (!correct) {
      closeWithState('INFO_INCORRECTA', { paso_3_info_correcta: 'no' }, 3)
      return
    }
    setScreen({ type: 'step', step: 4 })
  }

  // --- Step 4: Continue ---
  function handleContinue() {
    setAnswers((prev) => ({ ...prev, paso_4_desea_continuar: 'si' }))
    setScreen({ type: 'step', step: 5 })
  }

  function handleDepurado(reason: 'ya_realizada' | 'ya_programada') {
    const estado: EstadoFinal = reason === 'ya_realizada' ? 'DEPURADO_YA_ATENDIDO' : 'DEPURADO_YA_PROGRAMADO'
    const campo = reason === 'ya_realizada' ? 'no_ya_realizada' : 'no_ya_programada'
    closeWithState(estado, { paso_4_desea_continuar: campo as FormAnswers['paso_4_desea_continuar'] }, 4)
  }

  function handleRenuncia(motivo: string) {
    closeWithState('DEPURADO_RENUNCIA', {
      paso_4_desea_continuar: 'no_ya_no_deseo',
      motivo_retiro: motivo,
    }, 4)
  }

  // --- Step 5: Conditions ---
  function handleConditions(
    flexibilidad: 'si' | 'no',
    condiciones: 'si' | 'no',
    motivoNoAsistir: string | null
  ) {
    setAnswers((prev) => ({
      ...prev,
      paso_5a_flexibilidad_centro: flexibilidad,
      paso_5b_condiciones_asistir: condiciones,
      paso_5b_motivo_no_asistir: motivoNoAsistir,
    }))
    setScreen({ type: 'step', step: 6 })
  }

  // --- Step 6: Contact ---
  async function handleContact(medio: FormAnswers['paso_6_medio_contacto']) {
    const final: FormAnswers = {
      ...answers,
      paso_6_medio_contacto: medio,
      estado_final: 'ACTIVO',
      completado: true,
      paso_abandono: null,
    }
    setAnswers(final)
    await submitResponse(final)
    setScreen({ type: 'closing', ...CLOSING.ACTIVO })
  }

  if (screen.type === 'closing') {
    return (
      <ClosingMessage
        title={screen.title}
        message={screen.message}
        highlight="905-MISALUD"
      />
    )
  }

  return (
    <div className="mt-8">
      <ProgressBar currentStep={screen.step} totalSteps={6} />

      {screen.step === 1 && (
        <Step1Consent nombrePaciente={patient.nombre_paciente} onAnswer={handleConsent} />
      )}
      {screen.step === 2 && (
        <Step2Identity
          idRegistro={patient.id_registro}
          onSuccess={handleIdentitySuccess}
          onFailed={handleIdentityFailed}
        />
      )}
      {screen.step === 3 && (
        <Step3Case patient={patient} onAnswer={handleCaseConfirm} />
      )}
      {screen.step === 4 && (
        <Step4Continue
          tipoAtencion={patient.tipo_atencion as TipoAtencion}
          onContinue={handleContinue}
          onDepurado={handleDepurado}
          onRenuncia={handleRenuncia}
        />
      )}
      {screen.step === 5 && (
        <Step5Conditions onDone={handleConditions} />
      )}
      {screen.step === 6 && (
        <Step6Contact onDone={handleContact} />
      )}

      <p className="text-center text-xs text-gray-400 mt-8">
        ¿Necesita ayuda? <span className="font-medium text-ccss-primary">905-MISALUD</span>
      </p>
    </div>
  )
}
