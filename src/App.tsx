import { useState, useEffect } from 'react'
import IndustryScan from './pages/IndustryScan'
import UsageGuide from './pages/UsageGuide'
import Settings from './pages/Settings'
import StatusBar from './components/StatusBar'

type Page = 'scan' | 'settings' | 'guide'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('scan')
  const [scanPrefill, setScanPrefill] = useState<string>('')
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'restarting'>('connecting')
  const [firstVisit, setFirstVisit] = useState(false)

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

  const handleTriggerScan = (keyword: string) => {
    setScanPrefill(keyword)
    setCurrentPage('scan')
  }

  const navItems: { key: Page; label: string }[] = [
    { key: 'scan', label: '行业摸底' },
    { key: 'settings', label: '设置' },
    { key: 'guide', label: '使用说明' },
  ]

  return (
    <div className="flex flex-col h-screen">
      <nav className="flex items-center gap-1 px-4 py-2 bg-white border-b border-gray-200 select-none">
        <h1 className="text-lg font-bold mr-6">行业摸底</h1>
        {navItems.map((item) => (
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
        <div style={{ display: currentPage === 'scan' ? 'block' : 'none', height: '100%' }}>
          <IndustryScan prefillKeyword={scanPrefill} />
        </div>
        <div style={{ display: currentPage === 'settings' ? 'block' : 'none', height: '100%' }}>
          <Settings />
        </div>
        <div style={{ display: currentPage === 'guide' ? 'block' : 'none', height: '100%' }}>
          <UsageGuide />
        </div>
      </main>

      <StatusBar status={backendStatus} />

      {firstVisit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-bold mb-3">欢迎使用行业摸底工具</h2>
            <div className="text-sm text-gray-600 space-y-2 mb-5">
              <p>上手只需 <strong>2 步</strong>：</p>
              <p>1. 前往 <strong>设置</strong> 页，填入你的 AI API Key 和搜索引擎 Key</p>
              <p>2. 回到 <strong>行业摸底</strong>，输入你想了解的品类，开始分析</p>
              <p className="text-xs text-gray-400 mt-2">
                推荐使用 <strong>百度千帆 AppBuilder</strong>（免费 1500 次/月）作为搜索引擎，<strong>DeepSeek</strong> 作为 AI 模型。
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
