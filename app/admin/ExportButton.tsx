'use client'

import { useState } from 'react'

export default function ExportButton() {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/export-registros')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const fecha = new Date().toISOString().slice(0, 10)
      a.download = `CCSS_UTLE_registros_${fecha}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Error al exportar. Intente de nuevo.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
        bg-[#004B83] text-white hover:bg-[#003668] disabled:opacity-60
        dark:bg-[#0066aa] dark:hover:bg-[#0055aa] transition-colors"
    >
      {loading ? (
        <>
          <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
          Generando…
        </>
      ) : (
        <>↓ Exportar Excel completo</>
      )}
    </button>
  )
}
