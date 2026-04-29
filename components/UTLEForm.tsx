'use client'

import { useState, useCallback, useRef } from 'react'
import { PatientPublicData, FormAnswers, EstadoFinal, TipoAtencion } from '@/lib/types'
import ProgressBar     from './ProgressBar'
import ClosingMessage  from './ClosingMessage'
import ConfirmModal    from './ConfirmModal'
import AnswersSummary, { AnswerEntry } from './AnswersSummary'
import SummaryScreen   from './SummaryScreen'
import Step1Consent    from './steps/Step1Consent'
import Step2Identity   from './steps/Step2Identity'
import Step3Case       from './steps/Step3Case'
import Step4Continue   from './steps/Step4Continue'
import Step5Conditions from './steps/Step5Conditions'
import Step6Contact    from './steps/Step6Contact'

const AUTOADVANCE_MS = 450

type FlowStep = 1 | 2 | 3 | 4 | 5 | 6 | 'summary' | 'closing'

interface ConfirmState {
  title:     string
  message:   string
  onConfirm: () => void
}

const CLOSING_DATA: Record<EstadoFinal, { title: string; message: string }> = {
  NO_AUTORIZO: {
    title:   'Entendemos su decisión',
    message: 'Si desea información o actualizar sus datos, puede comunicarse al 905-MISALUD.\nMuchas gracias.',
  },
  NO_VERIFICADO: {
    title:   'No pudimos verificar su identidad',
    message: 'Lamentablemente no pudimos verificar su identificación.\nSi usted se encuentra en lista de espera, por favor comuníquese al 905-MISALUD.',
  },
  INFO_INCORRECTA: {
    title:   'Información no coincide',
    message: 'Gracias por la información. Si considera que esto es un error, comuníquese al 905-MISALUD.\nMuchas gracias por su tiempo.',
  },
  DEPURADO_YA_ATENDIDO: {
    title:   'Muchas gracias',
    message: 'Nos alegra saber que ya recibió la atención que necesitaba.\nLa CCSS está para servirle.',
  },
  DEPURADO_YA_PROGRAMADO: {
    title:   'Muchas gracias',
    message: 'Nos alegra saber que ya tiene programada su atención.\nLa CCSS está para servirle.',
  },
  DEPURADO_RENUNCIA: {
    title:   'Entendemos su decisión',
    message: 'Registraremos que no desea continuar con esta atención y su caso será retirado de la lista de espera.\nSi en el futuro desea retomar el proceso, comuníquese al 905-MISALUD.\nMuchas gracias.',
  },
  ACTIVO: {
    title:   'Muchas gracias por su información',
    message: 'Estos datos nos ayudan a mantener actualizado su registro.\nPor favor esté pendiente de llamadas, mensajes o correos de la CCSS.',
  },
}

const STEP_ANSWER_FIELDS: Partial<Record<number, (keyof FormAnswers)[]>> = {
  3: ['paso_3_info_correcta'],
  4: ['paso_4_desea_continuar', 'motivo_retiro'],
  5: ['paso_5a_flexibilidad_centro', 'paso_5b_condiciones_asistir', 'paso_5b_motivo_no_asistir'],
  6: ['paso_6_medio_contacto'],
}

async function submitResponse(answers: FormAnswers) {
  await fetch('/api/survey-response', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(answers),
  })
}

