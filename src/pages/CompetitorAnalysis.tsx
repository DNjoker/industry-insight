import { useState, useEffect, useRef } from 'react'
import { getBaseUrl } from '../hooks/useBackendApi'

interface CapturedImage {
  url: string
  width: number
  height: number
  alt: string
  area: number
}

interface PageCapture {
  title: string
  url: string
  images: CapturedImage[]
  texts: { tag: string; text: string }[]
  bodyText: string
}

type ImageCategory = 'main' | 'sku' | 'detail'

interface ScreenAnalysis {
  image_index: number
  image_type: string
  source_path: string
  copy_text?: string
  layout_style?: string
  layout?: string
  colors?: string[]
  screen_title?: string
  selling_point?: string
  visual_focus?: string
  visual_elements?: string[]
  score?: number
  strengths?: string[]
  weaknesses?: string[]
  notes?: string
  text_ratio?: string
  error?: string
}

interface ApplicableCategory {
  category: string
  reason: string
}

interface OverallAnalysis {
  overall_score?: number
  structure_quality?: string
  copy_quality?: string
  visual_quality?: string
  top_strengths?: string[]
  top_weaknesses?: string[]
  usable_ideas?: string[]
  extracted_selling_points?: string[]
  extracted_copy_snippets?: string[]
  applicable_categories?: ApplicableCategory[]
  error?: string
}

interface AnalysisResult {
  platform: string
  category: string
  product_name: string
  screens: ScreenAnalysis[]
  overall: OverallAnalysis
}

interface LibraryItem {
  name: string
  path: string
  category: string
  image_count: number
}

