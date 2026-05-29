import { useState, useRef, useEffect, Component, ReactNode } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'
import MarkdownRenderer from '../components/MarkdownRenderer'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface WebSource {
  title: string
  url: string
  snippet: string
}

// Error boundary to prevent markdown render crashes from breaking the whole chat
class SafeMarkdown extends Component<{ content: string }, { error: boolean }> {
  constructor(props: { content: string }) {
    super(props)
    this.state = { error: false }
  }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render(): ReactNode {
    if (this.state.error) {
      return <p className="text-sm whitespace-pre-wrap text-gray-700">{this.props.content}</p>
    }
    return <MarkdownRenderer content={this.props.content} />
  }
}

export default function StrategyDialog({ onTriggerScan }: { onTriggerScan: (keyword: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [enableWeb, setEnableWeb] = useState(true)
  const [enableKB, setEnableKB] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [mode, setMode] = useState<'chat' | 'detailed' | 'casual'>('chat')
  const [collectionName, setCollectionName] = useState('source_articles_v2')
  const [collections, setCollections] = useState<string[]>([])
  const [webSources, setWebSources] = useState<WebSource[]>([])
  const [hasKnowledge, setHasKnowledge] = useState(false)
  const [suggestScanTopic, setSuggestScanTopic] = useState<string | null>(null)
  const [savedConversation, setSavedConversation] = useState(false)
  const [savedSources, setSavedSources] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!streaming) inputRef.current?.focus()
  }, [streaming])

  // Fetch available collections on mount
  useEffect(() => {
    getBaseUrl().then(baseUrl => {
      fetch(`${baseUrl}/api/embeddings/collections`)
        .then(r => r.json())
        .then(data => {
          if (data.collections?.length > 0) {
            setCollections(data.collections)
          }
        })
        .catch(() => {})
    })
  }, [])

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || streaming) return

    const userMsg: Message = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    setStatusText('')
    setWebSources([])
    setHasKnowledge(false)
    setSuggestScanTopic(null)
    setSavedConversation(false)
    setSavedSources(false)

    const assistantIdx = messages.length + 1
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const baseUrl = await getBaseUrl()

      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), 120000)

      const allMessages = [...messages, userMsg]
      const resp = await fetch(`${baseUrl}/api/strategy/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
          enable_web_search: enableWeb,
          enable_knowledge_search: enableKB,
          mode: mode,
          collection_name: collectionName,
        }),
        signal: abortController.signal,
      })

      clearTimeout(timeoutId)

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body?.getReader()
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
          const trimmedLine = line.trim()
          if (!trimmedLine.startsWith('data: ')) continue
          try {
            const jsonStr = trimmedLine.slice(6)
            const eventData = JSON.parse(jsonStr)
            handleSSEEvent(eventData, assistantIdx)
          } catch { /* skip malformed JSON */ }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        try {
          const eventData = JSON.parse(buffer.trim().slice(6))
          handleSSEEvent(eventData, assistantIdx)
        } catch { /* skip */ }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '未知错误'
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages(prev => {
          const updated = [...prev]
          if (updated[assistantIdx] && updated[assistantIdx].content === '') {
            updated[assistantIdx] = { role: 'assistant', content: '**请求超时**: AI 分析超过 2 分钟，请尝试更简短的问题或检查网络连接' }
          }
          return updated
        })
      } else {
        setMessages(prev => {
          const updated = [...prev]
          if (updated[assistantIdx] && updated[assistantIdx].content === '') {
            updated[assistantIdx] = { role: 'assistant', content: `**出错了**: ${errMsg}\n\n请确认后端已启动` }
          }
          return updated
        })
      }
    } finally {
      setStreaming(false)
      setStatusText('')
    }
  }

  function handleSSEEvent(data: Record<string, unknown>, assistantIdx: number) {
    if (data.content !== undefined) {
      setMessages(prev => {
        const updated = [...prev]
        if (updated[assistantIdx]) {
          updated[assistantIdx] = {
            ...updated[assistantIdx],
            content: updated[assistantIdx].content + String(data.content),
          }
        }
        return updated
      })
    } else if (data.message && data.step !== 'suggest_scan') {
      if (data.step === 'error' || (data.message as string).includes('失败') || (data.message as string).includes('未配置')) {
        setMessages(prev => {
          const updated = [...prev]
          if (updated[assistantIdx] && updated[assistantIdx].content === '') {
            updated[assistantIdx] = { role: 'assistant', content: `**出错了**: ${data.message}` }
          }
          return updated
        })
      } else {
        setStatusText(String(data.message))
      }
    }

    // Capture context info (web sources + knowledge status)
    if (data.web_sources) {
      setWebSources(data.web_sources as WebSource[])
    }
    if (data.has_knowledge !== undefined) {
      setHasKnowledge(data.has_knowledge as boolean)
    }
    // Suggest scan for unknown topics
    if (data.topic) {
      setSuggestScanTopic(String(data.topic))
    }
  }

  async function handleSaveConversation() {
    const baseUrl = await getBaseUrl()
    try {
      const title = messages.find(m => m.role === 'user')?.content.slice(0, 40) || `策略对谈 ${new Date().toLocaleDateString()}`
      const resp = await fetch(`${baseUrl}/api/strategy/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          tags: ['策略对谈'],
          abstract: messages.find(m => m.role === 'assistant')?.content.slice(0, 100) || '',
        }),
      })
      if (resp.ok) {
        setSavedConversation(true)
      } else {
        const err = await resp.json()
        alert(`保存失败: ${err.detail || '未知错误'}`)
      }
    } catch (e) {
      alert(`保存失败: ${e}`)
    }
  }

  async function handleSaveSources() {
    if (webSources.length === 0) return
    const baseUrl = await getBaseUrl()
    try {
      const resp = await fetch(`${baseUrl}/api/strategy/save-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: webSources }),
      })
      if (resp.ok) {
        setSavedSources(true)
      } else {
        const err = await resp.json()
        alert(`保存失败: ${err.detail || '未知错误'}`)
      }
    } catch (e) {
      alert(`保存失败: ${e}`)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const lastAssistantIdx = [...messages].reverse().findIndex(m => m.role === 'assistant')
  const showActions = !streaming && messages.some(m => m.role === 'assistant' && m.content)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 gap-4 flex-wrap">
        <h2 className="text-lg font-bold">策略对谈</h2>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-sm">
            <button
              onClick={() => setMode('chat')}
              className={`px-3 py-1 rounded-md transition-colors ${
                mode === 'chat'
                  ? 'bg-white text-blue-600 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              对话
            </button>
            <button
              onClick={() => setMode('detailed')}
              className={`px-3 py-1 rounded-md transition-colors ${
                mode === 'detailed'
                  ? 'bg-white text-blue-600 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              详细
            </button>
            <button
              onClick={() => setMode('casual')}
              className={`px-3 py-1 rounded-md transition-colors ${
                mode === 'casual'
                  ? 'bg-white text-purple-600 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              闲聊
            </button>
          </div>

          {/* Collection selector */}
          {collections.length > 0 && (
            <select
              value={collectionName}
              onChange={e => setCollectionName(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-blue-400"
            >
              {collections.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableKB}
              onChange={e => setEnableKB(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className={enableKB ? 'text-gray-700' : 'text-gray-400'}>知识库</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableWeb}
              onChange={e => setEnableWeb(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className={enableWeb ? 'text-gray-700' : 'text-gray-400'}>联网搜索</span>
          </label>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center max-w-md">
              <div className="text-4xl mb-4">💬</div>
              <p className="text-lg font-medium mb-2">策略对谈</p>
              <p className="text-sm leading-relaxed">
                输入你的电商运营问题，AI 将检索你的知识库和联网信息，给出深度策略分析。
              </p>
              <div className="mt-6 text-xs space-y-1">
                <p>试试问：</p>
                <button
                  onClick={() => setInput('我的品类在小红书上该怎么推广？')}
                  className="block w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                >
                  "我的品类在小红书上该怎么推广？"
                </button>
                <button
                  onClick={() => setInput('抖音直播间的选品逻辑应该怎么设计？')}
                  className="block w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors mt-1"
                >
                  "抖音直播间的选品逻辑应该怎么设计？"
                </button>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx}>
            <div
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="text-sm">
                    {msg.content ? (
                      <SafeMarkdown content={msg.content} />
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons — only below last AI message after streaming is done */}
            {showActions && idx === messages.length - 1 && msg.role === 'assistant' && msg.content && (
              <div className="flex justify-start mt-2">
                <div className="flex items-center gap-2">
                  {!savedConversation ? (
                    <button
                      onClick={handleSaveConversation}
                      className="text-xs px-2.5 py-1 rounded-md bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                      💾 保存对话
                    </button>
                  ) : (
                    <span className="text-xs px-2.5 py-1 text-green-600">✓ 已保存对话</span>
                  )}
                  {webSources.length > 0 && !savedSources && (
                    <button
                      onClick={handleSaveSources}
                      className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      📥 保存搜索来源 ({webSources.length})
                    </button>
                  )}
                  {webSources.length > 0 && savedSources && (
                    <span className="text-xs px-2.5 py-1 text-green-600">✓ 已保存来源</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {statusText && (
          <div className="flex justify-start">
            <div className="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full">
              {statusText}
            </div>
          </div>
        )}

        {suggestScanTopic && (
          <div className="flex justify-start mt-2">
            <button
              onClick={() => {
                onTriggerScan(suggestScanTopic)
                setSuggestScanTopic(null)
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200"
            >
              📊 去行业摸底生成「{suggestScanTopic}」分析报告
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 bg-white border-t border-gray-200">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，Enter 发送"
            disabled={streaming}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
