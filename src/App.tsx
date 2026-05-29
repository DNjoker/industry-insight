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

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('scan')
  const [scanPrefill, setScanPrefill] = useState<string>('')
  const [sellingPrefill, setSellingPrefill] = useState<SellingPrefill | null>(null)
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    window.electronAPI?.onBackendStatus((status: string) => {
      setBackendStatus(status === 'connected' ? 'connected' : 'disconnected')
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
      } catch {
        // Will retry
      }
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

  const handleTriggerSellingPoint = (category: string, reportPath: string) => {
    setSellingPrefill({ category, reportPath })
    setCurrentPage('selling')
  }

  const navItems: { key: Page; label: string; disabled?: boolean }[] = [
    { key: 'scan', label: '行业摸底' },
    { key: 'extract', label: '知识榨取' },
    { key: 'dialog', label: '策略对谈' },
    { key: 'selling', label: '卖点整理' },
    { key: 'competitor', label: '竞品分析' },
    { key: 'chat', label: '对话梳理' },
    { key: 'settings', label: '设置' },
    { key: 'guide', label: '使用说明' },
  ]

  return (
    <div className="flex flex-col h-screen">
      <nav className="flex items-center gap-1 px-4 py-2 bg-white border-b border-gray-200 select-none">
        <h1 className="text-lg font-bold mr-6">信息汇总</h1>
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => !item.disabled && setCurrentPage(item.key)}
            disabled={item.disabled}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              currentPage === item.key
                ? 'bg-blue-600 text-white'
                : item.disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-auto">
        <div style={{ display: currentPage === 'scan' ? 'block' : 'none', height: '100%' }}>
          <IndustryScan prefillKeyword={scanPrefill} onTriggerSellingPoint={handleTriggerSellingPoint} />
        </div>
        <div style={{ display: currentPage === 'extract' ? 'block' : 'none', height: '100%' }}>
          <KnowledgeExtract onTriggerScan={handleTriggerScan} />
        </div>
        <div style={{ display: currentPage === 'settings' ? 'block' : 'none', height: '100%' }}>
          <Settings />
        </div>
        <div style={{ display: currentPage === 'dialog' ? 'block' : 'none', height: '100%' }}>
          <StrategyDialog onTriggerScan={handleTriggerScan} />
        </div>
        <div style={{ display: currentPage === 'chat' ? 'block' : 'none', height: '100%' }}>
          <ChatImport />
        </div>
        <div style={{ display: currentPage === 'selling' ? 'block' : 'none', height: '100%' }}>
          <SellingPoint prefill={sellingPrefill} />
        </div>
        <div style={{ display: currentPage === 'competitor' ? 'block' : 'none', height: '100%' }}>
          <CompetitorAnalysis />
        </div>
        <div style={{ display: currentPage === 'guide' ? 'block' : 'none', height: '100%' }}>
          <UsageGuide />
        </div>
      </main>

      <StatusBar status={backendStatus} />
    </div>
  )
}

export default App
