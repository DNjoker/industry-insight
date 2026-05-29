import { useState } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'
import CardPreview, { KnowledgeCard } from '../components/CardPreview'
import ProgressStepper from '../components/ProgressStepper'

interface ParsedItem {
  index: number
  raw: string
  item_type: string
}

interface ProgressEvent {
  step: string
  progress: number
  message: string
  cards?: KnowledgeCard[]
  paths?: string[]
  saved_count?: number
}

interface Props {
  onTriggerScan?: (keyword: string) => void
}

export default function KnowledgeExtract({ onTriggerScan }: Props) {
  const [inputText, setInputText] = useState('')
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [cards, setCards] = useState<KnowledgeCard[]>([])
  const [progress, setProgress] = useState<ProgressEvent[]>([])
  const [extracting, setExtracting] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedDir, setSavedDir] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentProgress = progress.length > 0 ? progress[progress.length - 1] : null
  const isDone = progress.some((e) => e.step === 'done')
  const isReviewing = cards.length > 0 && !extracting && !saved
  const noResults = isDone && cards.length === 0 && !extracting && !saved

  const handleParse = async () => {
    if (!inputText.trim()) return
    setSaved(false)
    setCards([])
    setProgress([])
    setError(null)
    setParsing(true)
    try {
      const baseUrl = await getBaseUrl()
      const res = await fetch(`${baseUrl}/api/extract/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      })
      if (res.ok) {
        const data = await res.json()
        setParsedItems(data.items || [])
        if (!data.items || data.items.length === 0) {
          setError('未识别到有效链接或内容，请检查粘贴格式（一行一条）')
        }
      } else {
        const errData = await res.json().catch(() => ({ detail: '请求失败' }))
        setError(errData.detail || '解析失败，请检查后端是否启动')
      }
    } catch (err) {
      setError('无法连接后端，请确认后端已启动 (npm run dev)')
      console.error('Parse failed:', err)
    } finally {
      setParsing(false)
    }
  }

  const handleExtract = async () => {
    if (extracting) return
    setExtracting(true)
    setProgress([])
    setCards([])
    setSaved(false)
    setError(null)

    try {
      const baseUrl = await getBaseUrl()
      const response = await fetch(`${baseUrl}/api/extract/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, items: parsedItems }),
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
              console.log('[Extract SSE]', data.step, data.progress, data.message)
              setProgress((prev) => [...prev, data])
              if (data.step === 'done') {
                if (data.cards !== undefined) {
                  setCards(data.cards)
                  console.log('[Extract SSE] Got cards:', data.cards.length)
                }
              }
              if (data.step === 'error') {
                setError(data.message)
                console.error('Extract error:', data.message)
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      console.error('Extract failed:', err)
    } finally {
      setExtracting(false)
    }
  }

  const handleUpdateCard = (index: number, updated: KnowledgeCard) => {
    setCards((prev) => prev.map((c) => (c.index === index ? updated : c)))
  }

  const handleDeleteCard = (index: number) => {
    setCards((prev) => prev.filter((c) => c.index !== index))
  }

  const handleSave = async () => {
    if (cards.length === 0) return
    setError(null)
    try {
      const baseUrl = await getBaseUrl()
      const res = await fetch(`${baseUrl}/api/extract/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards }),
      })
      const data = await res.json()
      if (res.ok && data.saved_count > 0) {
        setSaved(true)
        setSavedDir(data.saved_dir || null)
        setParsedItems([])
        setProgress((prev) => [
          ...prev,
          { step: 'saved', progress: 100, message: `已保存 ${data.saved_count} 张卡片到 Obsidian` },
        ])
      } else {
        setError(data.error || `保存失败: 0 张卡片被保存，请检查 Vault 路径配置`)
      }
    } catch (err) {
      setError('保存请求失败，请确认后端已启动')
      console.error('Save failed:', err)
    }
  }

  const handleReset = () => {
    setInputText('')
    setParsedItems([])
    setCards([])
    setProgress([])
    setSaved(false)
    setSavedDir(null)
    setError(null)
  }

  const countByType = (type: string) => parsedItems.filter((i) => i.item_type === type).length
  const typeLabel = (type: string) => {
    switch (type) {
      case 'web_url': return '网页链接'
      case 'text': return '文字笔记'
      default: return '未识别'
    }
  }
  const typeIcon = (type: string) => {
    switch (type) {
      case 'web_url': return '📄'
      case 'text': return '📝'
      default: return '❓'
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">知识榨取</h2>
        <p className="text-gray-500">批量粘贴文章链接或文字笔记，AI 自动提炼可复用的操作技巧</p>
      </div>

      {/* Input area */}
      {!isReviewing && (
        <>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`粘贴内容，一行一条（支持 URL | 备注 格式）：\nhttps://mp.weixin.qq.com/s/xxx | 文章备注\nhttps://www.zhihu.com/question/xxx | 知乎备注\n我的文字笔记...`}
            rows={8}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y mb-4 text-sm"
            disabled={extracting}
          />

          <div className="flex gap-3 mb-6">
            <button
              onClick={handleParse}
              disabled={!inputText.trim() || extracting || parsing}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 transition-colors text-sm"
            >
              {parsing ? '解析中...' : '解析输入'}
            </button>
            {parsedItems.length > 0 && (
              <button
                onClick={handleExtract}
                disabled={extracting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {extracting ? '榨取中...' : '开始榨取'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Error display */}
      {error && !extracting && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* No results after extraction */}
      {noResults && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 font-medium">未提取到知识卡片</p>
          <p className="text-sm text-yellow-600 mt-1">
            AI 未能从这些内容中提取出结构化知识。建议：
            在链接后面补充你自己的备注和要点，或尝试粘贴内容更丰富的链接。
          </p>
          <button onClick={handleReset} className="mt-2 text-sm text-blue-600 hover:underline">返回重试</button>
        </div>
      )}

      {/* Parsed preview */}
      {parsedItems.length > 0 && !extracting && !isReviewing && !saved && !noResults && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-2">
            识别到 {parsedItems.length} 条输入：
          </p>
          <div className="flex flex-wrap gap-2 mb-1">
            {['web_url', 'text', 'unknown'].map((type) => {
              const count = countByType(type)
              if (count === 0) return null
              return (
                <span key={type} className="text-xs px-2 py-1 bg-white rounded-full border border-gray-200">
                  {typeIcon(type)} {typeLabel(type)} × {count}
                </span>
              )
            })}
          </div>
          <div className="mt-3 max-h-40 overflow-y-auto">
            {parsedItems.map((item) => (
              <div key={item.index} className="text-xs text-gray-500 py-1 border-b border-gray-100 last:border-0 truncate">
                <span className="mr-2">{typeIcon(item.item_type)}</span>
                {item.raw}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {currentProgress && extracting && (
        <ProgressStepper progress={currentProgress} events={progress} />
      )}

      {/* Review cards */}
      {isReviewing && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            已生成 {cards.length} 张知识卡片，请审核后入库存或修改
          </p>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {cards.map((card) => (
              <CardPreview
                key={card.index}
                card={card}
                onUpdate={(updated) => handleUpdateCard(card.index, updated)}
                onDelete={() => handleDeleteCard(card.index)}
                onScan={onTriggerScan}
              />
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              确认入库 ({cards.length} 张)
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              放弃重来
            </button>
          </div>
        </div>
      )}

      {/* Saved */}
      {saved && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-800 font-medium">卡片已保存到 Obsidian</p>
              <p className="text-sm text-green-600 mt-1">
                {savedDir ? `目录: ${savedDir}` : '可在 Obsidian 知识卡片目录下查看'}
              </p>
            </div>
            <div className="flex gap-2">
              {savedDir && (
                <button
                  onClick={() => window.electronAPI.openFolder(savedDir)}
                  className="px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm"
                >
                  打开文件夹
                </button>
              )}
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                再来一批
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
