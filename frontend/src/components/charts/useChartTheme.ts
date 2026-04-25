import { useState, useEffect } from 'react'
import { createTheme, type Theme } from '@mui/material/styles'

export function useChartTheme(): Theme {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return createTheme({ palette: { mode: dark ? 'dark' : 'light' } })
}
