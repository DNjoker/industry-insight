import { useState, useEffect } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'
import MarkdownRenderer from '../components/MarkdownRenderer'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

interface ChatFile {
  filename: string
  title: string
  refined: boolean
  path: string
}

function parseConversation(raw: string): ChatMsg[] {
  const lines = raw.split('\n')
  const messages: ChatMsg[] = []
  let currentRole: 'user' | 'assistant' | null = null
  let currentContent: string[] = []

  function flush() {
    if (currentRole && currentContent.length > 0) {
      messages.push({ role: currentRole, content: currentContent.join('\n').trim() })
    }
    currentContent = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      currentRole = null
      continue
    }

    const userMatch = trimmed.match(/^(用户|User|我|Q)[：:]\s*/)
    const aiMatch = trimmed.match(/^(DeepSeek|AI|Assistant|助手|答|ChatGPT|A)[：:]\s*/)

    if (userMatch) {
      flush()
      currentRole = 'user'
      currentContent = [trimmed.slice(userMatch[0].length)]
    } else if (aiMatch) {
      flush()
      currentRole = 'assistant'
      currentContent = [trimmed.slice(aiMatch[0].length)]
    } else if (currentRole) {
      currentContent.push(trimmed)
    }
  }
  flush()

  if (messages.length === 0) {
    const nonEmpty = lines.filter(l => l.trim())
    for (let i = 0; i < nonEmpty.length; i++) {
      messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: nonEmpty[i].trim() })
    }
  }

  return messages
}

