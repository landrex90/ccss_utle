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
const CONTACT_EMAIL  = 'gm_utle_gelisespera@ccss.sa.cr'

type FlowStep = 1 | 2 | 3 | 4 | 5 | 6 | 'transition' | 'summary' | 'closing'

interface ConfirmState {
  title:     string
  message:   string
  onConfirm: () => void
}

const CLOSING_DATA: Record<EstadoFinal, { title: string; message: string }> = {
  NO_AUTORIZO: {
    title:   'Entendemos su decisión',
    message: `Si en el futuro desea actualizar sus datos o tiene alguna consulta, puede comunicarse a:\n${CONTACT_EMAIL}\n\nMuchas gracias.`,
  },
  NO_VERIFICADO: {
    title:   'No pudimos verificar su identidad',
    message: `Si usted se encuentra en lista de espera y desea continuar el proceso, comuníquese a:\n${CONTACT_EMAIL}`,
  },
  INFO_INCORRECTA: {
    title:   'Información no coincide',
    message: `Gracias por indicarlo. Si considera que esto es un error, comuníquese a:\n${CONTACT_EMAIL}\n\nMuchas gracias por su tiempo.`,
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
    message: `Registraremos que ya no desea continuar con esta atención y su caso será retirado de la lista de espera.\n\nSi en el futuro desea retomar el proceso, comuníquese a:\n${CONTACT_EMAIL}\n\nMuchas gracias.`,
  },
  NO_ASEGURADO: {
    title:   'Hemos registrado su respuesta',
    message: `Hemos tomado nota de que usted no cuenta con aseguramiento activo en la CCSS.\n\nPara regularizar su situación o si considera que esto es un error, comuníquese a:\n${CONTACT_EMAIL}`,
  },
  ACTIVO: {
    title:   'Muchas gracias por su información',
    message: `Sus datos han sido actualizados correctamente. Por favor esté pendiente de llamadas, mensajes o correos de la CCSS.\n\nSi tiene alguna consulta:\n${CONTACT_EMAIL}`,
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

async function authorizeStep(
  token: string,
  verificationToken: string,
  fromStep: number,
  stepAnswers: Partial<FormAnswers>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/authorize-step', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, verification_token: verificationToken, from_step: fromStep, answers: stepAnswers }),
    })
    const data = await res.json()
    return data.authorized ? { ok: true } : { ok: false, error: data.error }
  } catch {
    return { ok: false, error: 'Error de conexión. Por favor intente nuevamente.' }
  }
}

