<pre align="center">
  ___  ____  _____ _   _
 / _ \|  _ \| ____| \ | |
| | | | |_) |  _| |  \| |
| |_| |  __/| |___| |\  |
 \___/|_|   |_____|_| \_|

 ____  _____ ____  _____    _    ____   ____ _   _
|  _ \| ____/ ___|| ____|  / \  |  _ \ / ___| | | |
| |_) |  _| \___ \|  _|   / _ \ | |_) | |   | |_| |
|  _ <| |___ ___) | |___ / ___ \|  _ <| |___|  _  |
|_| \_\_____|____/|_____/_/   \_\_| \_\\____|_| |_|
</pre>

<p align="center">The open source AI research assistant.</p>

<p align="center">
  <a href="https://xiangjinyu.github.io/open-research/"><img alt="Homepage" src="https://img.shields.io/badge/homepage-open--research-blue?style=flat-square" /></a>
  <a href="https://github.com/XiangJinyu/open-research/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/XiangJinyu/open-research?style=flat-square" /></a>
  <a href="https://github.com/XiangJinyu/open-research/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/XiangJinyu/open-research?style=flat-square" /></a>
  <a href="https://github.com/XiangJinyu/open-research/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/XiangJinyu/open-research?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh.md">简体中文</a>
</p>

---

### Installation

```bash
# Mac / Linux
curl -fsSL https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.ps1 | iex
```

After install, run `openresearch` in any project directory.

Set `$OPENRESEARCH_INSTALL_DIR` to customize the install path.

---

### Modes

Switch between modes with the `Tab` key.

| Mode | Description |
|------|-------------|
| **research** | Default. Full-access agent for running experiments, writing code, and analyzing data. |
| **plan** | Read-only. Explore a project and design a research plan before touching anything. |
| **review** | Rigorous academic reviews following NeurIPS/ICLR/ICML standards. Also helps with rebuttals. |
| **game** | Turns research into an exploration game with six discoverable regions. |

---

### Research Tools

**`papersearch`** — Search academic literature without leaving the terminal.
- [Semantic Scholar](https://www.semanticscholar.org/) — best relevance, AI-generated TLDRs
- [OpenAlex](https://openalex.org/) — 250M+ works, broadest coverage
- Filters: year range, field of study, result count. No API key required.

**`websearch`** — Free web search via DuckDuckGo. No API key required.

**Lab Journal** — Persistent experiment tracking across sessions (load with `/skill lab-journal`).
- Records intent, method, evidence, and interpretation per experiment
- Rolling `summary.md` lets future sessions pick up where you left off
- DAG-structured `index.json` tracks dependencies between experiments

---

### Scientific Rigor

The agent is prompted to:

- Distinguish established facts from preliminary findings and speculation
- Flag methodological issues (experimental design, statistics, data leakage) proactively
- Check reproducibility: random seeds, pinned dependencies, deterministic pipelines
- Investigate before confirming assumptions

---

### Configuration

Provider-agnostic — works with Claude, OpenAI, Gemini, and local models. Configuration format follows [OpenCode](https://opencode.ai/docs).

---

### Contributing

Pull requests welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Built on [anomalyco/opencode](https://github.com/anomalyco/opencode) · MIT License
