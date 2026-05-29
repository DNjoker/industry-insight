import { useState, useEffect, Component } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'
import type { SellingPrefill } from '../App'

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center text-red-500">
          <p className="font-medium">输出渲染出错</p>
          <p className="text-sm mt-1">{this.state.error}</p>
        </div>
      )
    }
    return this.props.children
  }
}

interface FabPoint {
  feature: string
  advantage: string
  benefit: string | { functional?: string; emotional?: string }
  use_scenario?: string
  pas_copy?: { problem?: string; agitate?: string; solve?: string }
  platform_adaptation?: string
}

interface PainPointItem {
  pain_point: string
  deep_need: string
  our_solution: string
  copy_hint: string
}

interface DetailScreen {
  title: string
  subtitle?: string
  layout?: string
  copy?: string
  content?: string
  visual_description?: string
  visual?: string
  tips: string
}

interface AdditionalImage {
  position: string
  purpose: string
  layout_style: string
  colors: string
  image_direction: string
  text_overlay?: string
  notes: string
}

interface DesignBrief {
  layout_style: string
  colors: string
  font_style: string
  image_direction: string
  text_placement: string
  notes: string
}

interface PlatformOutput {
  main_images: string[]
  selling_points: FabPoint[]
  pain_point_mining?: PainPointItem[]
  detail_page: DetailScreen[]
  design_brief?: DesignBrief
  additional_images?: AdditionalImage[]
}

interface SocialPost {
  recommended_platforms?: string[]
  post_types?: string[]
  titles?: { text: string; type: string }[]
  body_framework?: {
    hook_opening?: string
    body_flow?: string[]
    closing_cta?: string
  }
  hashtags?: { tag: string; purpose: string }[]
  image_plan?: {
    cover?: string
    images?: string[]
    ratio?: string
    design_notes?: string
  }
  seo_tips?: string
}

interface VideoShot {
  shot_number: number
  duration?: string
  scene_type?: string
  camera_move?: string
  visual_description?: string
  voiceover?: string
  text_overlay?: string
  bgm_sfx?: string
}

interface VideoScript {
  recommended_platforms?: string[]
  video_type?: string
  suggested_duration?: string
  hook_variants?: string[]
  script_outline?: string
  shot_list?: VideoShot[]
  performance_notes?: string
  shooting_tips?: string
}

interface ContentAsset {
  social_post?: SocialPost
  video_script?: VideoScript
}

type ContentAssets = Record<string, ContentAsset>

interface QualityIssue {
  severity: string
  section: string
  problem: string
  suggestion: string
}

interface QualityReview {
  overall_score?: number
  summary?: string
  issues?: QualityIssue[]
  strengths?: string[]
  need_human_check?: string[]
}

interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

interface Result {
  keywords?: string[]
  fab_platform_notes?: string
  platforms?: Record<string, PlatformOutput>
  content_assets?: ContentAssets
  quality_review?: QualityReview
  content_reviews?: Record<string, QualityReview>
  content_warnings?: string[]
  token_usage?: TokenUsage
  raw?: string
  error?: string
}

const DEFAULT_PLATFORMS = ['淘宝', '拼多多', '抖音', '京东']
const CONTENT_PLATFORMS = [
  { key: '小红书', label: '小红书', desc: '图文种草' },
  { key: '公众号', label: '公众号', desc: '长文种草' },
  { key: '抖音内容', label: '抖音内容', desc: '短视频' },
  { key: '快手', label: '快手', desc: '短视频' },
  { key: '视频号', label: '视频号', desc: '短视频' },
  { key: 'B站', label: 'B站', desc: '中长视频' },
]

const PLATFORM_COLORS: Record<string, string> = {
  '淘宝': 'border-orange-400 bg-orange-50',
  '拼多多': 'border-red-400 bg-red-50',
  '抖音': 'border-cyan-400 bg-cyan-50',
  '京东': 'border-red-600 bg-red-50',
}

const PLATFORM_TAB_COLORS: Record<string, string> = {
  '淘宝': 'bg-orange-500',
  '拼多多': 'bg-red-500',
  '抖音': 'bg-cyan-500',
  '京东': 'bg-red-700',
}