export default function UTLEForm({ patient, token }: { patient: PatientPublicData; token: string }) {
  const [flowStep,         setFlowStep]        = useState<FlowStep>(1)
  const [stepHistory,      setStepHistory]      = useState<number[]>([1])
  const [answers,          setAnswers]          = useState<FormAnswers>({ token, canal: 'correo' })
  const [completedAnswers, setCompletedAnswers] = useState<AnswerEntry[]>([])
  const [pendingSelection, setPendingSelection] = useState<string | null>(null)
  const [confirmModal,     setConfirmModal]     = useState<ConfirmState | null>(null)
  const [closingData,      setClosingData]      = useState<{ title: string; message: string } | null>(null)
  const [submitting,       setSubmitting]       = useState(false)
  const [gateError,        setGateError]        = useState<string | null>(null)
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isNumberStep = (s: FlowStep): s is 1|2|3|4|5|6 => typeof s === 'number'

  // ── Navigation ───────────────────────────────────────────────
  function advanceTo(next: FlowStep) {
    if (isNumberStep(next)) setStepHistory(h => [...h, next])
    setFlowStep(next)
  }

  function goBack() {
    if (stepHistory.length < 2) return
    const newHistory    = stepHistory.slice(0, -1)
    const prev          = newHistory[newHistory.length - 1]
    const leavingStep   = stepHistory[stepHistory.length - 1]
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

  // ── Auto-advance ─────────────────────────────────────────────
  function autoAdvance(value: string, callback: () => void) {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current)
    setPendingSelection(value)
    autoAdvanceTimer.current = setTimeout(() => {
      setPendingSelection(null)
      callback()
    }, AUTOADVANCE_MS)
  }

  function recordAnswer(step: number, stepName: string, answer: string) {
    setCompletedAnswers(ca => [...ca.filter(e => e.step !== step), { step, stepName, answer }])
  }

  // ── Close flow ───────────────────────────────────────────────
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
  function handleIdentitySuccess(intentos: number, verificationToken: string) {
    recordAnswer(2, 'Verificación', 'Identidad verificada')
    setAnswers(a => ({ ...a, paso_2_verificacion: 'exitosa', paso_2_intentos: intentos, verification_token: verificationToken }))
    advanceTo(3)
  }

  function handleIdentityFailed(intentos: number) {
    closeWithState('NO_VERIFICADO', { paso_2_verificacion: 'fallida', paso_2_intentos: intentos }, 2)
  }

  // ── Step 3 ───────────────────────────────────────────────────
  async function handleCaseConfirm(correct: boolean) {
    if (!correct) {
      autoAdvance('no', () => {
        recordAnswer(3, 'Sus datos', 'Información no correcta')
        setAnswers(a => ({ ...a, paso_3_info_correcta: 'no' }))
        closeWithState('INFO_INCORRECTA', { paso_3_info_correcta: 'no' }, 3)
      })
      return
    }
    setGateError(null)
    setPendingSelection('si')
    const gate = await authorizeStep(token, answers.verification_token ?? '', 3, { paso_3_info_correcta: 'si' })
    setPendingSelection(null)
    if (!gate.ok) { setGateError(gate.error ?? 'Error al avanzar'); return }
    recordAnswer(3, 'Sus datos', 'Información correcta')
    setAnswers(a => ({ ...a, paso_3_info_correcta: 'si' }))
    advanceTo(4)
  }

  // ── Step 4 ───────────────────────────────────────────────────
  async function handleContinue() {
    setGateError(null)
    setPendingSelection('si')
    const gate = await authorizeStep(token, answers.verification_token ?? '', 4, { paso_4_desea_continuar: 'si' })
    setPendingSelection(null)
    if (!gate.ok) { setGateError(gate.error ?? 'Error al avanzar'); return }
    recordAnswer(4, 'Decisión', 'Desea continuar')
    setAnswers(a => ({ ...a, paso_4_desea_continuar: 'si' }))
    advanceTo('transition')
  }

  function handleNoAsegurado() {
    closeWithState('NO_ASEGURADO', { paso_4_desea_continuar: 'no_asegurado' }, 4)
  }

  function handleRenunciaIntent() {
    setConfirmModal({
      title:   '¿Está seguro de que desea retirarse?',
      message: `Esta acción retirará su caso de la lista de espera. Si en el futuro desea retomarlo, comuníquese a ${CONTACT_EMAIL}.`,
      onConfirm: () => setConfirmModal(null),
    })
  }

  function handleRenunciaConfirmed(motivo: string) {
    closeWithState('DEPURADO_RENUNCIA', {
      paso_4_desea_continuar: 'no_ya_no_deseo',
      motivo_retiro: motivo,
    }, 4)
  }

  // ── Step 5 ───────────────────────────────────────────────────
  async function handleConditions(flexibilidad: 'si'|'no', condiciones: 'si'|'no', motivoNoAsistir: string|null) {
    setGateError(null)
    const gate = await authorizeStep(token, answers.verification_token ?? '', 5, {
      paso_5a_flexibilidad_centro: flexibilidad,
      paso_5b_condiciones_asistir: condiciones,
    })
    if (!gate.ok) { setGateError(gate.error ?? 'Error al avanzar'); return }
    const answerText = condiciones === 'si'
      ? `Puede asistir · Centro alternativo: ${flexibilidad === 'si' ? 'Sí' : 'No'}`
      : `No puede asistir · Centro alternativo: ${flexibilidad === 'si' ? 'Sí' : 'No'}`
    recordAnswer(5, 'Disponibilidad', answerText)
    setAnswers(a => ({
      ...a,
      paso_5a_flexibilidad_centro: flexibilidad,
      paso_5b_condiciones_asistir: condiciones,
      paso_5b_motivo_no_asistir:   motivoNoAsistir,
    }))
    advanceTo(6)
  }

  // ── Step 6 ───────────────────────────────────────────────────
  async function handleContact(medio: FormAnswers['paso_6_medio_contacto']) {
    setGateError(null)
    setPendingSelection(medio ?? null)
    const gate = await authorizeStep(token, answers.verification_token ?? '', 6, { paso_6_medio_contacto: medio })
    setPendingSelection(null)
    if (!gate.ok) { setGateError(gate.error ?? 'Error al avanzar'); return }
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

  // ── Render: closing ──────────────────────────────────────────
  if (flowStep === 'closing' && closingData) {
    return <ClosingMessage title={closingData.title} message={closingData.message} />
  }

  // ── Render: summary ──────────────────────────────────────────
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
          ¿Necesita ayuda?{' '}
          <span className="font-medium text-ccss-primary dark:text-ccss-accent">{CONTACT_EMAIL}</span>
        </p>
      </div>
    )
  }

  // ── Render: transition (entre paso 4 y 5) ───────────────────
  if (flowStep === 'transition') {
    return (
      <div className="mt-8">
        <ProgressBar currentStep={4} totalSteps={6} canGoBack={false} onBack={() => {}} />
        <AnswersSummary entries={completedAnswers.filter(e => e.step <= 4)} />
        <div className="space-y-6 animate-fade-in">
          <div className="card dark:bg-gray-800 dark:border-gray-700 p-6">
            <p className="text-gray-800 dark:text-gray-100 text-base leading-relaxed">
              Nos alegra saber que desea continuar con su atención.
              A continuación le haremos unas preguntas sobre su disponibilidad para recibir la cita o procedimiento.
            </p>
          </div>
          <button
            onClick={() => advanceTo(5)}
            className="btn-primary w-full"
          >
            Continuar
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-8">
          ¿Necesita ayuda?{' '}
          <span className="font-medium text-ccss-primary dark:text-ccss-accent">{CONTACT_EMAIL}</span>
        </p>
      </div>
    )
  }

  // ── Render: steps 1–6 ────────────────────────────────────────
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
          onContinue={handleContinue}
          onNoAsegurado={handleNoAsegurado}
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

      {gateError && (
        <div role="alert" className="mt-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-300">{gateError}</p>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-8">
        ¿Necesita ayuda?{' '}
        <span className="font-medium text-ccss-primary dark:text-ccss-accent">{CONTACT_EMAIL}</span>
      </p>
    </div>
  )
}
