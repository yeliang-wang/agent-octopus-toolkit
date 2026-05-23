#!/usr/bin/env python3
"""Portable command sandbox for agent-octopus-toolkit agents.

The sandbox centralizes OS-sensitive checks so installed agents do not need to
create ad hoc Python files or depend on optional commands such as rg, sed, curl,
lsof, or netstat. It intentionally uses only Python's standard library and
explicit subprocess calls.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable


EXCLUDE_RE = re.compile(r"(target|\.install|\.tar\.gz|\.jar$|\.log$|/tmp|output/)")


def emit(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def run(args: list[str], cwd: Path | None = None, check: bool = False) -> dict:
    try:
        completed = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except FileNotFoundError as exc:
        result = {
            "command": args,
            "returncode": 127,
            "stdout": "",
            "stderr": str(exc),
            "missing": args[0],
        }
        if check:
            raise SystemExit(json.dumps(result, ensure_ascii=False, indent=2))
        return result

    result = {
        "command": args,
        "returncode": completed.returncode,
        "stdout": completed.stdout.rstrip(),
        "stderr": completed.stderr.rstrip(),
    }
    if check and completed.returncode != 0:
        raise SystemExit(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def repo_root(path: Path) -> Path:
    result = run(["git", "rev-parse", "--show-toplevel"], cwd=path)
    if result["returncode"] != 0:
        raise SystemExit(f"Not a git repository: {path}")
    return Path(result["stdout"]).resolve()


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def doctor(args: argparse.Namespace) -> None:
    tools = ["git", "python3", "java", "rg", "curl", "ssh"]
    emit(
        {
            "ok": True,
            "cwd": str(Path.cwd()),
            "platform": {
                "system": platform.system(),
                "release": platform.release(),
                "machine": platform.machine(),
                "python": sys.version.split()[0],
            },
            "tools": {tool: shutil.which(tool) for tool in tools},
            "notes": [
                "rg, curl, java, and ssh are optional for sandbox commands.",
                "Python stdlib fallbacks are used for pattern, URL, and port checks.",
            ],
        }
    )


def git_inspect(args: argparse.Namespace) -> None:
    cwd = repo_root(Path(args.cwd).resolve())
    commands = {
        "status_branch": ["git", "status", "--short", "--branch"],
        "remote": ["git", "remote", "-v"],
        "current_branch": ["git", "branch", "--show-current"],
        "head": ["git", "rev-parse", "--short", "HEAD"],
        "recent_log": ["git", "log", "--oneline", "--decorate", "-5"],
    }
    if args.include_refs:
        commands["branch_vv"] = ["git", "branch", "-vv"]
        commands["remote_heads"] = ["git", "ls-remote", "--heads", args.remote]

    emit({"repo": str(cwd), "results": {name: run(cmd, cwd=cwd) for name, cmd in commands.items()}})


def git_commit_check(args: argparse.Namespace) -> None:
    cwd = repo_root(Path(args.cwd).resolve())
    status = run(["git", "status", "--short"], cwd=cwd)
    cached_names = run(["git", "diff", "--cached", "--name-only"], cwd=cwd)
    working_lines = status["stdout"].splitlines() if status["stdout"] else []
    cached_files = cached_names["stdout"].splitlines() if cached_names["stdout"] else []
    emit(
        {
            "repo": str(cwd),
            "status": status,
            "diff_stat": run(["git", "diff", "--stat"], cwd=cwd),
            "diff_check": run(["git", "diff", "--check"], cwd=cwd),
            "cached_stat": run(["git", "diff", "--cached", "--stat"], cwd=cwd),
            "excluded_working_candidates": [line for line in working_lines if EXCLUDE_RE.search(line)],
            "excluded_staged_candidates": [path for path in cached_files if EXCLUDE_RE.search(path)],
        }
    )


def git_conflicts(args: argparse.Namespace) -> None:
    cwd = repo_root(Path(args.cwd).resolve())
    names = run(["git", "diff", "--name-only", "--diff-filter=U"], cwd=cwd)
    emit(
        {
            "repo": str(cwd),
            "status": run(["git", "status", "--short"], cwd=cwd),
            "conflicted_files": names["stdout"].splitlines() if names["stdout"] else [],
        }
    )


def health_check(args: argparse.Namespace) -> None:
    request = urllib.request.Request(args.url, headers={"User-Agent": "agent-octopus-sandbox/1"})
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            body = response.read(args.max_bytes).decode("utf-8", errors="replace")
            emit({"url": args.url, "ok": True, "status": response.status, "body_preview": body})
    except urllib.error.HTTPError as exc:
        body = exc.read(args.max_bytes).decode("utf-8", errors="replace")
        emit({"url": args.url, "ok": False, "status": exc.code, "body_preview": body})
    except Exception as exc:
        emit({"url": args.url, "ok": False, "error": str(exc)})


def port_check(args: argparse.Namespace) -> None:
    results = []
    for port in args.ports:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(args.timeout)
        try:
            code = sock.connect_ex((args.host, port))
            results.append({"host": args.host, "port": port, "open": code == 0, "connect_ex": code})
        finally:
            sock.close()
    emit({"results": results})


def find_artifacts(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    run_dir = root / "output" / "runs" / args.run_id if args.run_id else root / "output" / "runs"
    final_dir = run_dir / "final" if args.run_id else None

    def list_paths(base: Path, patterns: Iterable[str]) -> list[str]:
        if not base.exists():
            return []
        found: list[str] = []
        for pattern in patterns:
            found.extend(str(path) for path in base.rglob(pattern) if path.is_file())
        return sorted(set(found))

    emit(
        {
            "root": str(root),
            "run_dir": str(run_dir),
            "run_dir_exists": run_dir.exists(),
            "final_dir": str(final_dir) if final_dir else None,
            "final_dir_exists": final_dir.exists() if final_dir else None,
            "manifest": str(final_dir / "manifest.json") if final_dir else None,
            "manifest_exists": (final_dir / "manifest.json").exists() if final_dir else None,
            "artifacts": list_paths(run_dir, ["*.html", "*.pdf", "*.docx", "*.xlsx", "*.json", "*.png"]),
        }
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="agent-octopus-toolkit sandbox")
    sub = parser.add_subparsers(dest="command", required=True)

    doctor_parser = sub.add_parser("doctor", help="Inspect portable sandbox environment")
    doctor_parser.set_defaults(func=doctor)

    inspect_parser = sub.add_parser("git-inspect", help="Collect standard git inspection data")
    inspect_parser.add_argument("--cwd", default=".")
    inspect_parser.add_argument("--remote", default="origin")
    inspect_parser.add_argument("--include-refs", action="store_true")
    inspect_parser.set_defaults(func=git_inspect)

    commit_parser = sub.add_parser("git-commit-check", help="Collect pre-commit checks")
    commit_parser.add_argument("--cwd", default=".")
    commit_parser.set_defaults(func=git_commit_check)

    conflicts_parser = sub.add_parser("git-conflicts", help="List merge conflict state")
    conflicts_parser.add_argument("--cwd", default=".")
    conflicts_parser.set_defaults(func=git_conflicts)

    health_parser = sub.add_parser("health-check", help="Check an HTTP URL without curl")
    health_parser.add_argument("url")
    health_parser.add_argument("--timeout", type=float, default=10)
    health_parser.add_argument("--max-bytes", type=int, default=4000)
    health_parser.set_defaults(func=health_check)

    port_parser = sub.add_parser("port-check", help="Check TCP ports without lsof/netstat")
    port_parser.add_argument("ports", nargs="+", type=int)
    port_parser.add_argument("--host", default="127.0.0.1")
    port_parser.add_argument("--timeout", type=float, default=1)
    port_parser.set_defaults(func=port_check)

    artifact_parser = sub.add_parser("find-artifacts", help="Inspect output/runs artifacts")
    artifact_parser.add_argument("--root", default=".")
    artifact_parser.add_argument("--run-id")
    artifact_parser.set_defaults(func=find_artifacts)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