/** Parse messages from an Obsidian-saved conversation file (## 对话记录 section) */
function parseObsidianConversation(content: string): ChatMsg[] {
  const messages: ChatMsg[] = []
  // Find the 对话记录 section
  const recordIdx = content.indexOf('## 对话记录')
  if (recordIdx === -1) return messages

  const recordSection = content.slice(recordIdx)
  // Split by ### **Role**
  const parts = recordSection.split(/### \*\*(用户|DeepSeek)\*\*/)
  // parts[0] = header text, then alternating role + content
  for (let i = 1; i < parts.length; i += 2) {
    const role = parts[i] === '用户' ? 'user' : 'assistant'
    const text = (parts[i + 1] || '').trim()
    if (text) {
      messages.push({ role, content: text })
    }
  }
  return messages
}

export default function ChatImport() {
  const [unrefinedFiles, setUnrefinedFiles] = useState<ChatFile[]>([])
  const [refinedFiles, setRefinedFiles] = useState<ChatFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [loadPath, setLoadPath] = useState<string | null>(null) // path of loaded file for overwrite

  const [rawText, setRawText] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [abstract, setAbstract] = useState('')
  const [refined, setRefined] = useState('')
  const [loading, setLoading] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [])

  async function loadFiles() {
    setFilesLoading(true)
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/chat/files`)
      if (resp.ok) {
        const data = await resp.json()
        setUnrefinedFiles(data.unrefined || [])
        setRefinedFiles(data.refined || [])
      }
    } catch { /* ignore */ }
    setFilesLoading(false)
  }

  async function handleLoadFile(file: ChatFile) {
    setLoading('load')
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/obsidian/read?relative_path=${encodeURIComponent(file.path)}`)
      if (!resp.ok) return
      const data = await resp.json()
      const content: string = data.content || ''

      // Parse existing refined content
      const refineIdx = content.indexOf('## AI 提炼')
      const recordIdx = content.indexOf('## 对话记录')
      if (refineIdx !== -1 && recordIdx !== -1 && refineIdx < recordIdx) {
        setRefined(content.slice(refineIdx + 7, recordIdx).trim())
      } else {
        setRefined('')
      }

      // Parse messages from 对话记录 section
      const msgs = parseObsidianConversation(content)
      if (msgs.length === 0) {
        // Fallback: try parsing the whole file as a raw conversation
        const bodyStart = content.indexOf('## 对话记录')
        const fallback = parseConversation(bodyStart !== -1 ? content.slice(bodyStart) : content)
        setMessages(fallback)
      } else {
        setMessages(msgs)
      }

      // Extract title (first # heading or filename)
      let extractedTitle = file.filename.replace('.md', '')
      for (const line of content.split('\n')) {
        if (line.startsWith('# ')) {
          extractedTitle = line.slice(2).trim()
          break
        }
      }
      setTitle(extractedTitle)
      setSelectedFile(file.filename)
      setLoadPath(file.path)
      setRawText('')
      setSaved(false)
    } catch { /* ignore */ }
    setLoading('')
  }

  function handleParse() {
    const parsed = parseConversation(rawText)
    setMessages(parsed)
    setRefined('')
    setSaved(false)
    setSelectedFile(null)
    setLoadPath(null)
  }

  async function handlePreview() {
    if (messages.length === 0) return
    setLoading('preview')
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/chat/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setTitle(data.suggested_title || '')
        setTags(data.suggested_tags || [])
        setAbstract(data.abstract || '')
      }
    } catch { /* ignore */ }
    setLoading('')
  }

  async function handleRefine() {
    if (messages.length === 0) return
    setLoading('refine')
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/chat/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, title: title || '未命名对话' }),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.refined_content) setRefined(data.refined_content)
      }
    } catch { /* ignore */ }
    setLoading('')
  }

  async function handleSave() {
    if (!title || messages.length === 0) return
    setLoading('save')
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, title, tags, abstract, refined_content: refined, overwrite_path: loadPath }),
      })
      if (resp.ok) {
        setSaved(true)
        loadFiles()
      } else {
        const data = await resp.json()
        alert(data.error || '保存失败')
      }
    } catch { /* ignore */ }
    setLoading('')
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex gap-6">
        {/* Sidebar — file list */}
        <div className="w-64 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">DeepSeek 对话</h3>
            <button
              onClick={loadFiles}
              disabled={filesLoading}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {filesLoading ? '加载中...' : '刷新'}
            </button>
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {/* 未提炼 */}
            <h4 className="text-xs text-gray-400 font-medium">未提炼</h4>
            {unrefinedFiles.length === 0 && (
              <p className="text-xs text-gray-300 pl-1">暂无</p>
            )}
            {unrefinedFiles.map(f => (
              <button
                key={f.filename}
                onClick={() => handleLoadFile(f)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedFile === f.filename
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-300">○</span>
                  <span className="truncate flex-1">{f.title}</span>
                </div>
              </button>
            ))}

            {/* 已提炼 */}
            <h4 className="text-xs text-gray-400 font-medium pt-2">已提炼</h4>
            {refinedFiles.length === 0 && (
              <p className="text-xs text-gray-300 pl-1">暂无</p>
            )}
            {refinedFiles.map(f => (
              <button
                key={f.filename}
                onClick={() => handleLoadFile(f)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedFile === f.filename
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span className="truncate flex-1">{f.title}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-6 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">对话梳理</h2>
            {selectedFile && (
              <span className="text-xs text-gray-400">当前文件: {selectedFile}</span>
            )}
          </div>

          {/* Input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              粘贴对话内容
              <span className="text-gray-400 font-normal ml-2">或从左侧选择已有文件</span>
            </label>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={`支持格式：\n用户：xxx\nDeepSeek：xxx\n\n多个对话用空行分隔。`}
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y"
            />
            <button
              onClick={handleParse}
              disabled={!rawText.trim()}
              className="mt-2 px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              解析对话
            </button>
          </div>

          {/* Parsed messages preview */}
          {messages.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">
                  已解析 {messages.length} 条消息
                  {selectedFile && refined && (
                    <span className="ml-2 text-green-600 text-xs">（已有提炼内容）</span>
                  )}
                </h3>
                <button
                  onClick={handlePreview}
                  disabled={loading === 'preview'}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading === 'preview' ? '生成中...' : 'AI 生成摘要'}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50 text-xs space-y-1">
                {messages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'text-blue-700' : 'text-gray-700'}>
                    <span className="font-medium">{m.role === 'user' ? '用户' : 'DeepSeek'}:</span>{' '}
                    {m.content.slice(0, 120)}{m.content.length > 120 ? '...' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta fields */}
          {messages.length > 0 && (
            <div className="grid grid-cols-1 gap-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <label className="block text-xs text-gray-500 mb-1">标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">标签（逗号分隔）</label>
                <input
                  type="text"
                  value={tags.join(', ')}
                  onChange={e => setTags(e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">摘要</label>
                <textarea
                  value={abstract}
                  onChange={e => setAbstract(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-y"
                />
              </div>
            </div>
          )}

          {/* Refine */}
          {messages.length > 0 && (
            <div>
              <button
                onClick={handleRefine}
                disabled={loading === 'refine'}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading === 'refine' ? '提炼中...' : 'AI 提炼核心观点'}
              </button>
            </div>
          )}

          {/* Refined output */}
          {refined && (
            <div className="border border-gray-200 rounded-xl p-4 bg-white">
              <h3 className="text-sm font-medium mb-3">提炼结果</h3>
              <div className="text-sm">
                <MarkdownRenderer content={refined} />
              </div>
            </div>
          )}

          {/* Save */}
          {messages.length > 0 && title && (
            <button
              onClick={handleSave}
              disabled={loading === 'save' || saved}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saved ? '✓ 已保存' : loading === 'save' ? '保存中...' : '保存到 Obsidian'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
