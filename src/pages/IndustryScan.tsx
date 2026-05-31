import { useState, useEffect, useRef } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'
import ProgressStepper from '../components/ProgressStepper'

interface ProgressEvent {
  step: string
  progress: number
  message: string
  report_path?: string
  source_count?: number
  token_usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  estimated_cost?: string
}

interface Suggestion {
  name: string
  description: string
}

interface TrendingItem {
  name: string
  reason: string
}

interface Props {
  prefillKeyword?: string
  onTriggerSellingPoint?: (category: string, reportPath: string) => void
}

export default function IndustryScan({ prefillKeyword, onTriggerSellingPoint }: Props) {
  const [industry, setIndustry] = useState(prefillKeyword || '')
  const [timeRange, setTimeRange] = useState('month')
  const [role, setRole] = useState('general')

  useEffect(() => {
    if (prefillKeyword) setIndustry(prefillKeyword)
  }, [prefillKeyword])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent[]>([])
  const [reportPath, setReportPath] = useState<string | null>(null)
  const [tokenUsage, setTokenUsage] = useState<ProgressEvent['token_usage']>(undefined)
  const [estimatedCost, setEstimatedCost] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Abort controller for SSE connection
  const abortRef = useRef<AbortController | null>(null)
  // Track last event time for SSE timeout detection
  const lastEventTimeRef = useRef<number>(0)
  const sseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SSE_TIMEOUT_MS = 60000 // 60 seconds with no event = connection lost

  // Autocomplete
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Trending
  const [trending, setTrending] = useState<TrendingItem[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  useEffect(() => {
    loadTrending()
    loadRecentSearches()
  }, [])

  const loadTrending = async () => {
    try {
      const baseUrl = await getBaseUrl()
      const res = await fetch(`${baseUrl}/api/trending`)
      if (res.ok) {
        const data = await res.json()
        setTrending(data.industries || [])
      }
    } catch { /* backend not ready */ }
  }

  const loadRecentSearches = () => {
    try {
      const stored = localStorage.getItem('recent-searches')
      if (stored) {
        setRecentSearches(JSON.parse(stored).slice(0, 6))
      }
    } catch { /* ignore */ }
  }

  const saveRecentSearch = (name: string) => {
    const stored = localStorage.getItem('recent-searches')
    const list: string[] = stored ? JSON.parse(stored) : []
    const updated = [name, ...list.filter((s) => s !== name)].slice(0, 10)
    localStorage.setItem('recent-searches', JSON.stringify(updated))
    setRecentSearches(updated.slice(0, 6))
  }

  const fetchSuggestions = async (keyword: string) => {
    if (!keyword || keyword.length < 1) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    setLoadingSuggestions(true)
    try {
      const baseUrl = await getBaseUrl()
      const res = await fetch(`${baseUrl}/api/autocomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword }),
      })
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions || [])
        setShowSuggestions((data.suggestions || []).length > 0)
      }
    } catch {
      setSuggestions([])
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const handleInputChange = (value: string) => {
    setIndustry(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 400)
  }

  const handleSelectSuggestion = (name: string) => {
    setIndustry(name)
    setShowSuggestions(false)
  }

  const handleReset = () => {
    setIndustry('')
    setTimeRange('month')
    setRole('general')
    setProgress([])
    setReportPath(null)
    setError(null)
    setTokenUsage(undefined)
    setEstimatedCost(null)
    setShowSuggestions(false)
    setSuggestions([])
    loadTrending()
    loadRecentSearches()
  }

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (sseTimeoutRef.current) {
      clearTimeout(sseTimeoutRef.current)
      sseTimeoutRef.current = null
    }
    setScanning(false)
    setError('已取消')
  }

  const clearSSETimeout = () => {
    if (sseTimeoutRef.current) {
      clearTimeout(sseTimeoutRef.current)
      sseTimeoutRef.current = null
    }
  }

  const resetSSETimeout = () => {
    clearSSETimeout()
    sseTimeoutRef.current = setTimeout(() => {
      // No events for SSE_TIMEOUT_MS — likely connection lost
      if (abortRef.current && !abortRef.current.signal.aborted) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setScanning(false)
      setError('连接超时，后端可能已断开。请检查后端是否正常运行，然后重试。')
    }, SSE_TIMEOUT_MS)
  }

  const handleScan = async (keyword?: string) => {
    const query = keyword || industry
    if (!query.trim() || scanning) return

    setIndustry(query)
    setShowSuggestions(false)
    setScanning(true)
    setProgress([])
    setReportPath(null)
    setError(null)
    setTokenUsage(undefined)
    setEstimatedCost(null)
    saveRecentSearch(query.trim())

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const baseUrl = await getBaseUrl()
      const response = await fetch(`${baseUrl}/api/scan/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: query.trim(), time_range: timeRange, role }),
        signal: controller.signal,
      })

      const reader = response.body?.getReader()
      if (!reader) {
        setError('无法连接到后端服务')
        setScanning(false)
        return
      }

      lastEventTimeRef.current = Date.now()
      resetSSETimeout()

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        lastEventTimeRef.current = Date.now()
        resetSSETimeout()

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as ProgressEvent
              setProgress((prev) => [...prev, data])
              if (data.token_usage) {
                setTokenUsage(data.token_usage)
                setEstimatedCost(data.estimated_cost || null)
              }
              if (data.step === 'done' && data.report_path) {
                setReportPath(data.report_path)
              }
              if (data.step === 'error') {
                setError(data.message)
              }
            } catch { /* ignore malformed JSON */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled, error already set in handleCancel
      } else {
        console.error('Scan failed:', err)
        const msg = err.message || '未知错误'
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          setError('无法连接后端服务。请确认后端已启动，然后刷新页面重试。')
        } else {
          setError(`扫描失败: ${msg}`)
        }
      }
    } finally {
      clearSSETimeout()
      abortRef.current = null
      setScanning(false)
    }
  }

  const currentProgress = progress.length > 0 ? progress[progress.length - 1] : null

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">行业摸底</h2>
        <p className="text-gray-500">输入行业名称，自动搜索并生成结构化分析报告</p>
      </div>

      {/* Search input with autocomplete — hidden when report is done */}
      {!reportPath && (
        <>
      <div className="relative flex gap-3 mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={industry}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleScan()
              if (e.key === 'Escape') setShowSuggestions(false)
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="输入行业名称，如：宠物免洗手套、新能源汽车..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={scanning}
          />
          {loadingSuggestions && (
            <span className="absolute right-3 top-3 text-gray-400 text-sm">...</span>
          )}

          {/* Autocomplete dropdown */}
          {showSuggestions && !scanning && (
            <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelectSuggestion(s.name)
                  }}
                >
                  <span className="font-medium text-gray-800 whitespace-nowrap">{s.name}</span>
                  <span className="text-xs text-gray-400 truncate">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {scanning && (
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors whitespace-nowrap text-sm"
            >
              取消
            </button>
          )}
          <button
            onClick={() => handleScan()}
            disabled={!industry.trim() || scanning}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {scanning ? '分析中...' : '开始分析'}
          </button>
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-500">时效范围:</span>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[
            { value: 'week', label: '近一周' },
            { value: 'month', label: '近一月' },
            { value: 'half_year', label: '近半年' },
            { value: 'all', label: '不限' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              disabled={scanning}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                timeRange === opt.value
                  ? 'bg-white text-blue-600 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Role selector */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-gray-500">报告视角:</span>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 flex-wrap">
          {[
            { value: 'general', label: '不限' },
            { value: 'factory', label: '厂家' },
            { value: 'brand', label: '品牌方' },
            { value: 'dealer', label: '经销商' },
            { value: 'investor', label: '投资人' },
            { value: 'government', label: '政府' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRole(opt.value)}
              disabled={scanning}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                role === opt.value
                  ? 'bg-white text-emerald-600 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

        </>
      )}

      {/* Error display */}
      {error && !scanning && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
          <button
            onClick={handleReset}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            清除错误，重新开始
          </button>
        </div>
      )}

      {/* Recent searches */}
      {recentSearches.length > 0 && !currentProgress && !reportPath && !error && (
        <div className="mb-6">
          <p className="text-xs text-gray-400 mb-2">最近搜索</p>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((s, i) => (
              <button
                key={i}
                onClick={() => handleScan(s)}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trending industries */}
      {!currentProgress && !industry && !reportPath && !error && (
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">猜你喜欢 · 热门行业</p>
          <div className="grid grid-cols-2 gap-3">
            {trending.map((item, i) => (
              <button
                key={i}
                onClick={() => handleScan(item.name)}
                className="text-left p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <span className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors">
                  {item.name}
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">{item.reason}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {currentProgress && (
        <ProgressStepper progress={currentProgress} events={progress} />
      )}

      {/* Done */}
      {reportPath && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-green-800 font-medium">报告已保存到 Obsidian</p>
              <code className="text-sm text-green-700 break-all">{reportPath}</code>
              {tokenUsage && (
                <div className="flex items-center gap-3 mt-2">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                    <span className="font-medium">{tokenUsage.total_tokens.toLocaleString()}</span> token
                  </span>
                  <span className="text-xs text-green-600">
                    提示 {tokenUsage.prompt_tokens.toLocaleString()} + 生成 {tokenUsage.completion_tokens.toLocaleString()}
                  </span>
                  {estimatedCost && (
                    <span className="inline-flex items-center gap-1 text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">
                      {estimatedCost}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
              >
                搜索新行业
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
