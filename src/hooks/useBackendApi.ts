import { useEffect, useState } from 'react'

let cachedBaseUrl: string | null = null

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl
  if (window.electronAPI) {
    cachedBaseUrl = await window.electronAPI.getBackendUrl()
  } else {
    cachedBaseUrl = 'http://127.0.0.1:19877'
  }
  return cachedBaseUrl
}

export function useBackendStatus() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const baseUrl = await getBaseUrl()
        const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) })
        if (!cancelled) {
          setStatus(res.ok ? 'connected' : 'disconnected')
        }
      } catch {
        if (!cancelled) setStatus('connecting')
      }
    }

    check()
    const interval = setInterval(check, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return status
}