export default function UTLEForm({ patient, token }: { patient: PatientPublicData; token: string }) {
  const [flowStep,         setFlowStep]         = useState<FlowStep>(1)
  const [stepHistory,      setStepHistory]       = useState<number[]>([1])
  const [answers,          setAnswers]           = useState<FormAnswers>({ token, canal: 'correo' })
  const [completedAnswers, setCompletedAnswers]  = useState<AnswerEntry[]>([])
  const [pendingSelection, setPendingSelection]  = useState<string | null>(null)
  const [confirmModal,     setConfirmModal]      = useState<ConfirmState | null>(null)
  const [closingData,      setClosingData]       = useState<{ title: string; message: string } | null>(null)
  const [submitting,       setSubmitting]        = useState(false)
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isNumberStep = (s: FlowStep): s is 1|2|3|4|5|6 => typeof s === 'number'

  // ── Navigation helpers ───────────────────────────────────────
  function advanceTo(next: FlowStep) {
    if (isNumberStep(next)) {
      setStepHistory(h => [...h, next])
    }
    setFlowStep(next)
  }

  function goBack() {
    if (stepHistory.length < 2) return
    const newHistory = stepHistory.slice(0, -1)
    const prev = newHistory[newHistory.length - 1]
    // Clear answers for the step we're leaving and beyond
    const leavingStep = stepHistory[stepHistory.length - 1]
    setAnswers(a => {
      const updated = { ...a }
      for (let s = leavingStep; s <= 6; s++) {
        (STEP_ANSWER_FIELDS[s] ?? []).forEach(f => { delete updated[f] })
      }
      return updated
    })
    setCompletedAnswers(ca => ca.filter(e => e.step < leavingStep))
    setStepHistory(newHistory)
    setFlowStep(prev as FlowStep)
  }

  const canGoBack = isNumberStep(flowStep) && flowStep >= 4 && stepHistory.length > 1

  // ── Auto-advance wrapper ─────────────────────────────────────
  function autoAdvance(value: string, callback: () => void) {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current)
    setPendingSelection(value)
    autoAdvanceTimer.current = setTimeout(() => {
      setPendingSelection(null)
      callback()
    }, AUTOADVANCE_MS)
  }

  // ── Completed answers tracker ────────────────────────────────
  function recordAnswer(step: number, stepName: string, answer: string) {
    setCompletedAnswers(ca => [...ca.filter(e => e.step !== step), { step, stepName, answer }])
  }

  // ── Close flow with state ────────────────────────────────────
  const closeWithState = useCallback(async (
    estado: EstadoFinal,
    extra:  Partial<FormAnswers> = {},
    paso:   number,
  ) => {
    const final: FormAnswers = {
      ...answers, ...extra,
      estado_final:  estado,
      completado:    true,
      paso_abandono: estado === 'ACTIVO' ? null : paso,
    }
    await submitResponse(final)
    setClosingData(CLOSING_DATA[estado])
    setFlowStep('closing')
  }, [answers])

  // ── Step 1 ───────────────────────────────────────────────────
  function handleConsent(authorized: boolean) {
    if (!authorized) {
      autoAdvance('no', () => {
        setConfirmModal({
          title:   '¿Está seguro?',
          message: 'Si no autoriza, no podremos actualizar su información en la lista de espera.',
          onConfirm: () => {
            setConfirmModal(null)
            const updated = { ...answers, paso_1_consentimiento: 'no_autorizo' as const }
            setAnswers(updated)
            closeWithState('NO_AUTORIZO', { paso_1_consentimiento: 'no_autorizo' }, 1)
          },
        })
      })
      return
    }
    autoAdvance('si', () => {
      recordAnswer(1, 'Consentimiento', 'Autorizado')
      setAnswers(a => ({ ...a, paso_1_consentimiento: 'si_autorizo' }))
      advanceTo(2)
    })
  }

  // ── Step 2 ───────────────────────────────────────────────────
  function handleIdentitySuccess(intentos: number) {
    recordAnswer(2, 'Verificación', 'Identidad verificada')
    setAnswers(a => ({ ...a, paso_2_verificacion: 'exitosa', paso_2_intentos: intentos }))
    advanceTo(3)
  }

  function handleIdentityFailed(intentos: number) {
    closeWithState('NO_VERIFICADO', { paso_2_verificacion: 'fallida', paso_2_intentos: intentos }, 2)
  }

  // ── Step 3 ───────────────────────────────────────────────────
  function handleCaseConfirm(correct: boolean) {
    if (!correct) {
      autoAdvance('no', () => {
        recordAnswer(3, 'Sus datos', 'Información no correcta')
        setAnswers(a => ({ ...a, paso_3_info_correcta: 'no' }))
        closeWithState('INFO_INCORRECTA', { paso_3_info_correcta: 'no' }, 3)
      })
      return
    }
    autoAdvance('si', () => {
      recordAnswer(3, 'Sus datos', 'Información correcta')
      setAnswers(a => ({ ...a, paso_3_info_correcta: 'si' }))
      advanceTo(4)
    })
  }

  // ── Step 4 ───────────────────────────────────────────────────
  function handleContinue() {
    recordAnswer(4, 'Decisión', 'Desea continuar')
    setAnswers(a => ({ ...a, paso_4_desea_continuar: 'si' }))
    advanceTo(5)
  }

  function handleDepurado(reason: 'ya_realizada' | 'ya_programada') {
    const estado: EstadoFinal = reason === 'ya_realizada' ? 'DEPURADO_YA_ATENDIDO' : 'DEPURADO_YA_PROGRAMADO'
    const campo = reason === 'ya_realizada' ? 'no_ya_realizada' : 'no_ya_programada'
    closeWithState(estado, { paso_4_desea_continuar: campo as FormAnswers['paso_4_desea_continuar'] }, 4)
  }

  function handleRenunciaIntent() {
    setConfirmModal({
      title:   '¿Está seguro de que desea retirarse?',
      message: 'Esta acción retirará su caso de la lista de espera. Podrá volver a solicitarlo llamando al 905-MISALUD.',
      onConfirm: () => setConfirmModal(null), // Step4 will handle motivo sub-step
    })
  }

  function handleRenunciaConfirmed(motivo: string) {
    closeWithState('DEPURADO_RENUNCIA', {
      paso_4_desea_continuar: 'no_ya_no_deseo',
      motivo_retiro: motivo,
    }, 4)
  }

  // ── Step 5 ───────────────────────────────────────────────────
  function handleConditions(flexibilidad: 'si'|'no', condiciones: 'si'|'no', motivoNoAsistir: string|null) {
    const answerText = condiciones === 'si'
      ? `Puede asistir · Centro alternativo: ${flexibilidad === 'si' ? 'Sí' : 'No'}`
      : `No puede asistir · Centro alternativo: ${flexibilidad === 'si' ? 'Sí' : 'No'}`
    recordAnswer(5, 'Disponibilidad', answerText)
    setAnswers(a => ({
      ...a,
      paso_5a_flexibilidad_centro:  flexibilidad,
      paso_5b_condiciones_asistir:  condiciones,
      paso_5b_motivo_no_asistir:    motivoNoAsistir,
    }))
    advanceTo(6)
  }

  // ── Step 6 ───────────────────────────────────────────────────
  function handleContact(medio: FormAnswers['paso_6_medio_contacto']) {
    const labels: Record<string, string> = {
      llamada: 'Llamada telefónica', whatsapp: 'WhatsApp',
      correo: 'Correo electrónico', sms: 'SMS', cualquiera: 'Cualquiera',
    }
    recordAnswer(6, 'Contacto', labels[medio ?? ''] ?? '')
    setAnswers(a => ({ ...a, paso_6_medio_contacto: medio }))
    advanceTo('summary')
  }

  // ── Summary confirm & submit ─────────────────────────────────
  async function handleFinalConfirm() {
    setSubmitting(true)
    const final: FormAnswers = { ...answers, estado_final: 'ACTIVO', completado: true, paso_abandono: null }
    await submitResponse(final)
    setSubmitting(false)
    setClosingData(CLOSING_DATA.ACTIVO)
    setFlowStep('closing')
  }

  // ── Render: closing ─────────────────────────────────────────
  if (flowStep === 'closing' && closingData) {
    return <ClosingMessage title={closingData.title} message={closingData.message} highlight="905-MISALUD" />
  }

  // ── Render: summary ─────────────────────────────────────────
  if (flowStep === 'summary') {
    return (
      <div className="mt-8">
        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
          />
        )}
        <SummaryScreen
          answers={answers}
          patient={patient}
          onConfirm={handleFinalConfirm}
          onBack={() => {
            setCompletedAnswers(ca => ca.filter(e => e.step < 6))
            setStepHistory(h => h.slice(0, -1))
            setFlowStep(6)
          }}
          loading={submitting}
        />
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          ¿Necesita ayuda? <span className="font-medium text-ccss-primary dark:text-ccss-accent">905-MISALUD</span>
        </p>
      </div>
    )
  }

  // ── Render: steps 1–6 ───────────────────────────────────────
  const numStep = flowStep as 1|2|3|4|5|6
  const answersForSummary = completedAnswers.filter(e => e.step < numStep)

  return (
    <div className="mt-8">
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => { setConfirmModal(null); setPendingSelection(null) }}
        />
      )}

      <ProgressBar
        currentStep={numStep}
        totalSteps={6}
        canGoBack={canGoBack}
        onBack={goBack}
      />

      <AnswersSummary entries={answersForSummary} />

      {flowStep === 1 && (
        <Step1Consent
          nombrePaciente={patient.nombre_paciente}
          onAnswer={handleConsent}
          pendingSelection={pendingSelection}
        />
      )}
      {flowStep === 2 && (
        <Step2Identity
          token={token}
          onSuccess={handleIdentitySuccess}
          onFailed={handleIdentityFailed}
        />
      )}
      {flowStep === 3 && (
        <Step3Case
          patient={patient}
          onAnswer={handleCaseConfirm}
          pendingSelection={pendingSelection}
        />
      )}
      {flowStep === 4 && (
        <Step4Continue
          tipoAtencion={patient.tipo_atencion as TipoAtencion}
          onContinue={handleContinue}
          onDepurado={handleDepurado}
          onRenunciaIntent={handleRenunciaIntent}
          onRenunciaConfirmed={handleRenunciaConfirmed}
          pendingSelection={pendingSelection}
          confirmModalOpen={!!confirmModal}
        />
      )}
      {flowStep === 5 && (
        <Step5Conditions
          onDone={handleConditions}
          pendingSelection={pendingSelection}
        />
      )}
      {flowStep === 6 && (
        <Step6Contact
          onDone={handleContact}
          pendingSelection={pendingSelection}
        />
      )}

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-8">
        ¿Necesita ayuda? <span className="font-medium text-ccss-primary dark:text-ccss-accent">905-MISALUD</span>
      </p>
    </div>
  )
}
