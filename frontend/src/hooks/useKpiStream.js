import { useState, useEffect, useRef } from 'react'
import api from '../services/api'

const BASE = import.meta.env.VITE_API_URL || ''

export function useKpiStream() {
  const [kpis, setKpis]     = useState(null)
  const [online, setOnline] = useState(false)
  const esRef               = useRef(null)
  const timerRef            = useRef(null)

  const startPolling = () => {
    if (timerRef.current) return
    timerRef.current = setInterval(async () => {
      try {
        const r = await api.get('/kpis')
        setKpis(r.data)
      } catch {/* silencioso, mantém dado anterior */}
    }, 20000)
  }

  const stopPolling = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  useEffect(() => {
    // Primeira carga REST imediata
    api.get('/kpis').then(r => setKpis(r.data)).catch(() => {})

    let active = true
    const ctrl = new AbortController()

    const connectSSE = async () => {
      try {
        const resp = await fetch(`${BASE}/api/kpis/stream`, {
          credentials: 'include',
          signal: ctrl.signal,
          headers: { Accept: 'text/event-stream' }
        })

        // 401/403 = token expirado ou sem permissão
        // Não reconecta — o polling REST vai continuar e o interceptor
        // do axios já redireciona para login quando necessário.
        if (resp.status === 401 || resp.status === 403) {
          setOnline(false)
          startPolling()
          return // para a reconexão SSE definitivamente nesta sessão
        }

        if (!resp.ok || !resp.body) throw new Error('SSE indisponível')

        setOnline(true)
        stopPolling()

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (active) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6))
                setKpis(parsed)
              } catch {/* linha incompleta */}
            }
          }
        }
      } catch (err) {
        if (!active) return
        // Erro de rede / servidor reiniciando — cai para polling e tenta SSE em 30s
        setOnline(false)
        startPolling()
        setTimeout(() => { if (active) connectSSE() }, 30000)
      }
    }

    connectSSE()

    return () => {
      active = false
      ctrl.abort()
      stopPolling()
    }
  }, [])

  return { kpis, online }
}
