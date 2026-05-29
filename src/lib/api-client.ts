import { getBaseUrl } from '../hooks/useBackendApi'

export interface ScanProgress {
  step: string
  progress: number
  message: string
  report_path?: string
  source_count?: number
}

export async function* scanIndustry(industry: string): AsyncGenerator<ScanProgress> {
  const baseUrl = await getBaseUrl()
  const response = await fetch(`${baseUrl}/api/scan/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ industry }),
  })

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6)) as ScanProgress
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl()
    const res = await fetch(`${baseUrl}/api/health`)
    return res.ok
  } catch {
    return false
  }
}

export async function validateVault(): Promise<{ valid: boolean; vault_path?: string }> {
  const baseUrl = await getBaseUrl()
  const res = await fetch(`${baseUrl}/api/obsidian/validate`)
  if (!res.ok) throw new Error('Failed to validate vault')
  return res.json()
}
