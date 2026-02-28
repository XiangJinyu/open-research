<p align="center">
  <h1 align="center">OpenResearch</h1>
</p>

<p align="center">开源的 AI 研究助手。</p>

<p align="center">
  <a href="https://xiangjinyu.github.io/open-research/"><img alt="主页" src="https://img.shields.io/badge/主页-open--research-blue?style=flat-square" /></a>
  <a href="https://github.com/XiangJinyu/open-research/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/XiangJinyu/open-research?style=flat-square" /></a>
  <a href="https://github.com/XiangJinyu/open-research/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/XiangJinyu/open-research?style=flat-square" /></a>
  <a href="https://github.com/XiangJinyu/open-research/commits/main"><img alt="最近提交" src="https://img.shields.io/github/last-commit/XiangJinyu/open-research?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">简体中文</a>
</p>

[![OpenResearch Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://xiangjinyu.github.io/open-research/)

---

### 安装

```bash
# Mac / Linux
curl -fsSL https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.ps1 | iex
```

安装完成后，在任意项目目录运行 `openresearch` 即可启动。

设置 `$OPENRESEARCH_INSTALL_DIR` 可自定义安装路径。

---

### 模式

按 `Tab` 键在模式之间切换。

| 模式 | 说明 |
|------|------|
| **research** | 默认模式。完整权限，用于运行实验、编写代码、分析数据。 |
| **plan** | 只读模式。动手之前先探索项目、设计研究方案。 |
| **review** | 按照 NeurIPS/ICLR/ICML 标准进行严格学术评审，也支持撰写 rebuttal。 |
| **game** | 游戏模式，将研究过程变成含六个可解锁区域的探索游戏。 |

---

### 科研专用工具

**`papersearch`** — 在终端直接搜索学术文献。
- [Semantic Scholar](https://www.semanticscholar.org/) — 相关性最佳，含 AI 生成 TLDR
- [OpenAlex](https://openalex.org/) — 覆盖 2.5 亿+ 文献，范围最广
- 支持过滤年份、研究领域、结果数量，无需 API Key。

**`websearch`** — 基于 DuckDuckGo 的免费网络搜索，无需 API Key。

**Lab Journal** — 跨会话持久化实验追踪（通过 `/skill lab-journal` 加载）。
- 记录每个实验的意图、方法、证据和解释
- 滚动更新的 `summary.md` 让未来会话能无缝续接
- `index.json` 以 DAG 结构追踪实验间依赖关系

---

### 科学严谨性

Agent 在提示词层面被要求：

- 明确区分既定事实、初步发现与推测
- 主动指出方法论问题（实验设计、统计错误、数据泄露等）
- 检查可复现性：随机种子、锁定依赖、确定性流水线
- 先调查求证，而非直接确认假设

---

### 配置

不绑定特定提供商，支持 Claude、OpenAI、Gemini 及本地模型。配置格式遵循 [OpenCode](https://opencode.ai/docs)。

---

### 参与贡献

欢迎提交 Pull Request，请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

基于 [anomalyco/opencode](https://github.com/anomalyco/opencode) 构建 · MIT License
