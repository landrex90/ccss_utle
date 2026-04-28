'use client'

import { useState } from 'react'

interface Props {
  idRegistro: string
  onSuccess: (intentos: number) => void
  onFailed: (intentos: number) => void
}

const MAX_ATTEMPTS = 3

export default function Step2Identity({ idRegistro, onSuccess, onFailed }: Props) {
  const [digits, setDigits] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (digits.length !== 4 || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/validate-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_registro: idRegistro, digits }),
      })

      const data = await res.json()
      const newAttempt = attempt + 1
      setAttempt(newAttempt)

      if (data.valid) {
        onSuccess(newAttempt)
        return
      }

      if (data.locked || newAttempt >= MAX_ATTEMPTS) {
        onFailed(newAttempt)
        return
      }

      const remaining = MAX_ATTEMPTS - newAttempt
      setError(
        `El valor indicado es incorrecto. Por favor vuelva a intentarlo. Intento ${newAttempt} de ${MAX_ATTEMPTS}. Le quedan ${remaining} intento${remaining !== 1 ? 's' : ''}.`
      )
      setDigits('')
    } catch {
      setError('Ocurrió un error de conexión. Por favor intente nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <p className="text-gray-800 text-base leading-relaxed">
          Para continuar, por favor digite los <strong>últimos 4 dígitos</strong> de su número de asegurado.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Ejemplo: si su número es 1-2345-6789, digite <strong>6789</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="digits" className="block text-sm font-medium text-gray-700 mb-2">
            Últimos 4 dígitos del número de asegurado
          </label>
          <input
            id="digits"
            type="tel"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            autoComplete="off"
            disabled={loading}
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-2xl font-mono text-center tracking-widest
                       focus:outline-none focus:border-ccss-primary focus:ring-2 focus:ring-ccss-primary focus:ring-offset-2
                       disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={digits.length !== 4 || loading}
          className="w-full bg-ccss-primary text-white font-semibold py-4 rounded-xl
                     hover:bg-ccss-dark focus:outline-none focus:ring-2 focus:ring-ccss-primary focus:ring-offset-2
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-150 text-base"
        >
          {loading ? 'Verificando...' : 'Verificar'}
        </button>
      </form>
    </div>
  )
}
