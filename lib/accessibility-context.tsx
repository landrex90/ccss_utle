'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme     = 'light' | 'dark'
type Contrast  = 'normal' | 'high'
type FontSize  = 'normal' | 'large' | 'xlarge'

interface A11yContextType {
  theme:          Theme
  contrast:       Contrast
  fontSize:       FontSize
  toggleTheme:    () => void
  toggleContrast: () => void
  cycleFontSize:  () => void
}

const A11yContext = createContext<A11yContextType>({
  theme: 'light', contrast: 'normal', fontSize: 'normal',
  toggleTheme: () => {}, toggleContrast: () => {}, cycleFontSize: () => {},
})

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const [theme,    setTheme]    = useState<Theme>('light')
  const [contrast, setContrast] = useState<Contrast>('normal')
  const [fontSize, setFontSize] = useState<FontSize>('normal')
  const [mounted,  setMounted]  = useState(false)

  useEffect(() => {
    const raw_t = localStorage.getItem('utle-theme')
    const raw_c = localStorage.getItem('utle-contrast')
    const raw_f = localStorage.getItem('utle-font')
    const t: Theme    = raw_t === 'dark' ? 'dark' : 'light'
    const c: Contrast = raw_c === 'high' ? 'high' : 'normal'
    const f: FontSize = raw_f === 'large' ? 'large' : raw_f === 'xlarge' ? 'xlarge' : 'normal'
    setTheme(t); setContrast(c); setFontSize(f)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const html = document.documentElement
    html.classList.toggle('dark',          theme    === 'dark')
    html.classList.toggle('high-contrast', contrast === 'high')
    html.setAttribute('data-font-size', fontSize)
    localStorage.setItem('utle-theme',    theme)
    localStorage.setItem('utle-contrast', contrast)
    localStorage.setItem('utle-font',     fontSize)
  }, [theme, contrast, fontSize, mounted])

  const toggleTheme    = () => setTheme(t    => t === 'light' ? 'dark' : 'light')
  const toggleContrast = () => setContrast(c => c === 'normal' ? 'high' : 'normal')
  const cycleFontSize  = () => setFontSize(f => f === 'normal' ? 'large' : f === 'large' ? 'xlarge' : 'normal')

  return (
    <A11yContext.Provider value={{ theme, contrast, fontSize, toggleTheme, toggleContrast, cycleFontSize }}>
      {children}
    </A11yContext.Provider>
  )
}

export function useA11y() { return useContext(A11yContext) }
