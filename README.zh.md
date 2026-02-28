# OpenResearch

[English](README.md) | [简体中文](README.zh.md)

**面向科研人员的 AI 研究助手。** — [主页](https://xiangjinyu.github.io/open-research/) 基于 [OpenCode](https://github.com/anomalyco/opencode) 开发，扩展了科研专用工具与工作流。

---

### 安装

```bash
# Mac / Linux
curl -fsSL https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.ps1 | iex
```

安装完成后，在任意项目目录下运行 `openresearch` 即可启动。

可通过设置 `$OPENRESEARCH_INSTALL_DIR` 自定义安装路径。

---

### 模式

按 `Tab` 键在模式之间切换。

| 模式 | 说明 |
|------|------|
| **research** | 默认模式。完整权限，用于运行实验、编写代码、分析数据。 |
| **plan** | 只读模式。在动手之前，先探索项目、设计研究方案。 |
| **review** | 论文审稿模式。按照 NeurIPS/ICLR/ICML 顶会标准进行严格学术评审，也支持撰写 rebuttal。 |
| **game** | 游戏模式。将研究过程变成一场探索游戏，包含六个可解锁区域——从「灵感室」到「编年塔」。 |

---

### 科研专用工具

**`papersearch`** — 在终端直接搜索学术文献。
- 数据源：[Semantic Scholar](https://www.semanticscholar.org/)（相关性最佳，含 AI 生成的 TLDR）和 [OpenAlex](https://openalex.org/)（覆盖 2.5 亿+ 文献，范围最广）
- 支持过滤：年份范围、研究领域、结果数量
- 无需 API Key

**`websearch`** — 基于 DuckDuckGo 的免费网络搜索，无需 API Key。

**Lab Journal（实验日志）** — 跨会话持久化实验追踪（通过 `/skill lab-journal` 加载）。
- 记录实验意图、方法、证据和解释
- 维护滚动的 `summary.md`，让未来的会话能无缝续接
- `index.json` 以 DAG 结构追踪实验间的依赖关系
- 附带 CLI 工具（`cli.py`）用于快速创建新实验

---

### 科学严谨性

研究 Agent 在提示词层面要求：

- 明确区分既定事实、初步发现与推测
- 主动指出方法论问题（实验设计缺陷、统计错误、数据泄露等）
- 始终检查：结果是否可复现？随机种子是否固定？依赖是否已锁定？
- 先调查求证，而非直接确认用户的假设

---

### 配置

OpenResearch 不绑定特定模型提供商，支持 Claude、OpenAI、Gemini 及本地模型。配置格式与 OpenCode 完全一致，详见 [OpenCode 文档](https://opencode.ai/docs)。

---

### 参与贡献

欢迎提交 Pull Request，请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

**基于：** [anomalyco/opencode](https://github.com/anomalyco/opencode) — MIT License
