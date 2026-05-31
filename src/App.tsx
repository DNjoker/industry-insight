import { useState, useEffect } from 'react'
import IndustryScan from './pages/IndustryScan'
import KnowledgeExtract from './pages/KnowledgeExtract'
import StrategyDialog from './pages/StrategyDialog'
import ChatImport from './pages/ChatImport'
import SellingPoint from './pages/SellingPoint'
import CompetitorAnalysis from './pages/CompetitorAnalysis'
import UsageGuide from './pages/UsageGuide'
import Settings from './pages/Settings'
import StatusBar from './components/StatusBar'

type Page = 'scan' | 'extract' | 'dialog' | 'chat' | 'selling' | 'competitor' | 'settings' | 'guide'

export interface SellingPrefill {
  category: string
  reportPath: string
}

// V1 visible pages — always mounted to preserve state when switching tabs
const PERSISTED_PAGES: Page[] = ['scan', 'settings', 'guide']

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('scan')
  const [scanPrefill, setScanPrefill] = useState<string>('')
  const [sellingPrefill, setSellingPrefill] = useState<SellingPrefill | null>(null)
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'restarting'>('connecting')
  const [firstVisit, setFirstVisit] = useState(false)
  // Track which hidden pages have been visited (lazy mount)
  const [mountedHiddenPages, setMountedHiddenPages] = useState<Set<Page>>(new Set())

  useEffect(() => {
    const visited = localStorage.getItem('app-visited')
    if (!visited) {
      setFirstVisit(true)
      localStorage.setItem('app-visited', '1')
    }

    window.electronAPI?.onBackendStatus((status: string) => {
      if (status === 'error') {
        setBackendStatus('disconnected')
      } else if (status === 'restarting') {
        setBackendStatus('connecting')
      } else {
        setBackendStatus(status as 'connected' | 'disconnected')
      }
    })

    const checkBackend = async () => {
      try {
        const url = await window.electronAPI?.getBackendUrl()
        if (url) {
          const res = await fetch(`${url}/api/health`)
          if (res.ok) {
            setBackendStatus('connected')
            return
          }
        }
      } catch { /* retry */ }
      setBackendStatus('connecting')
    }

    checkBackend()
    const interval = setInterval(checkBackend, 5000)
    return () => clearInterval(interval)
  }, [])

  // Lazy-mount hidden pages on first visit
  useEffect(() => {
    if (!PERSISTED_PAGES.includes(currentPage)) {
      setMountedHiddenPages(prev => new Set(prev).add(currentPage))
    }
  }, [currentPage])

  const handleTriggerScan = (keyword: string) => {
    setScanPrefill(keyword)
    setCurrentPage('scan')
  }

  const handleTriggerSellingPoint = (category: string, reportPath: string) => {
    setSellingPrefill({ category, reportPath })
    setCurrentPage('selling')
  }

  const navItems: { key: Page; label: string; hidden?: boolean }[] = [
    { key: 'scan', label: '行业摸底' },
    { key: 'settings', label: '设置' },
    { key: 'guide', label: '使用说明' },
    { key: 'selling', label: '卖点整理', hidden: true },
    { key: 'competitor', label: '竞品分析', hidden: true },
    { key: 'extract', label: '知识榨取', hidden: true },
    { key: 'dialog', label: '策略对谈', hidden: true },
    { key: 'chat', label: '对话梳理', hidden: true },
  ]

  const pageProps = {
    scanPrefill,
    sellingPrefill,
    onTriggerScan: handleTriggerScan,
    onTriggerSellingPoint: handleTriggerSellingPoint,
  }

  return (
    <div className="flex flex-col h-screen">
      <nav className="flex items-center gap-1 px-4 py-2 bg-white border-b border-gray-200 select-none">
        <h1 className="text-lg font-bold mr-6">信息汇总</h1>
        {navItems.filter(item => !item.hidden).map((item) => (
          <button
            key={item.key}
            onClick={() => setCurrentPage(item.key)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              currentPage === item.key
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-auto">
        {/* Persisted pages — always mounted, show/hide via display */}
        <div style={{ display: currentPage === 'scan' ? 'block' : 'none', height: '100%' }}>
          <IndustryScan prefillKeyword={scanPrefill} onTriggerSellingPoint={handleTriggerSellingPoint} />
        </div>
        <div style={{ display: currentPage === 'settings' ? 'block' : 'none', height: '100%' }}>
          <Settings />
        </div>
        <div style={{ display: currentPage === 'guide' ? 'block' : 'none', height: '100%' }}>
          <UsageGuide />
        </div>

        {/* Hidden pages — lazy mounted, then kept alive */}
        {mountedHiddenPages.has('extract') && (
          <div style={{ display: currentPage === 'extract' ? 'block' : 'none', height: '100%' }}>
            <KnowledgeExtract onTriggerScan={handleTriggerScan} />
          </div>
        )}
        {mountedHiddenPages.has('dialog') && (
          <div style={{ display: currentPage === 'dialog' ? 'block' : 'none', height: '100%' }}>
            <StrategyDialog onTriggerScan={handleTriggerScan} />
          </div>
        )}
        {mountedHiddenPages.has('chat') && (
          <div style={{ display: currentPage === 'chat' ? 'block' : 'none', height: '100%' }}>
            <ChatImport />
          </div>
        )}
        {mountedHiddenPages.has('selling') && (
          <div style={{ display: currentPage === 'selling' ? 'block' : 'none', height: '100%' }}>
            <SellingPoint prefill={sellingPrefill} />
          </div>
        )}
        {mountedHiddenPages.has('competitor') && (
          <div style={{ display: currentPage === 'competitor' ? 'block' : 'none', height: '100%' }}>
            <CompetitorAnalysis />
          </div>
        )}
      </main>

      <StatusBar status={backendStatus} />

      {/* First visit guidance */}
      {firstVisit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-bold mb-3">欢迎使用信息汇总桌面工具</h2>
            <div className="text-sm text-gray-600 space-y-2 mb-5">
              <p>上手只需 <strong>2 步</strong>：</p>
              <p>1. 前往 <strong>设置</strong> 页，填入你的 AI API Key 和搜索引擎 Key</p>
              <p>2. 回到 <strong>行业摸底</strong>，输入你想了解的品类，开始分析</p>
              <p className="text-xs text-gray-400 mt-2">
                推荐注册 <strong>Tavily</strong>（免费 1000 次/月）作为搜索引擎，<strong>DeepSeek</strong> 作为 AI 模型。
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setFirstVisit(false)
                  setCurrentPage('settings')
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                前往设置
              </button>
              <button
                onClick={() => setFirstVisit(false)}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                稍后再说
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
