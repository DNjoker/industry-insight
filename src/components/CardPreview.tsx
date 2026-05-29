import { useState } from 'react'
import MarkdownRenderer from './MarkdownRenderer'

export interface KnowledgeCard {
  index: number
  source_type: string
  content_type?: string  // "long_form" | "mixed"
  title: string
  tags: string[]
  abstract?: string  // 1-2 sentence summary
  body?: string  // main markdown content
  summary?: string  // legacy field, fallback for body
  source_url?: string | null
  source_title?: string | null
  user_note?: string | null
  raw_content?: string | null
}

interface Props {
  card: KnowledgeCard
  onUpdate: (card: KnowledgeCard) => void
  onDelete: () => void
  onScan?: (keyword: string) => void
}

export default function CardPreview({ card, onUpdate, onDelete, onScan }: Props) {
  const [previewing, setPreviewing] = useState(false)
  const [tagInput, setTagInput] = useState(card.tags.join(', '))
  const [showRaw, setShowRaw] = useState(false)

  const mainContent = card.body || card.summary || ''

  const update = (patch: Partial<KnowledgeCard>) => {
    onUpdate({ ...card, ...patch })
  }

  const handleTagsBlur = () => {
    const tags = tagInput.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
    setTagInput(tags.join(', '))
    update({ tags })
  }

  const typeBadge = card.source_type === '实操卡片'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-green-100 text-green-700'

  const isLongForm = card.content_type === 'long_form'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3 shadow-sm">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1">
          <input
            type="text"
            value={card.title}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full font-semibold text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none px-1 py-0.5"
          />
          {card.source_url && (
            <a
              href={card.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline truncate block mt-1"
            >
              {card.source_title || card.source_url}
            </a>
          )}
          {card.user_note && (
            <p className="text-xs text-gray-500 mt-1 italic">
              备注: {card.user_note}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={card.source_type}
            onChange={(e) => update({ source_type: e.target.value })}
            className={`text-xs px-2 py-1 rounded-full border-0 font-medium ${typeBadge} cursor-pointer`}
          >
            <option value="实操卡片">实操卡片</option>
            <option value="阅读笔记">阅读笔记</option>
          </select>

          {isLongForm && (
            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
              长文保留
            </span>
          )}

          {onScan && (
            <button
              onClick={() => onScan(card.tags[0] || card.title)}
              title="一键摸底"
              className="px-2 py-1 text-xs bg-purple-50 text-purple-600 rounded hover:bg-purple-100 transition-colors"
            >
              摸底
            </button>
          )}

          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
            title="删除卡片"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="mb-3">
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onBlur={handleTagsBlur}
          placeholder="标签, 逗号分隔"
          className="w-full text-xs text-gray-500 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-300"
        />
      </div>

      {/* Abstract (short summary for indexing) */}
      {card.abstract && (
        <div className="mb-3 p-2 bg-blue-50 border-l-2 border-blue-300 rounded-r text-xs text-gray-700">
          <span className="font-medium text-blue-600">摘要: </span>
          {card.abstract}
        </div>
      )}

      {/* Content: edit or preview */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setPreviewing(false)}
            className={`text-xs px-2 py-0.5 rounded ${!previewing ? 'bg-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
          >
            编辑
          </button>
          <button
            onClick={() => setPreviewing(true)}
            className={`text-xs px-2 py-0.5 rounded ${previewing ? 'bg-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
          >
            预览
          </button>
        </div>

        {previewing ? (
          <div className="prose prose-sm max-w-none bg-gray-50 rounded-lg p-3 min-h-[80px]">
            <MarkdownRenderer content={mainContent} />
          </div>
        ) : (
          <textarea
            value={mainContent}
            onChange={(e) => update({ body: e.target.value })}
            rows={isLongForm ? 16 : 6}
            className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-blue-300 resize-y font-mono"
          />
        )}
      </div>

      {/* Raw extracted content — only for URL sources (not pure text) */}
      {card.raw_content && card.source_url && (
        <div className="mt-2">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <span>{showRaw ? '▼' : '▶'}</span>
            原始提取信息 ({card.raw_content.length} 字)
          </button>
          {showRaw && (
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-gray-600 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
              {card.raw_content}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
