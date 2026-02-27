#!/usr/bin/env python3
"""Lab journal CLI. Zero external dependencies."""

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path


def git_root():
    """Find the git repository root, or None."""
    p = Path(".").resolve()
    for d in [p, *p.parents]:
        if (d / ".git").exists():
            return d
    return None


def find_root(start=None):
    """Locate lab-journal/: explicit path > walk up from cwd > {git-root}/lab-journal."""
    if start:
        p = Path(start).resolve()
        if (p / "experiments").is_dir():
            return p
    for d in [Path(".").resolve(), *(Path(".").resolve().parents)]:
        candidate = d / "lab-journal"
        if candidate.is_dir() and (candidate / "experiments").is_dir():
            return candidate
    gr = git_root()
    if gr:
        candidate = gr / "lab-journal"
        if candidate.is_dir() and (candidate / "experiments").is_dir():
            return candidate
    return None


def parse_frontmatter(text):
    """Extract YAML frontmatter from markdown as a dict. No pyyaml needed."""
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return None
    result = {}
    for line in m.group(1).strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            items = [x.strip().strip("\"'") for x in val[1:-1].split(",") if x.strip()]
            result[key] = items
        elif val.startswith('"') and val.endswith('"'):
            result[key] = val[1:-1]
        elif val.startswith("'") and val.endswith("'"):
            result[key] = val[1:-1]
        else:
            result[key] = val
    return result


def cmd_init(args):
    if args.path:
        root = Path(args.path)
    else:
        gr = git_root()
        root = (gr / "lab-journal") if gr else Path("lab-journal")
    root = root.resolve()
    for d in ["experiments", "tables"]:
        (root / d).mkdir(parents=True, exist_ok=True)
    summary = root / "summary.md"
    if not summary.exists():
        summary.write_text(f"# Lab Journal\n\nInitialized {date.today().isoformat()}. No experiments yet.\n")
    index = root / "index.json"
    if not index.exists():
        index.write_text(json.dumps({"project": root.name, "experiments": []}, indent=2) + "\n")
    print(f"Initialized lab journal at {root}")


def cmd_build_index(args):
    root = find_root(args.path or ".")
    if not root:
        sys.exit("No lab-journal found. Run `lab-journal init <path>` first.")
    experiments = []
    for f in sorted((root / "experiments").glob("*.md")):
        fm = parse_frontmatter(f.read_text())
        if not fm or "id" not in fm:
            print(f"  skip {f.name}: no valid frontmatter", file=sys.stderr)
            continue
        experiments.append({
            "id": fm.get("id", ""),
            "slug": fm.get("slug", ""),
            "type": fm.get("type", ""),
            "status": fm.get("status", ""),
            "conclusion_type": fm.get("conclusion_type", ""),
            "conclusion": fm.get("conclusion", ""),
            "depends_on": fm.get("depends_on", []),
            "tags": fm.get("tags", []),
            "created": fm.get("created", ""),
        })
    # rebuild leads_to from depends_on
    leads_to = {}
    for exp in experiments:
        for dep in exp["depends_on"]:
            leads_to.setdefault(dep, []).append(exp["id"])
    for exp in experiments:
        exp["leads_to"] = leads_to.get(exp["id"], [])

    index_path = root / "index.json"
    data = {"project": root.name, "experiments": experiments}
    index_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"Indexed {len(experiments)} experiments → {index_path}")


def cmd_new(args):
    root = find_root(args.path or ".")
    if not root:
        sys.exit("No lab-journal found. Run `lab-journal init <path>` first.")
    existing = sorted((root / "experiments").glob("*.md"))
    next_id = 1
    if existing:
        last = existing[-1].name
        m = re.match(r"(\d+)", last)
        if m:
            next_id = int(m.group(1)) + 1
    id_str = f"{next_id:03d}"
    slug = args.slug or "untitled"
    filename = f"{id_str}-{slug}.md"
    exp_type = args.type or "exploration"
    today = date.today().isoformat()
    content = f"""---
id: "{id_str}"
slug: {slug}
type: {exp_type}
status: pending
created: {today}
concluded:
depends_on: [{', '.join(f'"{d}"' for d in (args.depends or []))}]
conclusion_type:
conclusion:
tags: []
commit:
---

# {id_str}: {slug}

## Question


## Method


## Evidence


## Interpretation


## Next

"""
    dest = root / "experiments" / filename
    dest.write_text(content)
    print(f"Created {dest}")


def main():
    parser = argparse.ArgumentParser(prog="lab-journal")
    sub = parser.add_subparsers(dest="command")

    p_init = sub.add_parser("init", help="Initialize a new lab journal at {git-root}/lab-journal")
    p_init.add_argument("path", default=None, nargs="?")

    p_index = sub.add_parser("build-index", help="Rebuild index.json from experiments/*.md")
    p_index.add_argument("path", nargs="?", help="Path to lab-journal root")

    p_new = sub.add_parser("new", help="Scaffold a new experiment")
    p_new.add_argument("slug", help="Short descriptive name")
    p_new.add_argument("--type", choices=["hypothesis", "optimization", "exploration"], default="exploration")
    p_new.add_argument("--depends", nargs="*", help="IDs of prerequisite experiments")
    p_new.add_argument("--path", help="Path to lab-journal root")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return
    {"init": cmd_init, "build-index": cmd_build_index, "new": cmd_new}[args.command](args)


if __name__ == "__main__":
    main()
