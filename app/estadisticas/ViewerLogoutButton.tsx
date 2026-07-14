'use client'

import { useRouter } from 'next/navigation'

export default function ViewerLogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/estadisticas/auth', { method: 'DELETE' })
    window.location.href = '/estadisticas/login'
  }

  return (
    <button
      onClick={handleLogout}
      className="px-3 py-1.5 rounded text-sm text-blue-200 hover:bg-[#003668] hover:text-white transition-colors"
    >
      Cerrar sesión
    </button>
  )
}
