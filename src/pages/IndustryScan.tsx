import { useState, useEffect, useRef } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'
import ProgressStepper from '../components/ProgressStepper'

interface ProgressEvent {
  step: string
  progress: number
  message: string
  report_path?: string
  source_count?: number
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

  useEffect(() => {
    if (prefillKeyword) setIndustry(prefillKeyword)
  }, [prefillKeyword])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent[]>([])
  const [reportPath, setReportPath] = useState<string | null>(null)

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
    setProgress([])
    setReportPath(null)
    setShowSuggestions(false)
    setSuggestions([])
    loadTrending()
    loadRecentSearches()
  }

  const handleScan = async (keyword?: string) => {
    const query = keyword || industry
    if (!query.trim() || scanning) return

    setIndustry(query)
    setShowSuggestions(false)
    setScanning(true)
    setProgress([])
    setReportPath(null)
    saveRecentSearch(query.trim())

    try {
      const baseUrl = await getBaseUrl()
      const response = await fetch(`${baseUrl}/api/scan/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: query.trim(), time_range: timeRange }),
      })

      const reader = response.body?.getReader()
      if (!reader) return

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
              const data = JSON.parse(line.slice(6)) as ProgressEvent
              setProgress((prev) => [...prev, data])
              if (data.step === 'done' && data.report_path) {
                setReportPath(data.report_path)
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      console.error('Scan failed:', err)
    } finally {
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

      {/* Search input with autocomplete */}
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
            placeholder="输入行业名称，如：直播电商、宠物经济..."
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
        <button
          onClick={() => handleScan()}
          disabled={!industry.trim() || scanning}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {scanning ? '分析中...' : '开始分析'}
        </button>
      </div>

      {/* Time range selector */}
      <div className="flex items-center gap-2 mb-6">
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

      {/* Recent searches */}
      {recentSearches.length > 0 && !currentProgress && !reportPath && (
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
      {!currentProgress && !industry && !reportPath && (
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
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onTriggerSellingPoint && (
                <button
                  onClick={() => onTriggerSellingPoint(industry, reportPath)}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm whitespace-nowrap"
                >
                  提炼卖点
                </button>
              )}
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
