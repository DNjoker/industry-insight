import { useState, useEffect } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'

interface Config {
  llm_provider: string
  llm_model: string
  deepseek_api_key: string
  anthropic_api_key: string
  openai_api_key: string
  openai_base_url: string
  search_engine: string
  tavily_api_key: string
  bing_api_key: string
  obsidian_vault_path: string
  volcano_api_key: string
  volcano_vision_model: string
  preload_knowledge_base: boolean
  sync_on_startup: boolean
}

interface BackendConfig {
  llm_provider: string
  llm_model: string
  has_deepseek_key: boolean
  has_anthropic_key: boolean
  has_openai_key: boolean
  openai_base_url: string | null
  search_engine: string
  has_tavily_key: boolean
  has_bing_key: boolean
  obsidian_vault_path: string | null
  has_volcano_key: boolean
  volcano_vision_model: string
  preload_knowledge_base: boolean
  sync_on_startup: boolean
}

function emptyConfig(): Config {
  return {
    llm_provider: 'deepseek',
    llm_model: 'deepseek-chat',
    deepseek_api_key: '',
    anthropic_api_key: '',
    openai_api_key: '',
    openai_base_url: '',
    search_engine: 'tavily',
    tavily_api_key: '',
    bing_api_key: '',
    obsidian_vault_path: '',
    volcano_api_key: '',
    volcano_vision_model: 'doubao-seed-1-6-251015',
    preload_knowledge_base: false,
    sync_on_startup: false,
  }
}

