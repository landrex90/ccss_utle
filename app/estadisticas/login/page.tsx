'use client'

import { useState, FormEvent } from 'react'
import Image from 'next/image'

export default function ViewerLoginPage() {
  const [username, setUsername] = useState('')
  const [cedula, setCedula]     = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/estadisticas/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase(), cedula: cedula.trim() }),
      })

      if (res.ok) {
        window.location.href = '/estadisticas'
      } else {
        const data = await res.json()
        setError(data.error ?? 'Error al iniciar sesión')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md w-full max-w-sm p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col items-center mb-7">
          <Image
            src="/logos/ccss-logo.jpg"
            alt="CCSS Logo"
            width={64}
            height={64}
            className="mb-3 rounded-full"
          />
          <h1 className="text-lg font-semibold text-[#004B83] dark:text-[#4d9fd6]">Resultados CLEO</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">CCSS — Unidad Técnica de Listas de Espera</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Usuario
            </label>
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-[#004B83] dark:focus-within:ring-[#4d9fd6]">
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
                placeholder="jcchacov"
              />
              <span className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700 border-l border-gray-300 dark:border-gray-600 select-none">
                @ccss.sa.cr
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="cedula" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Cédula
            </label>
            <input
              id="cedula"
              type="password"
              inputMode="numeric"
              value={cedula}
              onChange={e => setCedula(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-[#004B83] dark:focus:ring-[#4d9fd6] focus:border-transparent"
              placeholder="Número de cédula"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#004B83] hover:bg-[#003668] text-white font-medium py-2 px-4 rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
