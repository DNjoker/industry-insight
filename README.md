# 行业摸底工具 (Industry Insight)

> **输入一个行业名，自动搜集信息并生成多章节的结构化行业分析报告。**
> 桌面端工具，报告直接写进 Obsidian。

![行业摸底界面](docs/images/scan.png)

> 早期版本（v0.1），只保留「行业摸底」一个模块。成熟度说明见文末「这个版本没做什么」。

---

## 它解决什么问题

做电商运营的人，摸一个陌生行业通常要 1–2 周：翻研报、搜测评、拼数据、写成文档。

这个工具把「搜集 → 筛选 → 成文」这段流程自动化：给一个行业名，它自己搜索、按信源质量过滤、分章节生成报告，最后写进 Obsidian。

**我做了三年天猫店长，这个工具本来是我自己用的。**

---

## 能做什么

- **多维度分析**：价值链、竞争格局、主要玩家、消费者行为、经营打法、推广渠道、爆品趋势、素材定价
- **6 种角色视角**：工厂 / 品牌方 / 经销商 / 投资人 / 政府 / 通用，每种角色有独立的分析侧重点
- **季节与地域**：大促节奏、七区差异、备货周期，自动追加实操附录
- **地域定位**：指定城市或区域，结合本地市场特征给具体判断
- **信源质量筛选**：按域名权威度、内容长度、时效性三维评分，过滤低质文章
- **章节单独重写**：某一节不满意只重跑那一节，不用整篇重来
- **出海模式**：可选海外视角，双语搜索，聚焦市场准入和跨境物流

---

## 几个实现上的选择

**1. 按章节生成，可单独重跑。**
一开始整篇一次生成，改一个细节要等十分钟。后来改成按章节独立生成，不满意只重生成那一节。

**2. 信源先打分再入库。**
按域名权威度、内容长度、时效性三维评分，低于阈值的文章直接丢弃，不进入生成上下文。

**3. 本地嵌入，不调外部 API。**
用 sentence-transformers + ChromaDB 在本地跑，离线可用、不产生调用成本。

**4. 全程流式。**
后端 SSE 推送，前端边收边渲染，长任务不会看起来像卡死。

---

## 快速开始

### 前置条件

- Node.js 18+
- Python 3.10+
- 一个 AI API Key（推荐 [DeepSeek](https://platform.deepseek.com/)）
- 一个搜索 API Key（推荐 [百度千帆 AppBuilder](https://console.bce.baidu.com/ai-engine/)，免费 1500 次/月；海外市场可用 [Tavily](https://tavily.com/)，免费 1000 次/月）

### 安装运行

```bash
# 1. 克隆
git clone https://github.com/DNjoker/industry-insight.git
cd industry-insight

# 2. 前端依赖
npm install

# 3. 配置环境变量
cp .env.template .env
# 编辑 .env，填入你的 API Key

# 4. Python 环境
python -m venv venv
source venv/Scripts/activate     # Windows
# source venv/bin/activate       # macOS / Linux
pip install -r backend/requirements.txt

# 5. 启动
# Windows: 双击 scripts/dev.bat（自动起后端 + 前端）
# macOS/Linux: 两个终端分别跑
#   uvicorn backend.main:app --host 127.0.0.1 --port 19877
#   npm run dev
```

### 打包安装程序

```bash
# (可选) 下载本地嵌入模型，跳过不影响基本功能，可省约 1GB
npm run download:model

npm run pyinstaller:build      # 打包 Python 后端
npm run electron:package       # 打包 Windows 安装程序
```

---

## 适用场景与限制

**默认分析视角偏向新消费 / 新零售：**

- 系统提示词定位为“行业分析师兼电商运营专家”
- 渠道分析覆盖抖音、小红书、天猫、快手
- 打法拆解关注直播间话术、详情页视觉、短视频内容
- 产品分析章节命名为“电商切入”

**分析非电商行业（建材、医疗、教育、SaaS、制造业）时**，prompt 和搜索关键词可能不准。需要改的文件和方法见 [非电商行业适配指南](./docs/非电商行业适配.md)，改动量约 15 分钟。

**其他限制：**

- 冷门行业搜索源少，报告质量明显下降
- 不做实时数据更新，报告是生成时刻的快照
- 生成的数字仍需要人工核对，不要直接引用

---

## 这个版本没做什么

- **财报 / 招股书解析**：只有通用网页搜索和正文提取，没有 PDF 解析链路
- **事实冻结与防幻觉配套**：模型仍可能改写数字，没有存疑标记和人工核对清单
- **报告质量评估**：没有自动打分，判断全靠人读

这几项在完整版里做了，也是这个开源版和商业版的差距。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React + TypeScript + Vite + Tailwind CSS |
| 桌面壳 | Electron |
| 后端 | Python FastAPI + Uvicorn（SSE 流式输出） |
| AI | DeepSeek / Claude / OpenAI（统一 LLM 客户端切换） |
| 搜索 | 百度千帆 AI 搜索 / Tavily |
| 嵌入 | sentence-transformers（本地）+ ChromaDB |
| 打包 | PyInstaller + electron-builder（NSIS） |

---

## 项目结构

```
├── backend/
│   ├── models/          # prompt 模板、Pydantic 数据模型
│   ├── routes/          # 扫描流程、配置、行业发现、嵌入、Obsidian 写入
│   └── services/        # AI 分析、搜索、正文提取、信源评分、LLM 客户端
├── electron/            # 主进程（Python 后端管理、IPC）、preload
├── src/
│   ├── pages/           # 行业摸底、设置、使用说明
│   └── components/
├── docs/                # 适配指南等文档
├── scripts/             # 构建与开发脚本
├── pyinstaller.spec
└── package.json
```

---

## 完整版

这是完整版产品的早期开源子集，只保留「行业摸底」一个模块。

完整版额外包含卖点整理、竞品分析、盯价监控等电商运营模块，是商业产品：[guanqian.net](https://www.guanqian.net)。

---

## License

MIT
