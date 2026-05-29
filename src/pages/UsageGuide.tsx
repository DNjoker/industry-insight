export default function UsageGuide() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">使用说明</h2>

      {/* API 配置 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">需要的 API Key</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 border-b">功能</th>
                <th className="text-left px-4 py-2 border-b">所需 Key</th>
                <th className="text-left px-4 py-2 border-b">获取地址</th>
                <th className="text-left px-4 py-2 border-b">优先级</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 border-b">AI 对话 / 提炼</td>
                <td className="px-4 py-2 border-b">
                  DeepSeek API Key（推荐）<br />
                  <span className="text-gray-400">或 Anthropic / OpenAI</span>
                </td>
                <td className="px-4 py-2 border-b">
                  <a href="https://platform.deepseek.com" target="_blank" className="text-blue-600 hover:underline">platform.deepseek.com</a>
                </td>
                <td className="px-4 py-2 border-b">
                  <span className="text-red-500 font-medium">必需</span>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 border-b">联网搜索</td>
                <td className="px-4 py-2 border-b">
                  Tavily API Key（推荐）<br />
                  <span className="text-gray-400">或 Bing Search API</span>
                </td>
                <td className="px-4 py-2 border-b">
                  <a href="https://tavily.com" target="_blank" className="text-blue-600 hover:underline">tavily.com</a>
                </td>
                <td className="px-4 py-2 border-b">
                  行业摸底 / 策略对谈联网搜索时需要
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          DeepSeek 目前注册送额度，API 很便宜。Tavily 有免费额度（每月 1000 次搜索）。
        </p>
      </section>

      {/* 功能说明 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">五个功能模块</h3>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-bold text-blue-800">行业摸底</h4>
            <p className="text-sm text-blue-700 mt-1">
              输入一个行业/赛道名称，自动联网搜索最新信息，生成结构化行业分析报告（价值链、竞争格局、消费者、渠道等），保存到 Obsidian Vault。
            </p>
            <p className="text-xs text-blue-500 mt-1">需要：DeepSeek Key + Tavily Key</p>
          </div>

          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-bold text-green-800">知识榨取</h4>
            <p className="text-sm text-green-700 mt-1">
              批量粘贴文章链接或文字笔记，AI 自动提取核心观点，生成结构化知识卡片存入知识库。支持一行一条，用 | 分隔添加备注。
            </p>
            <p className="text-xs text-green-500 mt-1">需要：DeepSeek Key</p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="font-bold text-purple-800">策略对谈</h4>
            <p className="text-sm text-purple-700 mt-1">
              AI 策略顾问，支持两种模式：<strong>对话交流</strong>（简短互动、苏格拉底式追问）和<strong>详细分析</strong>（结构化长篇报告）。可切换知识库集合，可保存对话和搜索来源。
            </p>
            <p className="text-xs text-purple-500 mt-1">需要：DeepSeek Key；联网搜索需要 Tavily Key</p>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg">
            <h4 className="font-bold text-orange-800">对话梳理</h4>
            <p className="text-sm text-orange-700 mt-1">
              导入 DeepSeek 聊天记录（粘贴或从 Obsidian 选择已有文件），AI 自动提炼对话中的核心观点、用户想法、技术细节、待办事项，保存到 Obsidian 已提炼文件夹。
            </p>
            <p className="text-xs text-orange-500 mt-1">需要：DeepSeek Key；文件需放在 Vault/DeepSeek对话/ 目录下</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="font-bold text-gray-800">设置</h4>
            <p className="text-sm text-gray-700 mt-1">
              配置 API Key、Obsidian Vault 路径、知识库同步。首次使用需要先设置 Vault 路径和至少一个 AI Key。
            </p>
          </div>
        </div>
      </section>

      {/* 注意事项 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">注意事项</h3>
        <ul className="text-sm space-y-2 text-gray-700">
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">1.</span>
            <span><strong>Obsidian Vault 路径</strong> — 必须先在设置页选择 Obsidian Vault 目录，否则无法保存任何文件。工具只会读写 Vault 目录下的文件，不会影响其他位置。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">2.</span>
            <span><strong>知识库同步</strong> — 在设置页点"同步"按钮，工具会扫描 Vault 中的知识卡片、行业摸底、DeepSeek对话 三个目录，建立本地语义索引（ChromaDB）。同步后"策略对谈"才能检索到你的知识库内容。首次同步会下载 embedding 模型（约 120MB），需要等待几分钟。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">3.</span>
            <span><strong>联网搜索消耗</strong> — "行业摸底"每个维度会触发一次搜索，完整报告共搜索 9 次。"策略对谈"每次对话会触发一次搜索。Tavily 免费额度每月 1000 次，日常使用够用。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">4.</span>
            <span><strong>DeepSeek API 稳定性</strong> — DeepSeek 高峰期可能限流或超时，遇到报错等几分钟重试即可。也可以在设置页切换到 OpenAI 或 Anthropic。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">5.</span>
            <span><strong>知识榨取 — 网页抓取限制</strong> — 部分网站（如公众号、知乎、需要登录的页面）可能无法抓取完整内容。遇到这种情况，手动复制粘贴文字到输入框效果更好。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">6.</span>
            <span><strong>对话梳理 — 文件格式</strong> — 从 Obsidian 加载对话文件时，文件需要符合 DeepSeek对话 的标准格式（## 对话记录 区域 + ### **角色** 标记）。直接粘贴对话文本则支持多种格式。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">7.</span>
            <span><strong>与 Obsidian 的关系</strong> — 本工具只负责往 Vault 写标准 Markdown 文件，不会修改 Obsidian 配置或已有文件。你在 Obsidian 里编辑的笔记下次同步时会被重新索引。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-500 shrink-0">8.</span>
            <span><strong>数据隐私</strong> — 所有对话和知识库内容存储在本地，只有调用 AI API 和搜索 API 时会把文本发到对应服务商。不使用语音输入、不上传文件到第三方。</span>
          </li>
        </ul>
      </section>
    </div>
  )
}
