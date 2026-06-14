# 行业摸底工具 (Industry Insight)

一键生成结构化行业分析报告的桌面工具。输入行业名称，自动搜索全网信息，AI 生成包含产业链、竞争格局、消费者洞察、渠道策略等维度的深度报告。

## 功能亮点

- **多维度分析**：价值链、竞争格局、主要玩家、消费者行为、经营打法、推广渠道、爆品趋势、素材定价
- **6种角色视角**：工厂/品牌方/经销商/投资人/政府/通用，每种角色有定制化的分析侧重点
- **地域深度分析**：支持指定城市/区域，结合本地市场特征给出具体判断（如"北京经销商代理分析"）
- **信源质量筛选**：基于域名权威度、内容长度、时效性的三维评分，自动过滤低质文章
- **章节重写**：对报告不满意的小节可单独重新生成，无需重跑整个报告
- **出海跨境模式**：可选海外视角，双语搜索，聚焦目标市场准入和跨境物流

## 快速开始

### 前置条件

- Node.js 18+
- Python 3.10+
- 一个 AI API Key（推荐 [DeepSeek](https://platform.deepseek.com/)，便宜好用）
- 一个搜索引擎 API Key（推荐 [百度千帆 AppBuilder](https://console.bce.baidu.com/ai-engine/)，免费 1500 次/月；海外市场可选 [Tavily](https://tavily.com/)，免费 1000 次/月）

### 安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/你的用户名/industry-insight.git
cd industry-insight

# 2. 安装前端依赖
npm install

# 3. 配置环境变量
cp .env.template .env
# 编辑 .env，填入你的 API Key

# 4. 配置 Python 虚拟环境
python -m venv venv
source venv/Scripts/activate  # Windows
# source venv/bin/activate    # macOS/Linux
pip install -r backend/requirements.txt

# 5. 启动开发模式
# Windows: 双击 scripts/dev.bat
# 其他: npm run dev (前端) + uvicorn backend.main:app (后端)
```

### 打包安装程序

```bash
# 下载嵌入模型（首次需要）
npm run download:model

# 打包 Python 后端
npm run pyinstaller:build

# 打包 Windows 安装程序
npm run electron:package
# 输出：release/行业摸底工具 Setup 0.1.0.exe
```

## 项目结构

```
├── backend/
│   ├── models/
│   │   ├── prompts.py      # AI prompt 模板（角色视角、章节结构等）
│   │   └── schemas.py      # Pydantic 数据模型
│   ├── routes/
│   │   ├── scan.py         # 核心扫描流程（SSE 流式）
│   │   ├── config.py       # 配置读写
│   │   ├── discover.py     # 行业发现（趋势词、自动补全）
│   │   ├── embedings.py    # ChromaDB 向量索引
│   │   ├── obsidian.py     # Obsidian 文件操作
│   │   └── search.py       # 搜索代理
│   └── services/
│       ├── ai_analyzer.py       # AI 分析引擎（多章节并发生成）
│       ├── web_search.py        # 多引擎搜索（百度和 Tavily）
│       ├── content_extractor.py # 网页正文提取
│       ├── source_quality.py    # 信源质量评分
│       ├── embedding_service.py # 本地嵌入模型
│       ├── llm_client.py        # 多 LLM 客户端
│       └── obsidian_writer.py   # 报告写入工具
├── electron/
│   ├── main.ts    # Electron 主进程（Python 后端管理、IPC）
│   └── preload.ts # 预加载脚本
├── src/
│   ├── pages/
│   │   ├── IndustryScan.tsx  # 行业摸底页面
│   │   ├── Settings.tsx      # 设置页面
│   │   └── UsageGuide.tsx    # 使用说明
│   ├── components/           # 通用组件
│   ├── App.tsx
│   └── main.tsx
├── scripts/                  # 构建/开发辅助脚本
├── pyinstaller.spec          # PyInstaller 打包配置
└── package.json
```

## 技术栈

- **前端**：React + TypeScript + Vite + Tailwind CSS
- **桌面壳**：Electron
- **后端**：Python FastAPI + Uvicorn
- **AI**：DeepSeek / Claude / OpenAI（通过统一 LLM 客户端切换）
- **搜索**：百度千帆 AI 搜索 / Tavily
- **嵌入**：sentence-transformers + ChromaDB
- **打包**：PyInstaller + electron-builder (NSIS)

## 适用场景说明

本工具诞生于电商运营实战，默认分析视角偏向新消费/新零售领域：

- 系统提示词定位为"行业分析师兼电商运营专家"
- 渠道分析覆盖抖音、小红书、天猫、快手等电商平台
- 打法拆解关注直播间话术、详情页视觉、短视频内容策略
- 产品分析章节命名为"电商切入"

**分析非电商行业（如建材、医疗、教育、SaaS、制造业等）时**，电商视角的 prompt 和搜索关键词可能不够准确。需要调整的文件和具体方法见 [非电商行业适配指南](./docs/非电商行业适配.md)，整体改动量约 15 分钟。

如果你是电商/新消费/零售行业的从业者，开箱即用。

## 完整版

本工具是 **行业摸底工具 (Industry Insight)** 开源版，聚焦于行业分析报告的生成。

如需以下功能，可关注完整版（桌面端收费工具，面向电商运营从业者）：

- **卖点整理** — 基于京东/天猫运营规范的结构化卖点生成
- **竞品分析** — 上传竞品表格，自动识别竞店并 AI 标注型号/系列
- **盯价监控** — 批量追踪竞品价格变化，价格历史曲线
- **技能雷达** — 行业技能需求趋势分析
- **策略对谈 & 知识榨取** — AI 深度对话和知识库沉淀

完整版获取方式：[待补充]

## 许可证

MIT
