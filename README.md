# OpenResearch

[English](README.md) | [简体中文](README.zh.md)

**An AI research assistant for scientists and researchers.** — [Homepage](https://xiangjinyu.github.io/open-research/) Built on [OpenCode](https://github.com/anomalyco/opencode), extended with research-specific tools and workflows.

---

### Installation

```bash
# Mac / Linux
curl -fsSL https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.ps1 | iex
```

After install, run `openresearch` in any project directory.

The install script respects `$OPENRESEARCH_INSTALL_DIR` to customize the install path.

---

### Modes

Switch between modes with the `Tab` key.

| Mode | Description |
|------|-------------|
| **research** | Default. Full-access agent for running experiments, writing code, and analyzing data. |
| **plan** | Read-only. Explore a project and design a research plan before touching anything. |
| **review** | Paper review mode. Rigorous academic reviews following NeurIPS/ICLR/ICML standards. Also helps with rebuttals. |
| **game** | Turns research into an exploration game with six discoverable regions — from spark to chronicle. |

---

### Research-Specific Tools

**`papersearch`** — Search academic literature without leaving the terminal.
- Backends: [Semantic Scholar](https://www.semanticscholar.org/) (best relevance, AI-generated TLDRs) and [OpenAlex](https://openalex.org/) (250M+ works, broadest coverage)
- Filters: year range, field of study, result count
- No API key required

**`websearch`** — Free web search via DuckDuckGo. No API key required.

**Lab Journal** — Persistent experiment tracking across sessions (load via `/skill lab-journal`).
- Records experiment intent, method, evidence, and interpretation
- Maintains a rolling `summary.md` so future sessions can pick up where you left off
- DAG-structured `index.json` tracks dependencies between experiments
- Includes a CLI (`cli.py`) for scaffolding new experiments

---

### Scientific Rigor

The research agent is prompted to:

- Distinguish established facts from preliminary findings and speculation
- Flag methodological issues (flawed design, statistical errors, data leakage) proactively
- Always check: Is this reproducible? Are random seeds set? Are dependencies pinned?
- Investigate to find the truth rather than confirming assumptions

---

### Configuration

OpenResearch is provider-agnostic and works with Claude, OpenAI, Gemini, and local models. See the [OpenCode documentation](https://opencode.ai/docs) for provider setup — the configuration format is identical.

---

### Contributing

Pull requests welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

**Based on:** [anomalyco/opencode](https://github.com/anomalyco/opencode) — MIT License