export default function Settings() {
  const [config, setConfig] = useState<Config>(emptyConfig())
  const [saved, setSaved] = useState(false)
  const [backendOnline, setBackendOnline] = useState(false)

  // Sync state
  const [syncDirs, setSyncDirs] = useState<string[]>(['知识卡片', '行业摸底', 'DeepSeek对话'])
  const [syncCollection, setSyncCollection] = useState('source_articles_v2')
  const [excludeSources, setExcludeSources] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ indexed: number; removed: number; errors: string[]; skipped_sources?: number } | null>(null)

  function toggleSyncDir(dir: string) {
    setSyncDirs(prev => prev.includes(dir) ? prev.filter(d => d !== dir) : [...prev, dir])
  }

  async function handleSync() {
    if (syncDirs.length === 0 || syncing) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/embeddings/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directories: syncDirs,
          collection_name: syncCollection,
          exclude_sources: excludeSources,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setSyncResult(data)
      } else {
        const err = await resp.json()
        setSyncResult({ indexed: 0, removed: 0, errors: [err.detail || '同步失败'] })
      }
    } catch (e) {
      setSyncResult({ indexed: 0, removed: 0, errors: [String(e)] })
    } finally {
      setSyncing(false)
    }
  }

  // Load from localStorage + backend on mount
  useEffect(() => {
    const merged = emptyConfig()

    // Load from localStorage first
    const local = localStorage.getItem('app-config')
    if (local) {
      try {
        Object.assign(merged, JSON.parse(local))
      } catch { /* ignore */ }
    }

    // Then try to load from backend
    getBaseUrl().then(async (baseUrl) => {
      try {
        const res = await fetch(`${baseUrl}/api/config`)
        if (res.ok) {
          const bc: BackendConfig = await res.json()
          merged.llm_provider = bc.llm_provider || merged.llm_provider
          merged.llm_model = bc.llm_model || merged.llm_model
          merged.openai_base_url = bc.openai_base_url || merged.openai_base_url
          merged.search_engine = bc.search_engine || merged.search_engine
          merged.obsidian_vault_path = bc.obsidian_vault_path || merged.obsidian_vault_path
          merged.volcano_vision_model = bc.volcano_vision_model || merged.volcano_vision_model
          merged.preload_knowledge_base = bc.preload_knowledge_base ?? merged.preload_knowledge_base
          merged.sync_on_startup = bc.sync_on_startup ?? merged.sync_on_startup
          setBackendOnline(true)
        }
      } catch {
        setBackendOnline(false)
      }
      setConfig(merged)
    })
  }, [])

  const handleSave = async () => {
    localStorage.setItem('app-config', JSON.stringify(config))

    // Push to backend
    try {
      const baseUrl = await getBaseUrl()
      await fetch(`${baseUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm_provider: config.llm_provider,
          llm_model: config.llm_model,
          deepseek_api_key: config.deepseek_api_key || null,
          anthropic_api_key: config.anthropic_api_key || null,
          openai_api_key: config.openai_api_key || null,
          openai_base_url: config.openai_base_url || null,
          search_engine: config.search_engine || null,
          tavily_api_key: config.tavily_api_key || null,
          bing_api_key: config.bing_api_key || null,
          obsidian_vault_path: config.obsidian_vault_path || null,
          volcano_api_key: config.volcano_api_key || null,
          volcano_vision_model: config.volcano_vision_model || null,
          preload_knowledge_base: config.preload_knowledge_base,
          sync_on_startup: config.sync_on_startup,
        }),
      })
    } catch {
      // Backend not available, settings saved locally
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSelectVault = async () => {
    const folder = await window.electronAPI?.selectFolder()
    if (folder) {
      setConfig((prev) => ({ ...prev, obsidian_vault_path: folder }))
    }
  }

  const updateField = (field: keyof Config, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">设置</h2>
        <span className={`text-xs px-2 py-1 rounded ${backendOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
          {backendOnline ? '后端已连接' : '后端未连接'}
        </span>
      </div>

      {/* AI Provider */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">AI 模型</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">模型提供商</label>
            <select
              value={config.llm_provider}
              onChange={(e) => updateField('llm_provider', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="claude">Claude</option>
              <option value="openai">OpenAI / 兼容接口</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">模型名称</label>
            <input
              type="text"
              value={config.llm_model}
              onChange={(e) => updateField('llm_model', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {config.llm_provider === 'deepseek' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">DeepSeek API Key</label>
              <input
                type="password"
                value={config.deepseek_api_key}
                onChange={(e) => updateField('deepseek_api_key', e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {config.llm_provider === 'claude' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Anthropic API Key</label>
              <input
                type="password"
                value={config.anthropic_api_key}
                onChange={(e) => updateField('anthropic_api_key', e.target.value)}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {config.llm_provider === 'openai' && (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-1">API Key</label>
                <input
                  type="password"
                  value={config.openai_api_key}
                  onChange={(e) => updateField('openai_api_key', e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Base URL (可选，用于兼容接口)</label>
                <input
                  type="text"
                  value={config.openai_base_url}
                  onChange={(e) => updateField('openai_base_url', e.target.value)}
                  placeholder="https://api.siliconflow.cn/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Search */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">网络搜索</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">搜索引擎</label>
            <select
              value={config.search_engine}
              onChange={(e) => updateField('search_engine', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="tavily">Tavily（推荐，需 VPN，免费 1000 次/月）</option>
              <option value="bing">Bing API（国内可用，需 Azure Key）</option>
              <option value="direct">直接抓取（免 Key，备用方案）</option>
            </select>
          </div>

          {config.search_engine === 'tavily' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Tavily API Key</label>
              <input
                type="password"
                value={config.tavily_api_key}
                onChange={(e) => updateField('tavily_api_key', e.target.value)}
                placeholder="tvly-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                注册地址: <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" className="text-blue-500">tavily.com</a>（免费额度 1000 次/月，需 VPN）
              </p>
            </div>
          )}

          {config.search_engine === 'bing' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Bing API Key</label>
              <input
                type="password"
                value={config.bing_api_key}
                onChange={(e) => updateField('bing_api_key', e.target.value)}
                placeholder="Azure Bing Search API Key..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                注册地址: <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-blue-500">portal.azure.com</a> → 创建 Bing Search v7 资源（国内可用，免费 1000 次/月）
              </p>
            </div>
          )}

          {config.search_engine === 'direct' && (
            <p className="text-sm text-gray-400 p-3 bg-gray-50 rounded-lg">
              直接抓取模式无需 API Key，自动尝试 Bing/Baidu 搜索。若主引擎失败，也会自动启用此模式作为备用。
            </p>
          )}
        </div>
      </section>

      {/* Obsidian */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">Obsidian（可选）</h3>
        <p className="text-sm text-gray-500 mb-3">
          配置 Obsidian Vault 后，报告、卡片、对话将保存到 Vault 中，可使用 Obsidian 的双向链接和图谱功能。
          不配置也能正常使用，文件自动保存到工具的数据目录。
        </p>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Obsidian Vault 路径</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.obsidian_vault_path}
              readOnly
              placeholder="未配置（使用本地数据目录）"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
            />
            <button
              onClick={handleSelectVault}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              选择...
            </button>
          </div>
          {!config.obsidian_vault_path && (
            <p className="text-xs text-gray-400 mt-1">
              当前使用默认路径：data/vault/（工具文件夹下）
            </p>
          )}
        </div>
      </section>

      {/* Vision Model */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">视觉模型（竞品分析）</h3>
        <p className="text-sm text-gray-500 mb-3">
          用于竞品主图/详情页的AI识别和评分。支持火山引擎豆包视觉、通义千问视觉等。
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">视觉模型</label>
            <select
              value={config.volcano_vision_model}
              onChange={(e) => updateField('volcano_vision_model', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="doubao-seed-1-6-251015">豆包 Seed 1.6 128K（火山引擎，推荐，支持视觉）</option>
              <option value="doubao-seed-1-6-flash-251015">豆包 Seed 1.6 Flash 32K（火山引擎，快速低价）</option>
              <option value="doubao-seed-1-6-lite-251015">豆包 Seed 1.6 Lite 32K（火山引擎，轻量）</option>
              <option value="qwen-vl-max">通义千问 VL Max（阿里云）</option>
              <option value="gpt-4o">GPT-4o（OpenAI）</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              API Key
              {config.volcano_vision_model.startsWith('qwen') && '（阿里云 DashScope API Key）'}
              {config.volcano_vision_model.startsWith('doubao') && '（火山引擎 Ark API Key）'}
              {config.volcano_vision_model.startsWith('gpt') && '（OpenAI API Key）'}
            </label>
            <input
              type="password"
              value={config.volcano_api_key}
              onChange={(e) => updateField('volcano_api_key', e.target.value)}
              placeholder="输入 API Key..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {config.volcano_vision_model.startsWith('doubao') && (
              <p className="text-xs text-gray-400 mt-1">
                注册地址: <a href="https://console.volcengine.com/ark" target="_blank" rel="noopener noreferrer" className="text-blue-500">console.volcengine.com/ark</a> → 创建推理接入点 → 选择 Doubao Vision Pro 32K
              </p>
            )}
            {config.volcano_vision_model.startsWith('qwen') && (
              <p className="text-xs text-gray-400 mt-1">
                注册地址: <a href="https://dashscope.console.aliyun.com" target="_blank" rel="noopener noreferrer" className="text-blue-500">dashscope.console.aliyun.com</a> → 开通通义千问视觉模型
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 知识库同步 */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">知识库</h3>
        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.preload_knowledge_base as any === true || config.preload_knowledge_base === 'true'}
              onChange={(e) => setConfig((prev: Config) => ({ ...prev, preload_knowledge_base: e.target.checked as any }))}
              className="w-4 h-4 accent-blue-600"
            />
            <div>
              <span className="text-sm text-gray-700">启动时预加载知识库模型</span>
              <p className="text-xs text-gray-400">避免首次提问时的等待，约占用 500MB 内存。如不常使用策略对谈可关闭。</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.sync_on_startup as any === true || config.sync_on_startup === 'true'}
              onChange={(e) => setConfig((prev: Config) => ({ ...prev, sync_on_startup: e.target.checked as any }))}
              className="w-4 h-4 accent-blue-600"
            />
            <div>
              <span className="text-sm text-gray-700">启动时自动同步知识库</span>
              <p className="text-xs text-gray-400">每次启动应用时自动将 Vault 中的文件索引到向量数据库，确保知识库内容是最新的。</p>
            </div>
          </label>
        </div>
        <h3 className="text-lg font-semibold mb-3">知识库同步</h3>
        <p className="text-sm text-gray-500 mb-3">
          将 Obsidian Vault 中的 Markdown 文件索引到向量数据库，供策略对谈检索。
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">同步目录</label>
            <div className="flex gap-4">
              {['知识卡片', '行业摸底', 'DeepSeek对话'].map(dir => (
                <label key={dir} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncDirs.includes(dir)}
                    onChange={() => toggleSyncDir(dir)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span>{dir}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">目标集合</label>
            <input
              type="text"
              value={syncCollection}
              onChange={e => setSyncCollection(e.target.value)}
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeSources}
              onChange={(e) => setExcludeSources(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <div>
              <span className="text-sm text-gray-700">仅索引报告和卡片</span>
              <p className="text-xs text-gray-400">排除 sources/ 原始网页抓取，缩小知识库体积，搜索更精准</p>
            </div>
          </label>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition-colors"
        >
          {syncing ? '同步中...' : '开始同步'}
        </button>

        {syncResult && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm space-y-1">
            <p>已索引: <span className="font-medium">{syncResult.indexed}</span> 篇</p>
            <p>已清理: <span className="font-medium">{syncResult.removed}</span> 篇</p>
            {syncResult.skipped_sources ? (
              <p>已跳过: <span className="font-medium text-gray-500">{syncResult.skipped_sources}</span> 篇（原始文章）</p>
            ) : null}
            {syncResult.errors?.length > 0 && (
              <div className="text-red-500">
                <p className="font-medium mb-1">错误 ({syncResult.errors.length} 个文件):</p>
                {syncResult.errors.map((err, i) => (
                  <p key={i} className="text-xs break-all ml-2">• {err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <button
        onClick={handleSave}
        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300"
      >
        {saved ? '已保存!' : '保存设置'}
      </button>
    </div>
  )
}