export default function CompetitorAnalysis() {
  const [url, setUrl] = useState('')
  const [platform, setPlatform] = useState('淘宝')
  const [category, setCategory] = useState('')
  const [productName, setProductName] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [captured, setCaptured] = useState<PageCapture | null>(null)
  const [localImages, setLocalImages] = useState<string[]>([])
  const [imageCategories, setImageCategories] = useState<ImageCategory[]>([])
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set())
  const [hoveredImage, setHoveredImage] = useState<string | null>(null)
  const [analyzeProgress, setAnalyzeProgress] = useState('')
  const [debugLog, setDebugLog] = useState<string[]>([])

  const addDebug = (msg: string) => setDebugLog(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()} ${msg}`])

  const setCategoryDirect = (i: number, cat: ImageCategory) => {
    setImageCategories(prev => {
      const next = [...prev]
      next[i] = cat
      return next
    })
  }
  const [reviews, setReviews] = useState<string[]>([])
  const [reviewResult, setReviewResult] = useState<any>(null)
  const [analyzingReviews, setAnalyzingReviews] = useState(false)
  const [extractingReviews, setExtractingReviews] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [savedPath, setSavedPath] = useState('')
  const [tab, setTab] = useState<'browser' | 'library'>('browser')

  // 灵感库
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [libLoading, setLibLoading] = useState(false)

  const webviewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Create webview element on mount (React doesn't handle <webview> well in JSX)
    if (webviewRef.current && tab === 'browser') {
      const existing = webviewRef.current.querySelector('webview')
      if (existing) return

      const wv = document.createElement('webview') as any
      wv.setAttribute('src', 'about:blank')
      wv.setAttribute('style', 'width:100%;height:100%;border:none')
      wv.setAttribute('allowpopups', '')
      webviewRef.current.appendChild(wv)
    }
  }, [tab])

  const getWebview = (): any => {
    return webviewRef.current?.querySelector('webview')
  }

  const navigateTo = () => {
    const wv = getWebview()
    if (!wv || !url.trim()) return
    const targetUrl = url.startsWith('http') ? url : `https://${url}`
    wv.setAttribute('src', targetUrl)
    setError('')
  }

  const handleCapture = async () => {
    const wv = getWebview()
    if (!wv) return

    setCapturing(true)
    setError('')
    try {
      // Try to extract data directly from webview via executeJavaScript
      let captureData: PageCapture | null = null
      try {
        captureData = await wv.executeJavaScript(`
          (function() {
            // ---- JUNK FILTER ----
            function isJunk(img) {
              var w = img.naturalWidth || img.width || 0;
              var h = img.naturalHeight || img.height || 0;
              if (w < 80 || h < 80) return true;
              var src = (img.src || '').toLowerCase();
              if (src.indexOf('logo') > -1 || src.indexOf('icon') > -1 || src.indexOf('avatar') > -1) return true;
              if (src.indexOf('88vip') > -1 || src.indexOf('video_loading') > -1 || src.indexOf('play_icon') > -1) return true;
              // Check parents for junk/review/recommend areas
              var p = img.parentElement, d = 0;
              while (p && d < 10) {
                var c = (p.className || '').toLowerCase();
                var id = (p.id || '').toLowerCase();
                if (c.indexOf('shop-bd') > -1 || c.indexOf('shop-header') > -1 || c.indexOf('footer') > -1) return true;
                if (c.indexOf('site-nav') > -1 || c.indexOf('header') > -1 && c.indexOf('detail') === -1) return true;
                // Exclude review, recommend, guess-you-like areas
                if (c.indexOf('tb-rev') > -1 || c.indexOf('rate-item') > -1 || c.indexOf('comment') > -1) return true;
                if (c.indexOf('recommend') > -1 || c.indexOf('guess') > -1 || c.indexOf('tj-waterfall') > -1) return true;
                if (c.indexOf('related') > -1 || c.indexOf('similar') > -1) return true;
                if (id.indexOf('review') > -1 || id.indexOf('recommend') > -1 || id.indexOf('waterfall') > -1) return true;
                p = p.parentElement; d++;
              }
              return false;
            }

            // ---- EXTRACT ----
            var all = [];
            document.querySelectorAll('img').forEach(function(img) {
              var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-ks-lazyload') || '';
              var real = src.split(',')[0].trim().split(' ')[0];
              if (!real || !real.startsWith('http')) return;
              if (isJunk(img)) return;
              var r = img.getBoundingClientRect();
              var w = img.naturalWidth || img.width || 0;
              var h = img.naturalHeight || img.height || 0;
              all.push({
                url: real, width: w, height: h, alt: img.alt || '',
                top: r.top + window.scrollY, area: w * h,
              });
            });

            // Deduplicate
            var seen = {}, unique = [];
            for (var i = 0; i < all.length; i++) {
              var key = all[i].url.split('?')[0].substring(all[i].url.lastIndexOf('/'));
              if (seen[key]) continue; seen[key] = true; unique.push(all[i]);
            }

            // Sort by area descending
            unique.sort(function(a, b) { return b.area - a.area; });

            return {
              title: document.title, url: location.href,
              images: unique.slice(0, 60),
              texts: [],
              bodyText: '',
            };
          })()
        `)
      } catch {
        // If executeJavaScript fails, try IPC
        try {
          const wcId = wv.getWebContentsId?.()
          if (wcId) {
            captureData = await window.electronAPI?.captureWebview(wcId)
          }
        } catch { /* ignore */ }
      }

      if (!captureData || (captureData as any).error) {
        setError('页面捕获失败，请确认页面已加载完成')
        setCapturing(false)
        return
      }

      setCaptured(captureData)
      if (captureData.images.length === 0) {
        setError('未检测到图片，请确认页面已加载完成')
        setCapturing(false)
        return
      }

      setProductName(captureData.title?.split(/[-|_–—]/)[0]?.trim() || '')

      // Download all captured images
      const imageUrls = captureData.images.map(img => img.url)
      const savedPaths = await window.electronAPI?.downloadImages(imageUrls) || []

      // Auto-categorize: main = top by size, sku = medium/small thumbs, detail = large rest
      const areas = captureData.images.map(img => img.area).slice(0, savedPaths.length)
      const autoCats: ImageCategory[] = areas.map((area, i) => {
        if (i < 6) return 'main'
        if (area < 50000) return 'sku'
        return 'detail'
      })

      setLocalImages(savedPaths)
      setImageCategories(autoCats)
      setSelectedImages(new Set(savedPaths.map((_, i) => i)))
      addDebug(`捕获 ${savedPaths.length} 张图，已自动分类`)

      if (savedPaths.length === 0) {
        setError('图片下载失败')
      }
    } catch (e: any) {
      setError(e.message || '捕获失败')
    } finally {
      setCapturing(false)
    }
  }

  const handleAnalyze = async () => {
    const toAnalyze: string[] = []
    const toAnalyzeCats: string[] = []
    for (let i = 0; i < localImages.length; i++) {
      if (selectedImages.has(i)) {
        toAnalyze.push(localImages[i])
        toAnalyzeCats.push(imageCategories[i] || 'detail')
      }
    }
    addDebug(`选中 ${toAnalyze.length}/${localImages.length} 张图 (主${toAnalyzeCats.filter(c=>c==='main').length}/S${toAnalyzeCats.filter(c=>c==='sku').length}/详${toAnalyzeCats.filter(c=>c==='detail').length})`)
    addDebug(`第1张: ${toAnalyze[0]?.substring(toAnalyze[0].lastIndexOf('\\\\')+1) || 'N/A'}`)
    if (toAnalyze.length === 0) {
      setError('请先选择要分析的图片')
      return
    }
    setAnalyzing(true)
    setAnalyzeProgress(`正在分析 ${toAnalyze.length} 张图片 (调用火山视觉模型)...`)
    setError('')
    try {
      const baseUrl = await getBaseUrl()
      const url = `${baseUrl}/api/competitor/analyze`
      addDebug(`POST ${url}`)
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_paths: toAnalyze,
          image_categories: toAnalyzeCats,
          platform, category,
          product_name: productName || '未命名',
        }),
      })
      addDebug(`响应 ${resp.status}`)
      if (!resp.ok) {
        const errText = await resp.text()
        addDebug(`错误: ${errText.substring(0, 100)}`)
        throw new Error(`HTTP ${resp.status}: ${errText.substring(0, 80)}`)
      }
      const data: AnalysisResult = await resp.json()
      addDebug(`分析完成: ${Object.keys(data).join(', ')}`)
      setResult(data)
    } catch (e: any) {
      addDebug(`失败: ${e.message}`)
      setError(e.message || '分析失败')
    } finally {
      setAnalyzing(false)
      setAnalyzeProgress('')
    }
  }

  const handleCaptureReviews = async () => {
    const wv = getWebview()
    if (!wv) return

    setExtractingReviews(true)
    try {
      const reviewData = await wv.executeJavaScript(`
        (function() {
          // Target specific review containers on major platforms
          // Taobao/Tmall: .tb-rev-item, .tm-rate-item
          // JD: .comment-item, .comment-con
          // PDD: .review-item, .comment-content
          // Douyin: .comment-item, .review-content
          var reviewSelectors = [
            '.tb-rev-item .tb-rate-content',
            '.tm-rate-item .tm-rate-content',
            '.comment-item .comment-con',
            '.comment-item .comment-content',
            '.review-item .review-content',
            '.rate-item .rate-content',
            '[class*="review"] [class*="content"]',
            '[class*="comment"] [class*="detail"]',
          ];

          var pureReviews = [];
          var seenTexts = new Set();

          // Strategy 1: find review containers and extract their text
          for (var s = 0; s < reviewSelectors.length; s++) {
            var els = document.querySelectorAll(reviewSelectors[s]);
            for (var i = 0; i < els.length; i++) {
              var text = (els[i].textContent || '').trim();
              // Filter: real reviews are 15-500 chars
              if (text.length < 10 || text.length > 600) continue;
              // Exclude navigation/account junk
              var junkWords = ['退出', '登录', '注册', '我的淘宝', '购物车', '收藏夹', '已买到', '卖家中心',
                '千牛', 'Ctrl+V', '粘贴图片', '图搜', '我的订单', '待付款', '待发货', '待收货',
                '评价管理', '账号管理', '消息中心', '免费注册', '手机淘宝', '客户端',
                '您好，请登录', '新人专享', '领券', '签到', '红包'];
              var isJunk = false;
              for (var j = 0; j < junkWords.length; j++) {
                if (text.indexOf(junkWords[j]) > -1) { isJunk = true; break; }
              }
              if (isJunk) continue;
              // Deduplicate
              var key = text.substring(0, 40);
              if (seenTexts.has(key)) continue;
              seenTexts.add(key);
              pureReviews.push(text.substring(0, 400));
            }
            if (pureReviews.length >= 30) break;
          }

          // Strategy 2: if none found, try tb-rev-item container-level extraction
          if (pureReviews.length === 0) {
            var revItems = document.querySelectorAll('.tb-rev-item, .tm-rate-item, .comment-item');
            for (var i = 0; i < revItems.length && pureReviews.length < 30; i++) {
              var text = (revItems[i].textContent || '').trim();
              // Strip common prefix junk (reviewer name, date, SKU info)
              text = text.replace(/^(.*?)\\s{2,}/, '');
              if (text.length > 10 && text.length < 600) {
                var key = text.substring(0, 40);
                if (!seenTexts.has(key)) {
                  seenTexts.add(key);
                  pureReviews.push(text.substring(0, 400));
                }
              }
            }
          }

          // Strategy 3: generic fallback - find elements with review-like text patterns
          if (pureReviews.length === 0) {
            var candidates = document.querySelectorAll('p, div, span, li');
            for (var i = 0; i < candidates.length && pureReviews.length < 50; i++) {
              var el = candidates[i];
              if (el.children.length > 0) continue; // only leaf elements
              var text = (el.textContent || '').trim();
              if (text.length < 12 || text.length > 400) continue;
              // Must contain review indicators
              var hasIndicator = /(好评|差评|追评|回购|推荐|好用|不好|满意|失望|质量|效果|味道|使用|收到|买了|物流|客服|退换)/.test(text);
              if (!hasIndicator) continue;
              var key = text.substring(0, 40);
              if (!seenTexts.has(key)) {
                seenTexts.add(key);
                pureReviews.push(text);
              }
            }
          }

          return { reviews: pureReviews.slice(0, 50), count: pureReviews.length };
        })()
      `)

      if (reviewData?.reviews?.length > 0) {
        setReviews(reviewData.reviews)
      } else {
        setError('未找到评价内容，请滚动到评价区域后再试')
      }
    } catch (e: any) {
      setError('评价抓取失败: ' + e.message)
    } finally {
      setExtractingReviews(false)
    }
  }

  const handleAnalyzeReviews = async () => {
    if (reviews.length === 0) return
    setAnalyzingReviews(true)
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/competitor/analyze-reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews, product_name: productName }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setReviewResult(data)
      }
    } catch (e: any) {
      setError('评价分析失败: ' + e.message)
    } finally {
      setAnalyzingReviews(false)
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/competitor/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: productName || '未命名',
          platform,
          category,
          url: captured?.url || url,
          images: localImages,
          analysis: result,
          reviews,
          review_analysis: reviewResult,
          tags: [platform, category].filter(Boolean),
        }),
      })
      if (resp.ok) {
        const data = await resp.json()
        setSavedPath(data.path)
        setTimeout(() => setSavedPath(''), 3000)
      }
    } catch (e: any) {
      setError('保存失败: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const loadLibrary = async () => {
    setLibLoading(true)
    try {
      const baseUrl = await getBaseUrl()
      const resp = await fetch(`${baseUrl}/api/competitor/library`)
      if (resp.ok) {
        const data = await resp.json()
        setLibrary(data.items || [])
      }
    } catch { /* ignore */ }
    finally { setLibLoading(false) }
  }

  useEffect(() => {
    if (tab === 'library') loadLibrary()
  }, [tab])

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-bold mr-4">竞品分析</h2>
        <button
          onClick={() => setTab('browser')}
          className={`px-3 py-1 text-sm rounded-md ${tab === 'browser' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          浏览器
        </button>
        <button
          onClick={() => setTab('library')}
          className={`px-3 py-1 text-sm rounded-md ${tab === 'library' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          灵感库
        </button>
      </div>

      {tab === 'browser' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Webview Browser */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
            {/* URL bar */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 border-b border-gray-200">
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5"
              >
                <option>淘宝</option><option>拼多多</option><option>抖音</option><option>京东</option>
              </select>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && navigateTo()}
                placeholder="粘贴竞品链接..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={navigateTo}
                disabled={!url.trim()}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                打开
              </button>
              <button
                onClick={handleCapture}
                disabled={capturing}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 whitespace-nowrap"
              >
                {capturing ? '捕获中...' : '捕获页面'}
              </button>
              <button
                onClick={handleCaptureReviews}
                disabled={extractingReviews}
                className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:bg-gray-300 whitespace-nowrap"
              >
                {extractingReviews ? '抓取中...' : '抓取评价'}
              </button>
            </div>

            {/* Webview container */}
            <div ref={webviewRef} className="flex-1 bg-white" />

            {/* Help text */}
            {!url && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-gray-400 text-sm">在地址栏粘贴竞品链接，打开后点击"捕获页面"</p>
              </div>
            )}
          </div>

          {/* Right: Analysis Panel */}
          <div className="w-96 flex flex-col overflow-auto bg-gray-50">
            {/* Product info */}
            <div className="p-3 space-y-2 border-b border-gray-200 bg-white">
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="竞品名称"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="类目（如：宠物用品）"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded"
                />
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing || selectedImages.size === 0}
                  className="px-4 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300 whitespace-nowrap"
                  title={selectedImages.size === 0 ? '请先在下方选择要分析的图片' : `分析 ${selectedImages.size} 张图片`}
                >
                  {analyzing ? '分析中...' : `分析 (${selectedImages.size}张)`}
                </button>
              </div>
            </div>

            {/* Status */}
            {captured && (
              <div className="px-3 py-2 text-xs text-gray-500 bg-blue-50 border-b border-blue-100">
                已捕获 {captured.images.length} 张，已选 {selectedImages.size} 张
                {localImages.length > 0 && (
                  <button
                    onClick={() => setSelectedImages(new Set(localImages.map((_, i) => i)))}
                    className="ml-2 text-blue-500 hover:text-blue-700"
                  >
                    全选
                  </button>
                )}
                {selectedImages.size > 0 && (
                  <button
                    onClick={() => setSelectedImages(new Set())}
                    className="ml-1 text-blue-500 hover:text-blue-700"
                  >
                    取消全选
                  </button>
                )}
              </div>
            )}

            {/* Image previews - categorized */}
            {localImages.length > 0 && (
              <div className="border-b border-gray-200 max-h-[600px] overflow-auto">
                {(['main', 'sku', 'detail'] as const).map(cat => {
                  const catImages = localImages
                    .map((path, i) => ({ path, i, cat: imageCategories[i] || 'detail' }))
                    .filter(item => item.cat === cat)
                  if (catImages.length === 0) return null

                  const catNames: Record<string, string> = { main: '主图', sku: 'SKU图', detail: '详情页图' }
                  const catColors: Record<string, string> = { main: 'bg-blue-500', sku: 'bg-amber-500', detail: 'bg-green-500' }

                  return (
                    <div key={cat} className="px-3 py-2">
                      <span className={`text-[10px] text-white px-1.5 py-0.5 rounded ${catColors[cat]}`}>
                        {catNames[cat]}（{catImages.length}张）
                      </span>
                      <div className="grid grid-cols-4 gap-1.5 mt-1">
                        {catImages.map(({ path, i }) => (
                          <div
                            key={i}
                            onMouseEnter={() => setHoveredImage(path)}
                            onMouseLeave={() => setHoveredImage(null)}
                            onClick={() => {
                              const next = new Set(selectedImages)
                              next.has(i) ? next.delete(i) : next.add(i)
                              setSelectedImages(next)
                            }}
                            className={`relative cursor-pointer rounded overflow-hidden border-2 transition-colors ${
                              selectedImages.has(i) ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200 opacity-50 hover:opacity-80'
                            }`}
                          >
                            <img
                              src={`http://127.0.0.1:19877/api/competitor/preview-image?path=${encodeURIComponent(path)}`}
                              alt={`图${i + 1}`}
                              className="w-full h-14 object-cover pointer-events-none"
                              loading="lazy"
                            />
                            <div className="absolute bottom-0.5 left-0.5 right-0.5 flex gap-0.5">
                              {(['main', 'sku', 'detail'] as ImageCategory[]).map(cat => (
                                <button
                                  key={cat}
                                  onClick={(e) => { e.stopPropagation(); setCategoryDirect(i, cat) }}
                                  className={`text-[9px] text-white px-0.5 py-px rounded flex-1 ${
                                    (imageCategories[i] || 'detail') === cat
                                      ? { main: 'bg-blue-500', sku: 'bg-amber-500', detail: 'bg-green-500' }[cat] + ' font-bold'
                                      : 'bg-gray-300 opacity-60'
                                  }`}
                                >
                                  {{ main: '主', sku: 'SKU', detail: '详' }[cat]}
                                </button>
                              ))}
                            </div>
                            {selectedImages.has(i) && (
                              <span className="absolute top-0.5 right-0.5 bg-blue-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                                ✓
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Hover preview - shows in the analysis panel area */}
                {hoveredImage && (
                  <div className="absolute bottom-2 left-3 right-3 z-30 bg-white border border-gray-300 rounded-lg shadow-lg p-2">
                    <img
                      src={`http://127.0.0.1:19877/api/competitor/preview-image?path=${encodeURIComponent(hoveredImage)}`}
                      alt="预览"
                      className="w-full max-h-64 object-contain rounded"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Reviews capture */}
            {reviews.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
                <span className="text-xs text-gray-500">已抓取 {reviews.length} 条评价</span>
                <button
                  onClick={handleAnalyzeReviews}
                  disabled={analyzingReviews}
                  className="px-2 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:bg-gray-300"
                >
                  {analyzingReviews ? '分析中...' : '分析评价'}
                </button>
              </div>
            )}

            {/* Captured text preview */}
            {captured && captured.texts.length > 0 && (
              <details className="px-3 py-2 text-xs border-b border-gray-200 bg-white">
                <summary className="text-gray-500 cursor-pointer">提取的文本 ({captured.texts.length} 条)</summary>
                <div className="mt-1 max-h-40 overflow-auto space-y-1">
                  {captured.texts.slice(0, 20).map((t, i) => (
                    <p key={i} className="text-gray-600 leading-relaxed">
                      <span className="text-gray-400">[{t.tag}]</span> {t.text}
                    </p>
                  ))}
                </div>
              </details>
            )}

            {/* Error */}
            {analyzeProgress && (
              <div className="px-3 py-2 text-xs text-blue-600 bg-blue-50 border-b border-blue-100">
                <div className="animate-spin inline-block w-3 h-3 border border-blue-600 border-t-transparent rounded-full mr-2" />
                {analyzeProgress}
              </div>
            )}
            {error && (
              <div className="px-3 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="flex-1 overflow-auto p-3 space-y-3">
                {/* Screen errors */}
                {result.screens?.some(s => s.error) && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h4 className="text-xs font-bold text-red-700 mb-1">
                      {result.screens.filter(s => s.error).length}/{result.screens.length} 张图分析失败
                    </h4>
                    {result.screens.filter(s => s.error).slice(0, 3).map((s, i) => (
                      <p key={i} className="text-xs text-red-600">
                        图{s.image_index + 1}: {s.error}
                      </p>
                    ))}
                    {result.screens.filter(s => s.error).length > 3 && (
                      <p className="text-xs text-red-400 mt-1">还有更多错误，展开下方详情查看</p>
                    )}
                  </div>
                )}

                {/* Overall score */}
                {result.overall.overall_score != null && (
                  <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-3xl font-bold text-blue-600">{result.overall.overall_score}</div>
                    <div className="text-xs text-gray-400">综合评分 / 10</div>
                  </div>
                )}

                {/* Quick stats */}
                {result.overall.top_strengths && (
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <h4 className="text-xs font-bold text-green-600 mb-1">亮点</h4>
                    {result.overall.top_strengths.map((s, i) => (
                      <p key={i} className="text-xs text-gray-700">+ {s}</p>
                    ))}
                  </div>
                )}

                {result.overall.top_weaknesses && (
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <h4 className="text-xs font-bold text-orange-600 mb-1">可改进</h4>
                    {result.overall.top_weaknesses.map((w, i) => (
                      <p key={i} className="text-xs text-gray-700">- {w}</p>
                    ))}
                  </div>
                )}

                {result.overall.usable_ideas && (
                  <div className="bg-white rounded-lg border border-purple-200 p-3">
                    <h4 className="text-xs font-bold text-purple-600 mb-1">可借鉴思路</h4>
                    {result.overall.usable_ideas.map((idea, i) => (
                      <p key={i} className="text-xs text-gray-700">{i + 1}. {idea}</p>
                    ))}
                  </div>
                )}

                {result.overall.extracted_selling_points && (
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <h4 className="text-xs font-bold text-gray-600 mb-1">提取的卖点</h4>
                    {result.overall.extracted_selling_points.map((sp, i) => (
                      <span key={i} className="inline-block px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full mr-1 mb-1">
                        {sp}
                      </span>
                    ))}
                  </div>
                )}

                {result.overall.applicable_categories && result.overall.applicable_categories.length > 0 && (
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200 p-3">
                    <h4 className="text-xs font-bold text-purple-700 mb-2">
                      这套设计思路可借鉴的类目
                    </h4>
                    <div className="space-y-2">
                      {result.overall.applicable_categories.map((ac, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full whitespace-nowrap mt-0.5">
                            {ac.category}
                          </span>
                          <p className="text-xs text-gray-600">{ac.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-screen details */}
                {result.screens.filter(s => !s.error).map((s, i) => (
                  <details key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">
                      {s.image_type === 'main_image' ? '主图' : `详情屏${s.image_index}`}
                      {s.score != null && (
                        <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{s.score}/10</span>
                      )}
                      {s.screen_title && ` — ${s.screen_title}`}
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      {s.copy_text && <p><b>文案：</b>{s.copy_text}</p>}
                      {s.layout_style && <p><b>构图：</b>{s.layout_style}</p>}
                      {s.layout && <p><b>排版：</b>{s.layout}</p>}
                      {s.colors && <p><b>配色：</b>{Array.isArray(s.colors) ? s.colors.join('、') : s.colors}</p>}
                      {s.visual_focus && <p><b>视觉重心：</b>{s.visual_focus}</p>}
                      {s.selling_point && <p><b>卖点：</b>{s.selling_point}</p>}
                      {s.text_ratio && <p><b>文字占比：</b>{s.text_ratio}</p>}
                      {s.notes && <p className="text-blue-500">{s.notes}</p>}
                    </div>
                  </details>
                ))}

                {/* Review Analysis Results */}
                {reviewResult && !reviewResult.error && (
                  <div className="space-y-2 border-t border-gray-200 pt-3">
                    <h4 className="text-sm font-bold text-gray-800">评价分析</h4>
                    {reviewResult.review_quality_score && (
                      <div className="text-center p-2 bg-white rounded-lg border border-amber-200">
                        <div className="text-2xl font-bold text-amber-600">{reviewResult.review_quality_score}</div>
                        <div className="text-xs text-gray-400">评价质量分 / 10</div>
                      </div>
                    )}
                    {reviewResult.praise_points && (
                      <div className="bg-green-50 rounded p-2">
                        <span className="text-xs font-medium text-green-700">用户夸赞</span>
                        {reviewResult.praise_points.map((p: string, i: number) => (
                          <p key={i} className="text-xs text-green-600 mt-0.5">+ {p}</p>
                        ))}
                      </div>
                    )}
                    {reviewResult.complaint_points && (
                      <div className="bg-red-50 rounded p-2">
                        <span className="text-xs font-medium text-red-700">用户抱怨</span>
                        {reviewResult.complaint_points.map((p: string, i: number) => (
                          <p key={i} className="text-xs text-red-600 mt-0.5">- {p}</p>
                        ))}
                      </div>
                    )}
                    {reviewResult.competitive_gaps && (
                      <div className="bg-purple-50 rounded p-2">
                        <span className="text-xs font-medium text-purple-700">我的机会点</span>
                        {reviewResult.competitive_gaps.map((g: string, i: number) => (
                          <p key={i} className="text-xs text-purple-600 mt-0.5">{i + 1}. {g}</p>
                        ))}
                      </div>
                    )}
                    {reviewResult.price_sentiment && (
                      <p className="text-xs text-gray-500">价格感知：{reviewResult.price_sentiment}</p>
                    )}
                    {reviewResult.repurchase_signal && (
                      <p className="text-xs text-gray-500">复购信号：{reviewResult.repurchase_signal}</p>
                    )}
                  </div>
                )}
                {reviewResult?.error && (
                  <div className="text-xs text-red-500 border-t border-gray-200 pt-2">评价分析失败，请重试</div>
                )}

                {/* Save button */}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 sticky bottom-0"
                >
                  {saving ? '保存中...' : savedPath ? `已保存` : '保存到灵感库'}
                </button>
                {savedPath && (
                  <p className="text-xs text-green-700 text-center">{savedPath}</p>
                )}
                {reviewResult && !reviewResult.error && (
                  <p className="text-xs text-gray-400 text-center">评价分析结果将一并保存</p>
                )}

                {/* Quality assessment */}
                {result.overall.structure_quality && (
                  <div className="text-xs text-gray-500 space-y-1 p-2">
                    <p>结构：{result.overall.structure_quality}</p>
                    <p>文案：{result.overall.copy_quality}</p>
                    <p>视觉：{result.overall.visual_quality}</p>
                  </div>
                )}
              </div>
            )}

            {/* Debug panel */}
            {debugLog.length > 0 && (
              <details className="px-3 py-2 text-[10px] border-b border-gray-200 bg-gray-50 font-mono">
                <summary className="text-gray-400 cursor-pointer">调试日志</summary>
                <div className="mt-1 space-y-0.5 max-h-32 overflow-auto">
                  {debugLog.map((line, i) => (
                    <div key={i} className="text-gray-500">{line}</div>
                  ))}
                </div>
              </details>
            )}

            {/* Empty state */}
            {!captured && !result && (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-6 text-center">
                <div>
                  <p>在左侧浏览器中打开竞品页面</p>
                  <p className="text-xs mt-1">点击"捕获页面"提取图片和文字</p>
                  <p className="text-xs mt-1">然后点击"分析"启动AI评分</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 灵感库 tab */
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">灵感库</h3>
              <button
                onClick={loadLibrary}
                disabled={libLoading}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                {libLoading ? '加载中...' : '刷新'}
              </button>
            </div>

            {library.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <p className="text-sm">暂无收藏</p>
                <p className="text-xs mt-1">在"浏览器"中分析竞品后可保存到灵感库</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {library.filter(item => item.path).map((item, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors group">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-gray-800 text-sm">{item.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">{item.category}</span>
                          {item.image_count > 0 && (
                            <span className="text-xs text-gray-400">{item.image_count}张图</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            const baseUrl = await getBaseUrl()
                            const resp = await fetch(`${baseUrl}/api/competitor/library/load`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ path: item.path }),
                            })
                            if (resp.ok) {
                              const data = await resp.json()
                              const sp = data.selling_points || []
                              const ideas = data.usable_ideas || []
                              const importText = [...sp, ...ideas].join('\n')
                              navigator.clipboard.writeText(importText).then(() => {
                                alert(`已复制 ${sp.length} 个卖点和 ${ideas.length} 个思路到剪贴板`)
                              })
                            }
                          } catch { /* ignore */ }
                        }}
                        className="text-xs text-blue-500 hover:text-blue-700"
                      >
                        导入到卖点
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            const baseUrl = await getBaseUrl()
                            await fetch(`${baseUrl}/api/competitor/library/open-folder`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ category: item.category }),
                            })
                          } catch { /* ignore */ }
                        }}
                        className="text-xs text-gray-400 hover:text-blue-500"
                      >
                        打开文件夹
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (!confirm(`确定删除「${item.name}」？`)) return
                          try {
                            const baseUrl = await getBaseUrl()
                            await fetch(`${baseUrl}/api/competitor/library/delete`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ path: item.path }),
                            })
                            loadLibrary()
                          } catch { /* ignore */ }
                        }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
