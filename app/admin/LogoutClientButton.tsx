'use client'

import { useRouter } from 'next/navigation'

export default function LogoutClientButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="px-3 py-1.5 rounded hover:bg-[#004268] transition-colors text-sm text-blue-200 hover:text-white"
    >
      Salir
    </button>
  )
}
