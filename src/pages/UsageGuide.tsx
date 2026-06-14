export default function UsageGuide() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">使用说明</h2>

      {/* 快速上手 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">快速上手（2 步）</h3>
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex gap-2">
            <span className="text-blue-500 font-bold shrink-0">1.</span>
            <span>前往 <strong>设置</strong> 页，填入 DeepSeek API Key 和百度千帆 API Key。两个都是免费的，不知道在哪里获取？往下看。</span>
          </div>
          <div className="flex gap-2">
            <span className="text-blue-500 font-bold shrink-0">2.</span>
            <span>回到 <strong>行业摸底</strong>，输入你想了解的行业（如"宠物免洗手套""新能源汽车"），点击开始分析，等待 3-5 分钟即可获得报告。</span>
          </div>
        </div>
      </section>

      {/* API Key 获取 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">需要的 API Key</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 border-b">用途</th>
                <th className="text-left px-4 py-2 border-b">推荐服务</th>
                <th className="text-left px-4 py-2 border-b">获取地址</th>
                <th className="text-left px-4 py-2 border-b">费用</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 border-b font-medium">AI 分析</td>
                <td className="px-4 py-2 border-b">
                  DeepSeek（推荐）<br />
                  <span className="text-gray-400 text-xs">也支持 Claude / OpenAI</span>
                </td>
                <td className="px-4 py-2 border-b">
                  <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">platform.deepseek.com</a>
                </td>
                <td className="px-4 py-2 border-b text-green-600">注册送额度，API 极便宜</td>
              </tr>
              <tr>
                <td className="px-4 py-2 border-b font-medium">联网搜索</td>
                <td className="px-4 py-2 border-b">
                  百度千帆 AppBuilder（推荐，国内直接用）<br />
                  <span className="text-gray-400 text-xs">也支持 Tavily（海外内容，需 VPN）</span>
                </td>
                <td className="px-4 py-2 border-b">
                  <a href="https://console.bce.baidu.com/ai-engine/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.bce.baidu.com</a>
                </td>
                <td className="px-4 py-2 border-b text-green-600">免费 1500 次/月</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          百度千帆国内直接访问，注册即用。Tavily 需要 VPN，海外市场搜索更优。
        </p>
      </section>

      {/* 行业摸底说明 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">行业摸底 — 使用详解</h3>
        <div className="p-4 bg-blue-50 rounded-lg mb-3">
          <p className="text-sm text-blue-700">
            输入一个行业/品类名称，AI 自动联网搜索并分析，生成包含价值链、竞争格局、消费者痛点、渠道策略、爆品趋势的结构化报告，保存到本地 Obsidian Vault。
          </p>
        </div>

        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <h4 className="font-bold text-gray-800">搜索技巧</h4>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li>品类名称越具体越好，如"宠物免洗手套"而非"宠物用品"</li>
              <li>不确定准确名称时，先输入关键词，使用自动补全建议</li>
              <li>时效范围选择"近一月"可获得最新趋势，选"不限"覆盖更广</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-gray-800">可选配置</h4>
            <ul className="list-disc ml-5 mt-1 space-y-1">
              <li><strong>报告视角</strong>：工厂/品牌方/经销商/投资人/政府，不同角色侧重不同维度</li>
              <li><strong>所在地</strong>：填入城市或区域（如"广西贺州"），报告会结合本地市场特征分析</li>
              <li><strong>出海/跨境</strong>：启用双语搜索，追加跨境价值链和海外平台对比</li>
              <li><strong>深入季节/地域分析</strong>：在报告末尾追加销售节奏、七区差异、备货策略附录，适合需要实操指导的经销商和品牌方</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-gray-800">分析流程</h4>
            <p className="mt-1">搜索 → 抓取网页内容 → 信源质量评估 → AI 并行生成多章节 → 季节附录（可选）→ 保存报告，全程约 3-5 分钟。可实时看到进度。</p>
          </div>
          <div>
            <h4 className="font-bold text-gray-800">报告内容</h4>
            <p className="mt-1">核心摘要、价值链、竞争格局、主要玩家、消费者行为、经营打法、品牌格局、渠道玩法、爆品趋势、来源分级。如开启季节分析，追加年度销售节奏、七区地域差异、备货库存策略。</p>
          </div>
        </div>
      </section>

      {/* 常见问题 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">常见问题</h3>
        <div className="space-y-3 text-sm">
          <div>
            <h4 className="font-bold text-gray-800">搜索不到结果？</h4>
            <p className="text-gray-600 mt-0.5">尝试：换个更具体的行业名称、切换搜索引擎（Tavily 覆盖海外、Bing 覆盖国内）、把时效范围改为"不限"。</p>
          </div>
          <div>
            <h4 className="font-bold text-gray-800">报告分析和实际不符？</h4>
            <p className="text-gray-600 mt-0.5">AI 基于网络搜索内容生成，信息可能存在时间差或片面性。建议定期（每月/每季度）重跑同一行业，对比变化趋势。</p>
          </div>
          <div>
            <h4 className="font-bold text-gray-800">API 调用失败？</h4>
            <p className="text-gray-600 mt-0.5">DeepSeek 高峰期可能限流，等几分钟重试即可。Tavily 需要 VPN 才能访问。Bing API 国内可直接使用。</p>
          </div>
          <div>
            <h4 className="font-bold text-gray-800">报告保存在哪里？</h4>
            <p className="text-gray-600 mt-0.5">默认保存在工具数据目录下的 data/vault/行业摸底/。如果配置了 Obsidian Vault 路径，则保存到 Vault 对应目录。</p>
          </div>
          <div>
            <h4 className="font-bold text-gray-800">可以不用 Obsidian 吗？</h4>
            <p className="text-gray-600 mt-0.5">可以。不配置 Obsidian 完全不影响使用，报告自动保存到工具的本地数据目录。</p>
          </div>
        </div>
      </section>

      {/* Obsidian 配置（可选） */}
      <section className="mb-8">
        <h3 className="text-lg font-bold mb-3">Obsidian 集成（可选）</h3>
        <p className="text-sm text-gray-600">
          配置 Obsidian Vault 后，行业报告自动保存到 Vault 中，可在 Obsidian 中查看、编辑、建立双向链接。
          在设置页选择 Vault 根目录即可，工具只写入不会修改你的已有文件。
        </p>
      </section>
    </div>
  )
}
