'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/admin')
        router.refresh()
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
    <div className="flex items-center justify-center py-8 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-sm p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/logos/ccss-logo.png"
            alt="CCSS Logo"
            width={64}
            height={64}
            className="mb-3"
          />
          <h1 className="text-xl font-semibold text-[#005d8f] dark:text-[#0080c0]">Panel COCO Tech</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">CCSS UTLE — Acceso interno</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-[#005d8f] dark:focus:ring-[#0080c0] focus:border-transparent"
              placeholder="Ingrese la contraseña"
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
            className="w-full bg-[#005d8f] hover:bg-[#004268] text-white font-medium py-2 px-4 rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