export default function SellingPoint({ prefill }: { prefill?: SellingPrefill | null }) {
  const [productName, setProductName] = useState('')
  const [category, setCategory] = useState('')
  const [keyFeatures, setKeyFeatures] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [priceTier, setPriceTier] = useState('')
  const [painPoints, setPainPoints] = useState('')
  const [myProductAdvantage, setMyProductAdvantage] = useState('')
  const [myProductWeakness, setMyProductWeakness] = useState('')
  const [competitorContext, setCompetitorContext] = useState('')
  const [brandTone, setBrandTone] = useState('')
  const [reportPath, setReportPath] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(DEFAULT_PLATFORMS)
  const [selectedContentPlatforms, setSelectedContentPlatforms] = useState<string[]>(['小红书', '抖音内容'])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!loading) { setElapsedSeconds(0); return }
    const start = Date.now()
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [loading])
  const [activeTab, setActiveTab] = useState('淘宝')
  const [copiedText, setCopiedText] = useState('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [defaultPrompt, setDefaultPrompt] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(() =>
    localStorage.getItem('selling-point-template') || '通用'
  )
  const [templates, setTemplates] = useState<{ key: string; name: string; description: string }[]>([])
  const [userTemplates, setUserTemplates] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('selling-point-user-templates') || '{}')
    } catch { return {} }
  })
  const [newTemplateName, setNewTemplateName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  // Load default prompt, templates, and saved custom prompt
  useEffect(() => {
    const saved = localStorage.getItem('selling-point-custom-prompt') || ''
    if (saved) setCustomSystemPrompt(saved)

    getBaseUrl().then(baseUrl => {
      // Load default prompt
      fetch(`${baseUrl}/api/selling-point/prompt`)
        .then(r => r.json())
        .then(data => {
          if (data.system_prompt) {
            setDefaultPrompt(data.system_prompt)
            if (!saved) setCustomSystemPrompt(data.system_prompt)
          }
        })
        .catch(() => {})

      // Load available templates
      fetch(`${baseUrl}/api/selling-point/templates`)
        .then(r => r.json())
        .then(data => {
          if (data.templates) {
            const allTemplates = [...data.templates]
            // Add user templates to the list
            Object.keys(userTemplates).forEach(name => {
              if (!allTemplates.find(t => t.key === name)) {
                allTemplates.push({ key: name, name: name + '（我的）', description: '用户自定义模板' })
              }
            })
            setTemplates(allTemplates)
          }
        })
        .catch(() => {})
    })
  }, [])

  const switchTemplate = async (key: string) => {
    setSelectedTemplate(key)
    localStorage.setItem('selling-point-template', key)

    // Check user templates first
    if (userTemplates[key]) {
      setCustomSystemPrompt(userTemplates[key])
      localStorage.setItem('selling-point-custom-prompt', userTemplates[key])
      return
    }

    // Load from backend
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/selling-point/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.system_prompt) {
          setCustomSystemPrompt(data.system_prompt)
          localStorage.setItem('selling-point-custom-prompt', data.system_prompt)
        }
      }
    } catch { /* ignore */ }
  }

  const savePrompt = (value: string) => {
    setCustomSystemPrompt(value)
    localStorage.setItem('selling-point-custom-prompt', value)
  }

  const resetPrompt = () => {
    setCustomSystemPrompt(defaultPrompt)
    localStorage.removeItem('selling-point-custom-prompt')
    setSelectedTemplate('通用')
    localStorage.setItem('selling-point-template', '通用')
  }

  const saveUserTemplate = () => {
    const name = newTemplateName.trim()
    if (!name || !customSystemPrompt) return
    const updated = { ...userTemplates, [name]: customSystemPrompt }
    setUserTemplates(updated)
    localStorage.setItem('selling-point-user-templates', JSON.stringify(updated))
    setTemplates(prev => {
      const filtered = prev.filter(t => t.key !== name)
      return [...filtered, { key: name, name: name + '（我的）', description: '用户自定义模板' }]
    })
    setSelectedTemplate(name)
    localStorage.setItem('selling-point-template', name)
    setNewTemplateName('')
    setShowSaveDialog(false)
  }

  const deleteUserTemplate = (name: string) => {
    const updated = { ...userTemplates }
    delete updated[name]
    setUserTemplates(updated)
    localStorage.setItem('selling-point-user-templates', JSON.stringify(updated))
    setTemplates(prev => prev.filter(t => t.key !== name))
    if (selectedTemplate === name) {
      setSelectedTemplate('通用')
      localStorage.setItem('selling-point-template', '通用')
    }
  }

  const handleExportTemplate = () => {
    const name = selectedTemplate !== '通用' ? selectedTemplate : '我的模板'
    const data = { name, prompt: customSystemPrompt, exported_at: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.selling-point-template.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportTemplate = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        // Support single template or multi-template array
        const items: { name: string; prompt: string }[] = Array.isArray(data) ? data : [data]
        const updated = { ...userTemplates }
        let imported = 0
        for (const item of items) {
          if (item.name && item.prompt) {
            updated[item.name] = item.prompt
            imported++
          }
        }
        if (imported > 0) {
          setUserTemplates(updated)
          localStorage.setItem('selling-point-user-templates', JSON.stringify(updated))
          setTemplates(prev => {
            const builtins = prev.filter(t => !userTemplates[t.key] || t.key === selectedTemplate)
            const newOnes = Object.keys(updated).map(name => ({
              key: name, name: name + '（我的）', description: '用户自定义模板'
            }))
            return [...builtins.filter(t => !updated[t.key]), ...newOnes]
          })
          setSelectedTemplate(items[0].name)
          localStorage.setItem('selling-point-template', items[0].name)
          setCustomSystemPrompt(items[0].prompt)
          localStorage.setItem('selling-point-custom-prompt', items[0].prompt)
        }
      } catch {
        alert('文件格式不正确，请导入 .json 格式的模板文件')
      }
    }
    input.click()
  }

  // Restore auto-saved result on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('selling-point-autosave')
      if (saved) {
        const data = JSON.parse(saved)
        if (data.result) setResult(data.result)
        if (data.productName) setProductName(data.productName)
        if (data.category) setCategory(data.category)
        if (data.keyFeatures) setKeyFeatures(data.keyFeatures)
        if (data.targetAudience) setTargetAudience(data.targetAudience)
        if (data.priceRange) setPriceRange(data.priceRange)
        if (data.priceTier) setPriceTier(data.priceTier)
        if (data.platforms) setSelectedPlatforms(data.platforms)
        if (data.activeTab) setActiveTab(data.activeTab)
      }
    } catch { /* ignore */ }
  }, [])

  // Auto-save result whenever it changes
  useEffect(() => {
    if (result && result.platforms) {
      localStorage.setItem('selling-point-autosave', JSON.stringify({
        result,
        productName, category, keyFeatures, targetAudience, priceRange, priceTier,
        platforms: selectedPlatforms, activeTab,
        savedAt: new Date().toISOString(),
      }))
    }
  }, [result])

  // Auto-fill from industry scan report
  useEffect(() => {
    if (prefill) {
      setCategory(prefill.category)
      setReportPath(prefill.reportPath)
    }
  }, [prefill])

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  const toggleContentPlatform = (p: string) => {
    setSelectedContentPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    )
  }

  const buildProductSummary = (): string => {
    const parts: string[] = []
    if (productName) parts.push(`**${productName}**`)
    if (category) parts.push(`类目：${category}`)
    if (keyFeatures) parts.push(`卖点：${keyFeatures}`)
    if (targetAudience) parts.push(`人群：${targetAudience}`)
    if (priceRange) parts.push(`价格：${priceRange}`)
    return parts.length > 0 ? parts.join(' | ') : '（请填写产品信息）'
  }

  const handleGenerate = async () => {
    if (!productName || !keyFeatures) return
    setLoading(true)
    setResult(null)
    setRefinementRound(0)
    setRefinementHistory([])
    setQualityOpen(false)
    setBestResult(null)
    setBestScore(null)
    setBestRound(0)

    try {
      const baseUrl = await getBaseUrl()
      const bodyBase = {
        product_name: productName,
        category,
        key_features: keyFeatures,
        target_audience: targetAudience,
        price_range: priceRange,
        price_tier: priceTier,
        pain_points: painPoints,
        my_product_advantage: myProductAdvantage,
        my_product_weakness: myProductWeakness,
        competitor_context: competitorContext,
        brand_tone: brandTone,
        report_path: reportPath,
        template: selectedTemplate,
        custom_system_prompt: customSystemPrompt !== defaultPrompt ? customSystemPrompt : '',
      }

      const hasEcom = selectedPlatforms.length > 0
      const hasContent = selectedContentPlatforms.length > 0

      // Build parallel requests: 1 e-commerce + N content (one per platform)
      const requests: Promise<Response>[] = []
      if (hasEcom) {
        requests.push(fetch(`${baseUrl}/api/selling-point`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bodyBase, platforms: selectedPlatforms, content_platforms: [] }),
        }))
      }
      if (hasContent) {
        for (const cp of selectedContentPlatforms) {
          requests.push(fetch(`${baseUrl}/api/selling-point`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bodyBase, platforms: [], content_platforms: [cp] }),
          }))
        }
      }

      const responses = await Promise.all(requests)
      const results: Result[] = await Promise.all(responses.map(r => r.ok ? r.json() : Promise.resolve({ error: `HTTP ${r.status}` })))

      // Extract results
      const ecomResult = hasEcom ? results[0] : null
      const contentResults = hasContent ? results.slice(hasEcom ? 1 : 0) : []

      // Check for errors — e-commerce failure is fatal, content failures are collected
      if (ecomResult?.error) throw new Error(ecomResult.error)
      const contentErrors: string[] = []
      for (let i = 0; i < contentResults.length; i++) {
        if (contentResults[i]?.error) {
          const platform = selectedContentPlatforms[i] || `content_${i}`
          contentErrors.push(`${platform}: ${contentResults[i].error}`)
        }
      }
      // Only throw if ALL content requests failed
      if (contentErrors.length > 0 && contentErrors.length === contentResults.length && !hasEcom) {
        throw new Error(contentErrors.join('; '))
      }

      // Merge content_assets from all content platform responses
      let mergedContentAssets: Record<string, any> = {}
      const contentReviews: Record<string, QualityReview> = {}
      for (let i = 0; i < contentResults.length; i++) {
        const cr = contentResults[i]
        const srcPlatform = selectedContentPlatforms[i] || `content_${i}`
        if (cr?.content_assets) {
          const ca = cr.content_assets
          const caKeys = Object.keys(ca)
          const isFlat = caKeys.some(k => k === 'social_post' || k === 'video_script')
          if (isFlat) {
            // Normalize flat format to per-platform: {"social_post": {...}} → {"小红书": {"social_post": {...}}}
            mergedContentAssets[srcPlatform] = ca
          } else {
            Object.assign(mergedContentAssets, ca)
          }
        }
        if (cr?.quality_review) {
          const caKeys = cr.content_assets ? Object.keys(cr.content_assets) : []
          const isFlat = caKeys.some(k => k === 'social_post' || k === 'video_script')
          contentReviews[isFlat ? srcPlatform : (caKeys[0] || srcPlatform)] = cr.quality_review
        }
      }
      if (Object.keys(mergedContentAssets).length === 0 && ecomResult?.content_assets) {
        mergedContentAssets = ecomResult.content_assets
      }
      // Surface content errors as a warning in the result
      const contentWarnings = contentErrors.length > 0 ? contentErrors : undefined

      // Build merged result
      const merged: Result = {
        ...(ecomResult || {}),
        content_assets: mergedContentAssets,
        content_reviews: Object.keys(contentReviews).length > 0 ? contentReviews : undefined,
        content_warnings: contentWarnings,
      }

      // Sum token usage from ALL requests
      let totalPrompt = 0, totalCompletion = 0, totalTokens = 0
      for (const r of results) {
        if (r?.token_usage) {
          totalPrompt += r.token_usage.prompt_tokens || 0
          totalCompletion += r.token_usage.completion_tokens || 0
          totalTokens += r.token_usage.total_tokens || 0
        }
      }
      if (totalTokens > 0) {
        merged.token_usage = { prompt_tokens: totalPrompt, completion_tokens: totalCompletion, total_tokens: totalTokens }
      }

      setResult(merged)
      if (merged.platforms) {
        const keys = Object.keys(merged.platforms)
        if (keys.length > 0) setActiveTab(keys[0])
        else if (merged.content_assets) {
          const cKeys = Object.keys(merged.content_assets)
          if (cKeys.length > 0) setActiveTab(cKeys[0])
        }
      } else if (merged.content_assets) {
        const cKeys = Object.keys(merged.content_assets)
        if (cKeys.length > 0) setActiveTab(cKeys[0])
      }
      // Track initial best version
      const score = merged.quality_review?.overall_score ?? null
      if (score != null) {
        setBestResult(merged)
        setBestScore(score)
        setBestRound(0)
      }
    } catch (e: any) {
      setResult({ error: e.message || '请求失败' })
    } finally {
      setLoading(false)
    }
  }

  const [saving, setSaving] = useState(false)
  const [savedPath, setSavedPath] = useState('')
  const [savedRawPath, setSavedRawPath] = useState('')
  const [compareMode, setCompareMode] = useState(false)
  const [refinementRound, setRefinementRound] = useState(0)
  const [refinementHistory, setRefinementHistory] = useState<Array<{round: number; score: number | null; summary: string}>>([])
  const [qualityOpen, setQualityOpen] = useState(false)
  const [bestResult, setBestResult] = useState<Result | null>(null)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [bestRound, setBestRound] = useState(0)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(label)
      setTimeout(() => setCopiedText(''), 1500)
    })
  }

  const handleRegenerate = async (section: string) => {
    if (!result?.platforms || loading) return
    setLoading(true)
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/selling-point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          category,
          key_features: keyFeatures,
          target_audience: targetAudience,
          price_range: priceRange,
          price_tier: priceTier,
          pain_points: painPoints,
          my_product_advantage: myProductAdvantage,
          my_product_weakness: myProductWeakness,
          competitor_context: competitorContext,
          brand_tone: brandTone,
          report_path: reportPath,
          platforms: selectedPlatforms,
          content_platforms: selectedContentPlatforms,
          template: selectedTemplate,
          custom_system_prompt: customSystemPrompt !== defaultPrompt ? customSystemPrompt : '',
          regenerate_section: section,
          existing_result: result,
        }),
      })
      if (resp.ok) {
        const data: Result = await resp.json()
        setResult(data)
      }
    } catch (e: any) {
      setResult({ error: e.message || '局部重生失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleRefine = async () => {
    if (!result?.quality_review?.issues || loading) return
    const issues = result.quality_review.issues
    setLoading(true)
    const prevScore = result.quality_review.overall_score ?? null
    const prevSummary = result.quality_review.summary || ''
    try {
      const baseUrl = await getBaseUrl()
      const bodyBase = {
        product_name: productName,
        category,
        key_features: keyFeatures,
        target_audience: targetAudience,
        price_range: priceRange,
        price_tier: priceTier,
        pain_points: painPoints,
        my_product_advantage: myProductAdvantage,
        my_product_weakness: myProductWeakness,
        competitor_context: competitorContext,
        brand_tone: brandTone,
        report_path: reportPath,
        template: selectedTemplate,
        custom_system_prompt: customSystemPrompt !== defaultPrompt ? customSystemPrompt : '',
        refine_issues: issues,
      }

      const hasEcom = selectedPlatforms.length > 0
      const hasContent = selectedContentPlatforms.length > 0 && result.content_assets && Object.keys(result.content_assets).length > 0

      // Refine e-commerce and content in parallel (1 + N requests)
      const requests: Promise<Response>[] = []
      if (hasEcom) {
        requests.push(fetch(`${baseUrl}/api/selling-point`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...bodyBase, platforms: selectedPlatforms, content_platforms: [], existing_result: result }),
        }))
      }
      if (hasContent) {
        for (const cp of selectedContentPlatforms) {
          requests.push(fetch(`${baseUrl}/api/selling-point`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...bodyBase, platforms: [], content_platforms: [cp], existing_result: result }),
          }))
        }
      }

      const responses = await Promise.all(requests)
      const results: Result[] = await Promise.all(responses.map(r => r.ok ? r.json() : Promise.resolve({ error: `HTTP ${r.status}` })))

      const ecomResult = hasEcom ? results[0] : null
      const contentResults = hasContent ? results.slice(hasEcom ? 1 : 0) : []

      if (ecomResult?.error) throw new Error(ecomResult.error)
      const contentErrors: string[] = []
      for (let i = 0; i < contentResults.length; i++) {
        if (contentResults[i]?.error) {
          const platform = selectedContentPlatforms[i] || `content_${i}`
          contentErrors.push(`${platform}: ${contentResults[i].error}`)
        }
      }

      // Merge content_assets
      let mergedContentAssets: Record<string, any> = {}
      const contentReviews: Record<string, QualityReview> = {}
      for (let i = 0; i < contentResults.length; i++) {
        const cr = contentResults[i]
        const srcPlatform = selectedContentPlatforms[i] || `content_${i}`
        if (cr?.content_assets) {
          const ca = cr.content_assets
          const caKeys = Object.keys(ca)
          const isFlat = caKeys.some(k => k === 'social_post' || k === 'video_script')
          if (isFlat) {
            mergedContentAssets[srcPlatform] = ca
          } else {
            Object.assign(mergedContentAssets, ca)
          }
        }
        if (cr?.quality_review) {
          const caKeys = cr.content_assets ? Object.keys(cr.content_assets) : []
          const isFlat = caKeys.some(k => k === 'social_post' || k === 'video_script')
          contentReviews[isFlat ? srcPlatform : (caKeys[0] || srcPlatform)] = cr.quality_review
        }
      }
      if (Object.keys(mergedContentAssets).length === 0) {
        mergedContentAssets = result.content_assets || {}
      }
      const contentWarnings = contentErrors.length > 0 ? contentErrors : undefined

      const merged: Result = {
        ...(ecomResult || {}),
        content_assets: mergedContentAssets,
        content_reviews: Object.keys(contentReviews).length > 0 ? contentReviews : (result.content_reviews || undefined),
        content_warnings: contentWarnings || result.content_warnings || undefined,
      }
      // Sum token usage from ALL requests
      let totalPrompt = 0, totalCompletion = 0, totalTokens = 0
      for (const r of results) {
        if (r?.token_usage) {
          totalPrompt += r.token_usage.prompt_tokens || 0
          totalCompletion += r.token_usage.completion_tokens || 0
          totalTokens += r.token_usage.total_tokens || 0
        }
      }
      if (totalTokens > 0) {
        merged.token_usage = { prompt_tokens: totalPrompt, completion_tokens: totalCompletion, total_tokens: totalTokens }
      }

      setResult(merged)
      const newRound = refinementRound + 1
      setRefinementRound(newRound)
      setRefinementHistory(prev => [...prev, {
        round: newRound,
        score: prevScore,
        summary: prevSummary,
      }])
      setQualityOpen(true)
      // Track best version
      const newScore = merged.quality_review?.overall_score ?? null
      if (newScore != null && (bestScore == null || newScore > bestScore)) {
        setBestResult(merged)
        setBestScore(newScore)
        setBestRound(newRound)
      }
    } catch (e: any) {
      setResult({ error: e.message || '优化失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!result?.platforms || saving) return
    setSaving(true)
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/selling-point/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName,
          category,
          platforms: Object.keys(result.platforms),
          data: result,
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setSavedPath(data.path)
        if (data.raw_path) setSavedRawPath(data.raw_path)
        localStorage.removeItem('selling-point-autosave')
        setTimeout(() => { setSavedPath(''); setSavedRawPath('') }, 5000)
      }
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Left: Input Panel */}
      <div className="w-96 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200 bg-white">
          <h2 className="text-lg font-bold text-gray-800">卖点整理</h2>
          <p className="text-xs text-gray-500 mt-1">填入产品信息，一键生成多平台主图文案和详情页结构</p>

          {/* Report link indicator */}
          {reportPath ? (
            <div className="mt-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2 py-1 rounded">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="truncate max-w-[180px]">{reportPath.split(/[\\/]/).pop()?.replace('.md', '') || '已关联'}</span>
                <button
                  onClick={() => setReportPath('')}
                  className="text-blue-400 hover:text-blue-600 ml-1"
                  title="取消关联"
                >
                  x
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <button
                onClick={async () => {
                  const filePath = await window.electronAPI?.selectReport()
                  if (filePath) {
                    setReportPath(filePath)
                    const fileName = filePath.split(/[\\/]/).pop()?.replace('.md', '') || ''
                    if (!category && fileName) setCategory(fileName)
                  }
                }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                选择行业摸底报告文件（可选）
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">产品名称 <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="例：宠物专用免洗清洁手套"
              className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">所属类目</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="例：宠物用品 > 清洁护理"
              className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">核心卖点/成分 <span className="text-red-400">*</span></label>
            <textarea
              value={keyFeatures}
              onChange={e => setKeyFeatures(e.target.value)}
              placeholder="例：植物酵素配方、免水洗、一擦即净、对宠物安全无毒、去味+消毒双效"
              rows={3}
              className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">目标人群</label>
            <input
              type="text"
              value={targetAudience}
              onChange={e => setTargetAudience(e.target.value)}
              placeholder="例：25-35岁养宠女性，注重宠物健康"
              className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">价格区间</label>
              <input
                type="text"
                value={priceRange}
                onChange={e => setPriceRange(e.target.value)}
                placeholder="例：¥29.9-49.9 / 盒"
                className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">价格定位</label>
              <div className="flex gap-1.5 mt-1">
                {['高端', '中端', '性价比'].map((tier) => {
                  const active = priceTier === tier
                  const colors: Record<string, string> = {
                    '高端': active ? 'bg-amber-700 text-white border-amber-700' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
                    '中端': active ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
                    '性价比': active ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100',
                  }
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setPriceTier(active ? '' : tier)}
                      className={`flex-1 py-1.5 text-xs rounded-md border font-medium transition-colors ${colors[tier]}`}
                    >
                      {tier}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <details className="group" open={!!reportPath}>
            <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none">
              更多选项（痛点、产品对比、竞品参考、品牌调性）
            </summary>
            <div className="mt-2 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">用户痛点（不填则AI推导）</label>
                <textarea
                  value={painPoints}
                  onChange={e => setPainPoints(e.target.value)}
                  placeholder="例：宠物外出后爪子脏、市面清洁剂有刺激性气味、担心化学成分伤害宠物"
                  rows={2}
                  className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
              <div className="border-t border-gray-200 pt-3">
                <p className="text-xs font-medium text-gray-600 mb-1.5">产品对比（我的产品 vs 行业）</p>
                <label className="text-xs text-gray-500">我的产品优势（比行业/竞品强在哪）</label>
                <textarea
                  value={myProductAdvantage}
                  onChange={e => setMyProductAdvantage(e.target.value)}
                  placeholder="例：比市面产品多了去味功能、欧盟安全认证、价格低30%"
                  rows={2}
                  className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
                <label className="text-xs text-gray-500 mt-2 block">我的产品劣势/行业竞品可攻击点</label>
                <textarea
                  value={myProductWeakness}
                  onChange={e => setMyProductWeakness(e.target.value)}
                  placeholder="例：品牌知名度不如大牌、包装设计偏朴素、暂无抖音渠道运营经验"
                  rows={2}
                  className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">竞品参考（粘贴竞品主图/详情页/差评等）</label>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const baseUrl = await getBaseUrl()
                        const resp = await fetch(`${baseUrl}/api/competitor/library`)
                        if (!resp.ok) return
                        const data = await resp.json()
                        if (!data.items?.length) { alert('灵感库暂无内容，请先在竞品分析中保存'); return }
                        // Build a simple selection menu
                        const items = data.items as { name: string; path: string; category: string }[]
                        const list = items.map((item, i) => `${i + 1}. [${item.category}] ${item.name}`).join('\n')
                        const choice = prompt(`选择要导入的竞品分析：\n\n${list}\n\n输入编号：`)
                        if (!choice) return
                        const idx = parseInt(choice) - 1
                        if (idx < 0 || idx >= items.length) return
                        // Load the analysis
                        const loadResp = await fetch(`${baseUrl}/api/competitor/library/load`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: items[idx].path }),
                        })
                        if (!loadResp.ok) return
                        const loadData = await loadResp.json()
                        const parts: string[] = []
                        if (loadData.selling_points?.length) {
                          parts.push('【提取的卖点】\n' + loadData.selling_points.map((s: string) => `- ${s}`).join('\n'))
                        }
                        if (loadData.usable_ideas?.length) {
                          parts.push('【可借鉴思路】\n' + loadData.usable_ideas.map((s: string) => `- ${s}`).join('\n'))
                        }
                        if (parts.length > 0) {
                          setCompetitorContext(prev => (prev ? prev + '\n\n' : '') + parts.join('\n\n'))
                        }
                      } catch { /* ignore */ }
                    }}
                    className="text-xs text-purple-500 hover:text-purple-700"
                  >
                    从灵感库导入
                  </button>
                </div>
                <textarea
                  value={competitorContext}
                  onChange={e => setCompetitorContext(e.target.value)}
                  placeholder="粘贴竞品文案、行业报告段落、竞品差评痛点等"
                  rows={3}
                  className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">品牌调性</label>
                <input
                  type="text"
                  value={brandTone}
                  onChange={e => setBrandTone(e.target.value)}
                  placeholder="例：专业温和、年轻活力、高端质感"
                  className="w-full mt-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          </details>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">目标平台</label>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    selectedPlatforms.includes(p)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs font-medium text-gray-600 block mb-1">内容平台（图文/视频）</label>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_PLATFORMS.map(p => (
                <button
                  key={p.key}
                  onClick={() => toggleContentPlatform(p.key)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    selectedContentPlatforms.includes(p.key)
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                  }`}
                  title={p.desc}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Prompt Editor */}
        <div className="border-t border-gray-200 bg-white">
          <button
            onClick={() => setShowPromptEditor(!showPromptEditor)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Prompt 配置
            </span>
            <span className={`transform transition-transform text-xs ${showPromptEditor ? 'rotate-90' : ''}`}>&#9654;</span>
          </button>
          {showPromptEditor && (
            <div className="px-4 pb-3 space-y-2">
              {/* Template selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">行业模板：</span>
                <select
                  value={selectedTemplate}
                  onChange={e => switchTemplate(e.target.value)}
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {templates.map(t => (
                    <option key={t.key} value={t.key}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleExportTemplate}
                  className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                  title="导出当前提示词为 JSON 文件"
                >
                  导出
                </button>
                <button
                  onClick={handleImportTemplate}
                  className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                  title="从 JSON 文件导入模板"
                >
                  导入
                </button>
                <button
                  onClick={() => setShowSaveDialog(!showSaveDialog)}
                  className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                  title="保存当前提示词为模板"
                >
                  另存为
                </button>
                {userTemplates[selectedTemplate] && (
                  <button
                    onClick={() => deleteUserTemplate(selectedTemplate)}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0"
                    title="删除此模板"
                  >
                    删除
                  </button>
                )}
              </div>

              {/* Save dialog */}
              {showSaveDialog && (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveUserTemplate()}
                    placeholder="模板名称，如：宠物零食专用"
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                  <button
                    onClick={saveUserTemplate}
                    disabled={!newTemplateName.trim()}
                    className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
                  >
                    保存
                  </button>
                </div>
              )}

              <p className="text-xs text-gray-400">修改 AI 角色设定和输出要求。行业术语、文案偏好可以在这里调整。</p>
              <textarea
                value={customSystemPrompt}
                onChange={e => savePrompt(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                style={{ minHeight: '120px' }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {customSystemPrompt.length} 字{customSystemPrompt !== defaultPrompt && '（已修改）'}
                </span>
                {customSystemPrompt !== defaultPrompt && (
                  <button
                    onClick={resetPrompt}
                    className="text-xs text-orange-500 hover:text-orange-700"
                  >
                    恢复默认
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-white">
          <button
            onClick={handleGenerate}
            disabled={loading || !productName || !keyFeatures}
            className="w-full py-2 rounded-md text-sm font-medium transition-colors disabled:bg-gray-300 disabled:text-gray-500 bg-blue-600 text-white hover:bg-blue-700"
          >
            {loading ? '生成中...' : '生成文案'}
          </button>
        </div>
      </div>

      {/* Right: Output Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-gray-600 text-sm font-medium">正在生成 {buildProductSummary()} 的文案</p>
              <p className="text-gray-400 text-xs mt-1">
                {selectedPlatforms.length > 0 && selectedContentPlatforms.length > 0
                  ? `电商（${selectedPlatforms.length}平台）+ 内容（${selectedContentPlatforms.length}平台）并行生成中`
                  : selectedPlatforms.length > 0
                    ? `电商平台文案生成中（${selectedPlatforms.length}个）`
                    : `内容平台资产生成中（${selectedContentPlatforms.length}个）`}
              </p>
              <p className="text-gray-400 text-xs mt-1">
                已耗时 {Math.floor(elapsedSeconds / 60)}分{elapsedSeconds % 60}秒
                {elapsedSeconds > 120 && <span className="text-amber-500"> · 全平台生成中，请耐心等待</span>}
              </p>
            </div>
          </div>
        )}

        {!loading && result?.error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-red-500">
              <p className="text-lg mb-2">生成失败</p>
              <p className="text-sm">{result.error}</p>
              {result.raw && (
                <details className="mt-3 text-left">
                  <summary className="text-xs cursor-pointer">查看原始返回</summary>
                  <pre className="text-xs mt-1 max-w-lg overflow-auto bg-gray-100 p-2 rounded text-left">{result.raw}</pre>
                </details>
              )}
            </div>
          </div>
        )}

        {!loading && result?.platforms && (
          <>
            {/* Top bar: save + keywords */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                {result.keywords && result.keywords.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium text-gray-500">投放关键词</span>
                      <button
                        onClick={() => copyToClipboard(result.keywords!.join('、'), 'keywords')}
                        className="text-xs text-blue-500 hover:text-blue-700"
                      >
                        {copiedText === 'keywords' ? '已复制' : '复制全部'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {result.keywords.map((kw, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs rounded-md font-medium transition-colors bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 shrink-0"
              >
                {saving ? '保存中...' : savedPath ? '已保存' : '保存到 Obsidian'}
              </button>
              <button
                onClick={() => {
                  setResult(null)
                  setSavedPath('')
                  setSavedRawPath('')
                  localStorage.removeItem('selling-point-autosave')
                }}
                className="px-3 py-1.5 text-xs rounded-md font-medium transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 shrink-0"
                title="清除当前结果"
              >
                清除
              </button>
            </div>
            {savedPath && (
              <div className="px-6 py-2 bg-green-50 border-b border-green-200 text-xs text-green-700 space-y-0.5">
                <div>已保存至：{savedPath}</div>
                {savedRawPath && (
                  <div className="text-green-600">AI初稿（版本追踪）：{savedRawPath}</div>
                )}
              </div>
            )}

            {/* FAB Platform Notes */}
            {result.fab_platform_notes && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
                <p className="text-xs font-medium text-amber-800 mb-1">跨平台FAB差异说明</p>
                <p className="text-sm text-amber-900 leading-relaxed">{result.fab_platform_notes}</p>
              </div>
            )}

            {/* Quality Review */}
            {result.quality_review && (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <details className="group" open={qualityOpen} onToggle={(e) => setQualityOpen(e.currentTarget.open)}>
                  <summary className="flex items-center gap-2 cursor-pointer select-none">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                      (result.quality_review.overall_score ?? 100) >= 80 ? 'bg-green-100 text-green-700' :
                      (result.quality_review.overall_score ?? 100) >= 60 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {result.quality_review.overall_score != null ? `${result.quality_review.overall_score}分` : 'N/A'}
                    </span>
                    <span className="text-xs text-gray-600">{result.quality_review.summary || 'AI 质量自检报告'}</span>
                    {refinementRound > 0 && (
                      <span className="text-xs text-blue-500 font-medium">已优化 {refinementRound} 轮</span>
                    )}
                    {bestScore != null && result.quality_review?.overall_score === bestScore && (
                      <span className="text-xs text-green-600 font-medium">★ 最佳</span>
                    )}
                    {result.token_usage && (
                      <span className="text-xs text-gray-400 ml-auto mr-2" title={`提示词 ${result.token_usage.prompt_tokens.toLocaleString()} token · 生成 ${result.token_usage.completion_tokens.toLocaleString()} token`}>
                        {result.token_usage.total_tokens.toLocaleString()} token
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto group-open:hidden">展开</span>
                    <span className="text-xs text-gray-400 ml-auto hidden group-open:inline">收起</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {/* Refinement history */}
                    {refinementHistory.length > 0 && (
                      <div className="p-2 bg-blue-50 rounded border border-blue-200">
                        <p className="text-xs font-medium text-blue-600 mb-1">优化历史</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {refinementHistory.map((h) => (
                            <span key={h.round} className="text-xs text-blue-800">
                              第{h.round}轮：{h.score != null ? `${h.score}分` : 'N/A'}
                            </span>
                          ))}
                          <span className="text-xs text-blue-800 font-medium">
                            → 当前：{result.quality_review?.overall_score != null ? `${result.quality_review.overall_score}分` : 'N/A'}
                            {refinementHistory.length > 0 && result.quality_review?.overall_score != null && refinementHistory[0].score != null && (
                              <span className={result.quality_review.overall_score - refinementHistory[0].score >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {' '}({result.quality_review.overall_score - refinementHistory[0].score >= 0 ? '+' : ''}{result.quality_review.overall_score - refinementHistory[0].score})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    {result.quality_review.issues && result.quality_review.issues.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">问题清单</p>
                        {result.quality_review.issues.map((iss, i) => (
                          <div key={i} className="flex items-start gap-2 mb-1.5 text-xs">
                            <span className={`shrink-0 mt-0.5 ${
                              iss.severity === 'error' ? 'text-red-500' :
                              iss.severity === 'warning' ? 'text-yellow-500' : 'text-blue-500'
                            }`}>
                              {iss.severity === 'error' ? '🔴' : iss.severity === 'warning' ? '🟡' : '🔵'}
                            </span>
                            <div>
                              <span className="font-medium text-gray-700">{iss.section}</span>
                              <span className="text-gray-600"> — {iss.problem}</span>
                              {iss.suggestion && (
                                <p className="text-gray-500 mt-0.5">→ {iss.suggestion}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {result.quality_review.strengths && result.quality_review.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-600 mb-1">亮点</p>
                        {result.quality_review.strengths.map((s, i) => (
                          <p key={i} className="text-xs text-gray-600">• {s}</p>
                        ))}
                      </div>
                    )}
                    {result.quality_review.need_human_check && result.quality_review.need_human_check.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-orange-600 mb-1">人工需确认</p>
                        {result.quality_review.need_human_check.map((c, i) => (
                          <p key={i} className="text-xs text-gray-600 flex items-start gap-1">
                            <input type="checkbox" className="mt-0.5 shrink-0" readOnly />
                            <span>{c}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {/* Restore best version */}
                    {bestResult && result.quality_review?.overall_score !== bestScore && bestScore != null && (
                      <button
                        onClick={() => {
                          setResult(bestResult)
                          setQualityOpen(true)
                        }}
                        className="mt-2 w-full py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-300 hover:bg-green-100 rounded-md transition-colors"
                      >
                        恢复到最佳版本（第{bestRound}轮 · {bestScore}分）
                      </button>
                    )}
                    {/* Refine button */}
                    {result.quality_review.issues && result.quality_review.issues.length > 0 && (
                      <button
                        onClick={handleRefine}
                        disabled={loading}
                        className="mt-2 w-full py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-md transition-colors"
                      >
                        {loading ? '优化中...' : `🔄 根据自检问题优化${refinementRound > 0 ? `（第${refinementRound + 1}轮）` : ''}`}
                      </button>
                    )}
                    {/* Scoring note */}
                    <p className="text-xs text-gray-400 leading-relaxed pt-1 border-t border-gray-200">
                      AI自检分数仅供参考，不代表文案真实效果。第一轮通常在60-75分，优化1-2轮后可稳定在80-88分。90分以上极难达到——AI无法真正判断"这个钩子能否打动人""这个策略是否适合你的客群"。人工判断始终是最后一道关。
                    </p>
                  </div>
                </details>
              </div>
            )}

            {/* Platform Tabs */}
            <div className="flex border-b border-gray-200 bg-white px-4 items-center">
              <div className="flex">
                {Object.keys(result.platforms).map(p => (
                  <button
                    key={p}
                    onClick={() => { setActiveTab(p); setCompareMode(false) }}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeTab === p && !compareMode
                        ? `border-blue-600 text-blue-600`
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {result.content_assets && Object.keys(result.content_assets).map(cp => {
                  // Map flat-format keys to friendly names for display
                  const isFlatKey = cp === 'social_post' || cp === 'video_script'
                  const displayName = cp === 'social_post' ? '图文种草' : cp === 'video_script' ? '视频脚本' : cp
                  const tabColor = isFlatKey ? 'bg-purple-500' : (CONTENT_PLATFORM_TAB_COLORS[cp] || 'bg-purple-500')
                  const isActive = activeTab === cp && !compareMode
                  const review = result.content_reviews?.[cp]
                  const score = review?.overall_score ?? null
                  return (
                    <button
                      key={cp}
                      onClick={() => { setActiveTab(cp); setCompareMode(false) }}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                        isActive
                          ? `border-purple-600 text-purple-600`
                          : 'border-transparent text-gray-500 hover:text-purple-700'
                      }`}
                    >
                      {displayName}
                      {review ? (
                        score != null ? (
                          <span className={`text-[10px] px-1 rounded-full font-bold ${
                            isActive ? 'bg-purple-100 text-purple-700' : score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {score}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1 rounded-full font-bold bg-gray-100 text-gray-500">?</span>
                        )
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`ml-auto px-3 py-1 text-xs rounded-md transition-colors ${
                  compareMode
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-blue-600 border border-gray-200'
                }`}
              >
                {compareMode ? '退出对比' : '对比模式'}
              </button>
            </div>

            {/* Comparison View */}
            {compareMode && (
              <div className="flex-1 overflow-auto p-4">
                <CompareView platforms={result.platforms} />
              </div>
            )}

            {/* E-commerce Platform Content */}
            {!compareMode && result.platforms && result.platforms[activeTab] && (
              <div className="flex-1 overflow-auto p-6 space-y-6">
                <ErrorBoundary>
                  <PlatformPanel
                    platform={activeTab}
                    data={result.platforms[activeTab]}
                    copiedText={copiedText}
                    onCopy={copyToClipboard}
                    onRegenerate={handleRegenerate}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* Content Platform View (single platform) */}
            {!compareMode && result.content_assets && result.content_assets[activeTab] && (() => {
              const asset = result.content_assets![activeTab]
              const review = result.content_reviews?.[activeTab]
              // Handle both per-platform format ({小红书: {social_post: {...}}}) and flat format ({social_post: {...}})
              const isFlat = activeTab === 'social_post' || activeTab === 'video_script'
              const sp = isFlat ? (activeTab === 'social_post' ? (asset as unknown as SocialPost) : undefined) : asset.social_post
              const vs = isFlat ? (activeTab === 'video_script' ? (asset as unknown as VideoScript) : undefined) : asset.video_script
              return (
                <div className="flex-1 overflow-auto p-6 space-y-6">
                  {result.content_warnings && result.content_warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
                      <p className="font-medium mb-1">以下平台生成失败：</p>
                      {result.content_warnings.map((w, i) => <p key={i}>- {w}</p>)}
                    </div>
                  )}
                  {/* Content review */}
                  {review && (() => {
                    const score = review.overall_score
                    const hasValidScore = score != null && typeof score === 'number'
                    const scoreColor = hasValidScore
                      ? (score >= 80 ? 'text-green-600 bg-green-50' : score >= 60 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50')
                      : 'text-gray-500 bg-gray-100'
                    return (
                      <details className="text-xs border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <summary className="font-medium text-gray-700 cursor-pointer flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded font-bold text-xs ${scoreColor}`}>
                            {hasValidScore ? `${score}分` : '评分失败'}
                          </span>
                          {review.summary || '内容质量评分'}
                        </summary>
                        {review.issues && review.issues.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {review.issues.map((iss, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                                  iss.severity === 'error' ? 'bg-red-400' : iss.severity === 'warning' ? 'bg-yellow-400' : 'bg-blue-400'
                                }`} />
                                <span className="text-gray-600">{iss.problem} → <span className="text-gray-500">{iss.suggestion}</span></span>
                              </div>
                            ))}
                          </div>
                        )}
                        {review.strengths && review.strengths.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {review.strengths.map((s, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[11px]">{s}</span>
                            ))}
                          </div>
                        )}
                      </details>
                    )
                  })()}
                  <ErrorBoundary>
                    {sp && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-pink-500" />
                          <h3 className="text-base font-bold text-gray-800">图文种草模板</h3>
                        </div>
                        <SocialPostView data={sp} />
                      </>
                    )}
                    {vs && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <h3 className="text-base font-bold text-gray-800">短视频脚本</h3>
                        </div>
                        <VideoScriptView data={vs} />
                      </>
                    )}
                    {!sp && !vs && (
                      <p className="text-sm text-gray-400">该平台暂无内容数据</p>
                    )}
                  </ErrorBoundary>
                </div>
              )
            })()}
          </>
        )}

        {!loading && !result && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            填写产品信息后点击"生成文案"即可
          </div>
        )}
      </div>
    </div>
  )
}

function PlatformPanel({
  platform,
  data,
  copiedText,
  onCopy,
  onRegenerate,
}: {
  platform: string
  data: PlatformOutput
  copiedText: string
  onCopy: (text: string, label: string) => void
  onRegenerate: (section: string) => void
}) {

  const RegenerateBtn = ({ section, label }: { section: string; label: string }) => (
    <button
      onClick={() => onRegenerate(`${platform}.${section}`)}
      className="text-xs text-blue-400 hover:text-white hover:bg-orange-500 px-1.5 py-0.5 rounded transition-colors ml-auto shrink-0"
      title={`重新生成${label}`}
    >
      &#x21bb; 重做
    </button>
  )
  const colorClass = PLATFORM_COLORS[platform] || 'border-gray-300 bg-gray-50'

  const collectAllCopy = (): string => {
    const lines: string[] = []
    if (data.main_images?.length) {
      lines.push(`【${platform} 主图文案】`)
      data.main_images.forEach((m, i) => lines.push(`${i + 1}. ${m}`))
      lines.push('')
    }
    if (data.selling_points?.length) {
      lines.push('【FAB 卖点拆解】')
      data.selling_points.forEach((sp, i) => {
        lines.push(`${i + 1}. F（特点）：${sp.feature}`)
        lines.push(`   A（优势）：${sp.advantage}`)
        const benefitText = typeof sp.benefit === 'string' ? sp.benefit : `功能：${sp.benefit?.functional || ''} | 情绪：${sp.benefit?.emotional || ''}`
        lines.push(`   B（利益）：${benefitText}`)
        if (sp.platform_adaptation) lines.push(`   平台适配：${sp.platform_adaptation}`)
      })
      lines.push('')
    }
    if (data.detail_page?.length) {
      lines.push('【详情页排版与文案】')
      data.detail_page.forEach((s, i) => {
        lines.push(`\n第${i + 1}屏：${s.title}`)
        if (s.layout) lines.push(`排版：${s.layout}`)
        const text = s.subtitle || s.copy || s.content || ''
        if (text) lines.push(`文案：${text}`)
        if (s.visual || s.visual_description) lines.push(`视觉：${s.visual || s.visual_description}`)
        if (s.tips) lines.push(`建议：${s.tips}`)
      })
    }
    if (data.design_brief) {
      lines.push('\n【主图设计简报】')
      if (data.design_brief.layout_style) lines.push(`构图类型：${data.design_brief.layout_style}`)
      if (data.design_brief.colors) lines.push(`配色方案：${data.design_brief.colors}`)
      if (data.design_brief.font_style) lines.push(`字体建议：${data.design_brief.font_style}`)
      if (data.design_brief.image_direction) lines.push(`画面方向：${data.design_brief.image_direction}`)
      if (data.design_brief.text_placement) lines.push(`文案排布：${data.design_brief.text_placement}`)
      if (data.design_brief.notes) lines.push(`平台提醒：${data.design_brief.notes}`)
    }
    if (data.additional_images?.length) {
      lines.push('\n【附图设计】')
      data.additional_images.forEach((img) => {
        lines.push(`\n${img.position} — ${img.purpose}`)
        if (img.layout_style) lines.push(`  构图：${img.layout_style}`)
        if (img.colors) lines.push(`  配色：${img.colors}`)
        if (img.image_direction) lines.push(`  画面方向：${img.image_direction}`)
        if (img.text_overlay) lines.push(`  文案叠加：${img.text_overlay}`)
        if (img.notes) lines.push(`  提醒：${img.notes}`)
      })
    }
    return lines.join('\n')
  }

  return (
    <>
      {/* Copy All Button */}
      <div className="flex justify-end">
        <button
          onClick={() => onCopy(collectAllCopy(), `${platform}-all`)}
          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          {copiedText === `${platform}-all` ? '已复制' : '复制全部内容'}
        </button>
      </div>

      {/* Main Image Copy */}
      {data.main_images?.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${PLATFORM_TAB_COLORS[platform] || 'bg-gray-400'}`} />
            主图文案
            <RegenerateBtn section="main_images" label="主图文案" />
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {data.main_images.map((text, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${colorClass} group`}
              >
                <span className="text-xs font-bold text-gray-400 mt-0.5 min-w-[20px]">{i + 1}</span>
                <span className="text-sm text-gray-800 flex-1">{text}</span>
                <button
                  onClick={() => onCopy(text, `${platform}-img-${i}`)}
                  className="text-xs text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  {copiedText === `${platform}-img-${i}` ? '已复制' : '复制'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FAB Selling Points */}
      {data.selling_points?.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${PLATFORM_TAB_COLORS[platform] || 'bg-gray-400'}`} />
            FAB 卖点拆解
            <RegenerateBtn section="selling_points" label="FAB卖点拆解" />
          </h3>
          <div className="space-y-3">
            {data.selling_points.map((sp, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">F 特点</span>
                    <p className="mt-1 text-gray-800">{sp.feature}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">A 优势</span>
                    <p className="mt-1 text-gray-800">{sp.advantage}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">B 利益</span>
                    {typeof sp.benefit === 'string' ? (
                      <p className="mt-1 text-gray-800">{sp.benefit}</p>
                    ) : (
                      <div className="mt-1 space-y-0.5">
                        {sp.benefit?.functional && (
                          <p className="text-gray-800 text-sm"><span className="text-orange-500 font-medium">功能：</span>{sp.benefit.functional}</p>
                        )}
                        {sp.benefit?.emotional && (
                          <p className="text-gray-800 text-sm"><span className="text-orange-500 font-medium">情绪：</span>{sp.benefit.emotional}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {sp.use_scenario && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-purple-500 font-medium">场景化视角 (JTBD)</span>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{sp.use_scenario}</p>
                  </div>
                )}
                {sp.pas_copy && (sp.pas_copy.problem || sp.pas_copy.solve) && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-pink-500 font-medium">PAS 文案（内容平台适用）</span>
                    <div className="mt-1 space-y-1 text-xs">
                      {sp.pas_copy.problem && (
                        <p className="text-gray-700"><span className="font-medium text-red-400">P 痛点：</span>{sp.pas_copy.problem}</p>
                      )}
                      {sp.pas_copy.agitate && (
                        <p className="text-gray-700"><span className="font-medium text-orange-400">A 放大：</span>{sp.pas_copy.agitate}</p>
                      )}
                      {sp.pas_copy.solve && (
                        <p className="text-gray-700"><span className="font-medium text-green-500">S 方案：</span>{sp.pas_copy.solve}</p>
                      )}
                    </div>
                  </div>
                )}
                {sp.platform_adaptation && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">为什么在这个平台这样讲：</span>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{sp.platform_adaptation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pain Point Mining */}
      {data.pain_point_mining && data.pain_point_mining.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            竞品差评反向挖掘
          </h3>
          <div className="space-y-3">
            {data.pain_point_mining.map((item, i) => (
              <div key={i} className="bg-white border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm text-red-700 font-medium">"{item.pain_point}"</p>
                    <div className="mt-2 ml-1 pl-2 border-l-2 border-red-200 space-y-1.5">
                      <div>
                        <span className="text-xs text-gray-400">深层需求</span>
                        <p className="text-sm text-gray-700">{item.deep_need}</p>
                      </div>
                      <div>
                        <span className="text-xs text-green-500">我们的解法</span>
                        <p className="text-sm text-gray-700">{item.our_solution}</p>
                      </div>
                      <div>
                        <span className="text-xs text-blue-500">文案暗示方向</span>
                        <p className="text-sm text-gray-600 italic">"{item.copy_hint}"</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detail Page Structure */}
      {data.detail_page?.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${PLATFORM_TAB_COLORS[platform] || 'bg-gray-400'}`} />
            详情页排版与文案（AIDA 框架）
            <RegenerateBtn section="detail_page" label="详情页" />
          </h3>
          <div className="space-y-3">
            {data.detail_page.map((screen, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-bold text-white bg-gray-500 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <h4 className="font-bold text-gray-800 text-base">{screen.title}</h4>
                  {screen.layout && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-auto">{screen.layout}</span>
                  )}
                </div>
                {(screen.subtitle || screen.copy || screen.content) && (
                  <div className="ml-8 p-3 bg-gray-50 rounded-md border border-gray-100">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {screen.subtitle || screen.copy || screen.content}
                    </p>
                  </div>
                )}
                <div className="ml-8 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {(screen.visual || screen.visual_description) && (
                    <p className="text-xs text-purple-500">
                      <span className="font-medium">视觉：</span>{screen.visual || screen.visual_description}
                    </p>
                  )}
                  {screen.tips && (
                    <p className="text-xs text-blue-500">
                      {screen.tips}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Design Brief */}
      {data.design_brief && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            主图设计简报
            <RegenerateBtn section="design_brief" label="主图设计简报" />
          </h3>
          <div className="bg-white border border-purple-200 rounded-lg p-4 space-y-3">
            {data.design_brief.layout_style && (
              <div className="flex gap-3">
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 w-20 text-center">构图类型</span>
                <p className="text-sm text-gray-700">{data.design_brief.layout_style}</p>
              </div>
            )}
            {data.design_brief.colors && (
              <div className="flex gap-3">
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 w-20 text-center">配色方案</span>
                <p className="text-sm text-gray-700">{data.design_brief.colors}</p>
              </div>
            )}
            {data.design_brief.font_style && (
              <div className="flex gap-3">
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 w-20 text-center">字体建议</span>
                <p className="text-sm text-gray-700">{data.design_brief.font_style}</p>
              </div>
            )}
            {data.design_brief.image_direction && (
              <div className="flex gap-3">
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 w-20 text-center">画面方向</span>
                <p className="text-sm text-gray-700">{data.design_brief.image_direction}</p>
              </div>
            )}
            {data.design_brief.text_placement && (
              <div className="flex gap-3">
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 w-20 text-center">文案排布</span>
                <p className="text-sm text-gray-700">{data.design_brief.text_placement}</p>
              </div>
            )}
            {data.design_brief.notes && (
              <div className="flex gap-3">
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0 w-20 text-center">平台提醒</span>
                <p className="text-sm text-gray-700">{data.design_brief.notes}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Additional Images */}
      {data.additional_images && data.additional_images.length > 0 && (
        <section>
          <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            附图设计（共{data.additional_images.length}张）
          </h3>
          <div className="space-y-3">
            {data.additional_images.map((img, i) => (
              <div key={i} className="bg-white border border-teal-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-white bg-teal-500 px-2 py-0.5 rounded">{img.position}</span>
                  <span className="text-xs text-teal-600 font-medium">{img.purpose}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {img.layout_style && (
                    <div>
                      <span className="text-xs text-gray-400">构图</span>
                      <p className="text-gray-700">{img.layout_style}</p>
                    </div>
                  )}
                  {img.colors && (
                    <div>
                      <span className="text-xs text-gray-400">配色</span>
                      <p className="text-gray-700">{img.colors}</p>
                    </div>
                  )}
                  {img.image_direction && (
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">画面方向 / 出图关键词</span>
                      <p className="text-gray-700">{img.image_direction}</p>
                    </div>
                  )}
                  {img.text_overlay && (
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">文案叠加</span>
                      <p className="text-gray-700">{img.text_overlay}</p>
                    </div>
                  )}
                </div>
                {img.notes && (
                  <p className="text-xs text-blue-500 mt-2">{img.notes}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function CompareView({ platforms }: { platforms: Record<string, PlatformOutput> }) {
  const platformNames = Object.keys(platforms)
  if (platformNames.length < 2) return null

  return (
    <div className="space-y-4">
      {/* Main Images comparison */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-2">主图文案对比</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 border border-gray-200 w-16">序号</th>
                {platformNames.map(p => (
                  <th key={p} className="text-left p-2 border border-gray-200 font-medium">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(...platformNames.map(p => platforms[p]?.main_images?.length || 0)) }).map((_, i) => (
                <tr key={i}>
                  <td className="p-2 border border-gray-200 text-gray-400">{i + 1}</td>
                  {platformNames.map(p => (
                    <td key={p} className="p-2 border border-gray-200">
                      {platforms[p]?.main_images?.[i] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAB comparison */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-2">FAB 卖点对比</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 border border-gray-200 w-16">序号</th>
                {platformNames.map(p => (
                  <th key={p} className="text-left p-2 border border-gray-200 font-medium">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(...platformNames.map(p => platforms[p]?.selling_points?.length || 0)) }).map((_, i) => (
                <tr key={i}>
                  <td className="p-2 border border-gray-200 text-gray-400 align-top">{i + 1}</td>
                  {platformNames.map(p => {
                    const sp = platforms[p]?.selling_points?.[i]
                    if (!sp) return <td key={p} className="p-2 border border-gray-200 text-gray-300">—</td>
                    return (
                      <td key={p} className="p-2 border border-gray-200 align-top">
                        <div className="space-y-0.5">
                          <div><span className="text-blue-500">F:</span> {sp.feature}</div>
                          <div><span className="text-green-500">A:</span> {sp.advantage}</div>
                          <div>
                            <span className="text-orange-500">B:</span>{' '}
                            {typeof sp.benefit === 'string' ? sp.benefit : `${sp.benefit?.functional || ''}${sp.benefit?.emotional ? ' | ' + sp.benefit.emotional : ''}`}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail page titles comparison */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-2">详情页结构对比</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 border border-gray-200 w-16">屏</th>
                {platformNames.map(p => (
                  <th key={p} className="text-left p-2 border border-gray-200 font-medium">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(...platformNames.map(p => platforms[p]?.detail_page?.length || 0)) }).map((_, i) => (
                <tr key={i}>
                  <td className="p-2 border border-gray-200 text-gray-400 align-top">{i + 1}</td>
                  {platformNames.map(p => {
                    const screen = platforms[p]?.detail_page?.[i]
                    if (!screen) return <td key={p} className="p-2 border border-gray-200 text-gray-300">—</td>
                    return (
                      <td key={p} className="p-2 border border-gray-200 align-top">
                        <div className="font-medium text-gray-800">{screen.title}</div>
                        <div className="text-gray-500 mt-0.5">{screen.subtitle || screen.copy || screen.content}</div>
                        {screen.layout && <div className="text-gray-400 mt-0.5">排版：{screen.layout}</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const CONTENT_PLATFORM_COLORS: Record<string, string> = {
  '小红书': 'border-pink-400 bg-pink-50 text-pink-700',
  '公众号': 'border-green-400 bg-green-50 text-green-700',
  '抖音内容': 'border-cyan-400 bg-cyan-50 text-cyan-700',
  '快手': 'border-orange-400 bg-orange-50 text-orange-700',
  '视频号': 'border-blue-400 bg-blue-50 text-blue-700',
  'B站': 'border-purple-400 bg-purple-50 text-purple-700',
}

const CONTENT_PLATFORM_TAB_COLORS: Record<string, string> = {
  '小红书': 'bg-pink-500',
  '公众号': 'bg-green-500',
  '抖音内容': 'bg-cyan-500',
  '快手': 'bg-orange-500',
  '视频号': 'bg-blue-500',
  'B站': 'bg-purple-500',
}

function SocialPostView({ data }: { data: SocialPost }) {
  return (
    <section>
      {data.post_types && data.post_types.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {data.post_types.map((t, i) => (
            <span key={i} className="px-2 py-0.5 text-xs bg-pink-50 text-pink-600 rounded-full border border-pink-200">
              {t}
            </span>
          ))}
        </div>
      )}

      {data.titles && Array.isArray(data.titles) && data.titles.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">标题选项（A/B测试用）</p>
          <div className="space-y-1.5">
            {data.titles.map((t: any, i: number) =>
              typeof t === 'object' && t !== null ? (
                <div key={i} className="flex items-start gap-2 p-2 bg-pink-50 rounded-md">
                  <span className="text-xs bg-pink-200 text-pink-700 px-1.5 py-0.5 rounded shrink-0">{String(t.type || '')}</span>
                  <span className="text-sm text-gray-800">{String(t.text || '')}</span>
                </div>
              ) : <span key={i} className="text-sm text-gray-800">{String(t)}</span>
            )}
          </div>
        </div>
      )}

      {data.body_framework && (
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg">
          <p className="text-xs font-medium text-gray-500 mb-2">正文框架</p>
          {data.body_framework.hook_opening && (
            <div className="mb-3">
              <span className="text-xs text-red-500 font-medium">开头钩子（前3行）</span>
              <p className="text-sm text-gray-700 mt-0.5">{data.body_framework.hook_opening}</p>
            </div>
          )}
          {data.body_framework.body_flow && (
            <div className="mb-3">
              <span className="text-xs text-blue-500 font-medium">正文逻辑流</span>
              <ol className="mt-1 space-y-0.5">
                {data.body_framework.body_flow.map((step, i) => (
                  <li key={i} className="text-sm text-gray-700 ml-4 list-decimal">{step}</li>
                ))}
              </ol>
            </div>
          )}
          {data.body_framework.closing_cta && (
            <div>
              <span className="text-xs text-green-500 font-medium">结尾引导</span>
              <p className="text-sm text-gray-700 mt-0.5">{data.body_framework.closing_cta}</p>
            </div>
          )}
        </div>
      )}

      {data.hashtags && data.hashtags.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-1.5">标签策略</p>
          <div className="flex flex-wrap gap-1.5">
            {data.hashtags.map((h, i) => (
              <span key={i} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full border border-blue-200"
                title={h.purpose}>
                {h.tag} <span className="text-blue-400">({h.purpose})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.image_plan && (
        <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
          <p className="text-xs font-medium text-purple-600 mb-2">配图方案</p>
          {data.image_plan.ratio && (
            <p className="text-xs text-gray-600 mb-1">比例：{data.image_plan.ratio}</p>
          )}
          {data.image_plan.cover && (
            <div className="mb-1">
              <span className="text-xs text-purple-500">封面：</span>
              <span className="text-sm text-gray-700">{data.image_plan.cover}</span>
            </div>
          )}
          {data.image_plan.images && data.image_plan.images.map((img, i) => (
            <div key={i} className="mb-0.5">
              <span className="text-xs text-purple-500">图{i + 2}：</span>
              <span className="text-sm text-gray-700">{img}</span>
            </div>
          ))}
          {data.image_plan.design_notes && (
            <p className="text-xs text-gray-500 mt-1">{data.image_plan.design_notes}</p>
          )}
        </div>
      )}

      {data.seo_tips && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs font-medium text-amber-700 mb-1">SEO 优化建议</p>
          <p className="text-sm text-amber-800">{data.seo_tips}</p>
        </div>
      )}
    </section>
  )
}

function VideoScriptView({ data }: { data: VideoScript }) {
  return (
    <section>
      <div className="flex flex-wrap gap-3 mb-4">
        {data.video_type && (
          <span className="px-2 py-0.5 text-xs bg-red-50 text-red-600 rounded-full border border-red-200">
            类型：{data.video_type}
          </span>
        )}
        {data.suggested_duration && (
          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
            时长：{data.suggested_duration}
          </span>
        )}
      </div>

      {data.hook_variants && data.hook_variants.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">黄金3秒钩子方向（3选1）</p>
          <div className="space-y-1.5">
            {data.hook_variants.map((h, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-red-50 rounded-md">
                <span className="text-xs font-bold text-red-500 shrink-0 w-5">{i + 1}.</span>
                <span className="text-sm text-gray-800">{h}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.script_outline && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-medium text-gray-500 mb-1">脚本大纲</p>
          <p className="text-sm text-gray-700">{data.script_outline}</p>
        </div>
      )}

      {data.shot_list && data.shot_list.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">分镜脚本（照着拍）</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 p-1.5 text-left w-8">#</th>
                  <th className="border border-gray-200 p-1.5 text-left w-12">时长</th>
                  <th className="border border-gray-200 p-1.5 text-left w-12">景别</th>
                  <th className="border border-gray-200 p-1.5 text-left w-16">运镜</th>
                  <th className="border border-gray-200 p-1.5 text-left">画面内容</th>
                  <th className="border border-gray-200 p-1.5 text-left">口播/配音</th>
                  <th className="border border-gray-200 p-1.5 text-left">字幕</th>
                  <th className="border border-gray-200 p-1.5 text-left w-20">BGM/音效</th>
                </tr>
              </thead>
              <tbody>
                {data.shot_list.map((shot) => (
                  <tr key={shot.shot_number} className="hover:bg-gray-50">
                    <td className="border border-gray-200 p-1.5 text-center font-medium">{shot.shot_number}</td>
                    <td className="border border-gray-200 p-1.5">{shot.duration || '—'}</td>
                    <td className="border border-gray-200 p-1.5">{shot.scene_type || '—'}</td>
                    <td className="border border-gray-200 p-1.5 text-gray-600">{shot.camera_move || '—'}</td>
                    <td className="border border-gray-200 p-1.5">{shot.visual_description || '—'}</td>
                    <td className="border border-gray-200 p-1.5 text-gray-700">{shot.voiceover || '—'}</td>
                    <td className="border border-gray-200 p-1.5 text-blue-600">{shot.text_overlay || '—'}</td>
                    <td className="border border-gray-200 p-1.5 text-gray-500 text-xs">{shot.bgm_sfx || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.performance_notes && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">出镜建议</p>
          <p className="text-sm text-blue-800">{data.performance_notes}</p>
        </div>
      )}

      {data.shooting_tips && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <p className="text-xs font-medium text-green-600 mb-1">新手拍摄小技巧</p>
          <p className="text-sm text-green-800">{data.shooting_tips}</p>
        </div>
      )}
    </section>
  )
}

function ContentAssetsPanel({ data, contentReviews, copiedText, onCopy }: {
  data: ContentAssets
  contentReviews?: Record<string, QualityReview>
  copiedText: string
  onCopy: (text: string, label: string) => void
}) {
  if (!data || typeof data !== 'object') return null
  const platforms = Object.keys(data)
  const [activeContentPlatform, setActiveContentPlatform] = useState(platforms[0] || '')

  useEffect(() => {
    if (platforms.length > 0 && !platforms.includes(activeContentPlatform)) {
      setActiveContentPlatform(platforms[0])
    }
  }, [platforms.join(',')])

  if (platforms.length === 0) return null

  // Detect flat format: keys are "social_post"/"video_script" instead of platform names
  const isFlatFormat = platforms.some(k => k === 'social_post' || k === 'video_script')

  if (isFlatFormat) {
    // Old flat format: render social_post and video_script directly
    const sp = data['social_post'] as unknown as SocialPost | undefined
    const vs = data['video_script'] as unknown as VideoScript | undefined
    return (
      <div className="space-y-6">
        {sp && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-500" />
              <h3 className="text-base font-bold text-gray-800">图文种草模板</h3>
            </div>
            <SocialPostView data={sp} />
          </>
        )}
        {vs && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <h3 className="text-base font-bold text-gray-800">短视频脚本</h3>
            </div>
            <VideoScriptView data={vs} />
          </>
        )}
      </div>
    )
  }

  // New per-platform format
  const current = data[activeContentPlatform]
  const isSocial = current?.social_post != null
  const isVideo = current?.video_script != null

  return (
    <>
      {/* Platform tabs */}
      <div className="flex gap-2 flex-wrap">
        {platforms.map((p) => {
          const colors = CONTENT_PLATFORM_COLORS[p] || 'border-gray-300 bg-gray-50 text-gray-600'
          const tabColor = CONTENT_PLATFORM_TAB_COLORS[p] || 'bg-gray-500'
          const active = p === activeContentPlatform
          const review = contentReviews?.[p]
          const score = review?.overall_score ?? null
          return (
            <button
              key={p}
              onClick={() => setActiveContentPlatform(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                active ? `${tabColor} text-white border-transparent` : colors
              }`}
            >
              {p}
              {score != null && (
                <span className={`text-[10px] px-1 rounded-full font-bold ${
                  active ? 'bg-white/20 text-white' : score >= 80 ? 'bg-green-100 text-green-700' : score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                  {score}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content review for active platform */}
      {(() => {
        const review = contentReviews?.[activeContentPlatform]
        if (!review) return null
        const score = review.overall_score ?? 0
        const scoreColor = score >= 80 ? 'text-green-600 bg-green-50' : score >= 60 ? 'text-yellow-600 bg-yellow-50' : 'text-red-600 bg-red-50'
        return (
          <details className="text-xs border border-gray-200 rounded-lg p-3 bg-gray-50">
            <summary className="font-medium text-gray-700 cursor-pointer flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded font-bold text-xs ${scoreColor}`}>{score}分</span>
              {review.summary || '内容质量评分'}
            </summary>
            {review.issues && review.issues.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {review.issues.map((iss, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      iss.severity === 'error' ? 'bg-red-400' : iss.severity === 'warning' ? 'bg-yellow-400' : 'bg-blue-400'
                    }`} />
                    <span className="text-gray-600">{iss.problem} → <span className="text-gray-500">{iss.suggestion}</span></span>
                  </div>
                ))}
              </div>
            )}
            {review.strengths && review.strengths.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {review.strengths.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[11px]">{s}</span>
                ))}
              </div>
            )}
          </details>
        )
      })()}

      {/* Content for active platform */}
      <div className="space-y-4">
        {isSocial && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-500" />
              <h3 className="text-base font-bold text-gray-800">图文种草模板</h3>
            </div>
            <SocialPostView data={current.social_post!} />
          </>
        )}
        {isVideo && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <h3 className="text-base font-bold text-gray-800">短视频脚本</h3>
            </div>
            <VideoScriptView data={current.video_script!} />
          </>
        )}
        {!isSocial && !isVideo && (
          <p className="text-sm text-gray-400">该平台暂无内容数据</p>
        )}
      </div>
    </>
  )
}
