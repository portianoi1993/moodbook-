#!/usr/bin/env python3
"""Static checks for index.html — no dependencies, no network, no Node.

Run from the project root:

    python3 tests/checks.py

Exits non-zero if any check fails, so it can gate a commit.
These guard the failure modes that have actually bitten this project:
an unescaped apostrophe took the entire inline script down, a stray </div>
pushed the results block outside its centred container, and duplicate event
listeners made every Enter key run two concurrent searches.
"""

import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")

failures = []
passes = []


def check(name, ok, detail=""):
    (passes if ok else failures).append((name, detail))


def read_index():
    with open(INDEX, encoding="utf-8") as f:
        return f.read()


def script_blocks(html):
    return re.findall(r"<script>(.*?)</script>", html, re.S)


# ── 1. Unterminated string literals ──────────────────────────────────────────
# A bare apostrophe inside a '...' string ends it early and kills the whole
# script, leaving every function undefined.
def check_quotes(html):
    bad = []
    for block_no, block in enumerate(script_blocks(html)):
        for line_no, line in enumerate(block.split("\n"), 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            for m in re.finditer(r"\w'\w", line):
                before = line[: m.start()]
                # an odd count means we are inside a single-quoted string
                if before.count("'") - before.count("\\'") and \
                   (before.count("'") - before.count("\\'")) % 2 == 1:
                    bad.append(f"script #{block_no}, line {line_no}: {stripped[:80]}")
                    break
    check("no unescaped apostrophes inside JS strings", not bad, "; ".join(bad))


# ── 2. Control characters in source ──────────────────────────────────────────
# Escapes written through tooling have silently collapsed into real control
# characters here before, which breaks regexes invisibly.
def check_control_chars(html):
    found = {
        hex(ord(c)) for c in html
        if ord(c) < 32 and c not in "\n\r\t"
    }
    check("no stray control characters", not found, ", ".join(sorted(found)))


# ── 3. div balance ───────────────────────────────────────────────────────────
def check_div_balance(html):
    body = html[html.find("<body>"):]
    diff = len(re.findall(r"<div\b", body)) - len(re.findall(r"</div>", body))
    check("div tags balanced in <body>", diff == 0, f"difference: {diff}")


# ── 4. results block stays inside the centred container ──────────────────────
def check_results_nesting(html):
    class P(HTMLParser):
        def __init__(self):
            super().__init__()
            self.stack = []
            self.chain = None

        def handle_starttag(self, tag, attrs):
            d = dict(attrs)
            if tag == "div":
                self.stack.append(d.get("id") or d.get("class", ""))
                if "results" in d.get("class", ""):
                    self.chain = list(self.stack)

        def handle_endtag(self, tag):
            if tag == "div" and self.stack:
                self.stack.pop()

    p = P()
    p.feed(html)
    chain = p.chain or []
    check("#results nested inside .wrap", any("wrap" in c for c in chain[:-1]),
          " > ".join(chain) or "not found")


# ── 5. duplicate element ids ─────────────────────────────────────────────────
def check_duplicate_ids(html):
    ids = re.findall(r'\sid="([^"]+)"', html)
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    check("no duplicate element ids", not dupes, ", ".join(dupes))


# ── 6. one keydown listener per input ────────────────────────────────────────
# Two listeners on #mainIn used to fire doSearch twice per Enter press, so two
# concurrent searches raced and overwrote each other's state.
def check_duplicate_listeners(html):
    for el in ("mainIn", "addIn", "addInput"):
        n = len(re.findall(rf"{el}\.addEventListener\('keydown'", html))
        if n > 1:
            check(f"single keydown listener on #{el}", False, f"{n} listeners")
            return
    check("single keydown listener per input", True)


# ── 7. no unverified book reaches the curator ────────────────────────────────
def check_unverified_bypass(html):
    ok = "if(!S.bookVerified){" in html and "NEUTRAL_READING_TRACKS" in html
    check("unverified books bypass the AI curator", ok)


# ── 8. lofi guard present and wired ──────────────────────────────────────────
def check_lofi_guard(html):
    ok = ("LOFI_PATTERN" in html
          and "stripLofiFromSeriousBooks(" in html
          and "S.tracks=rankByLikedStyles(stripLofiFromSeriousBooks(" in html)
    check("lofi guard defined and applied to results", ok)


# ── 9. no hardcoded OpenAI key ───────────────────────────────────────────────
def check_no_openai_key(html):
    check("no OpenAI key in client code", "sk-" not in html)


def main():
    html = read_index()
    check_quotes(html)
    check_control_chars(html)
    check_div_balance(html)
    check_results_nesting(html)
    check_duplicate_ids(html)
    check_duplicate_listeners(html)
    check_unverified_bypass(html)
    check_lofi_guard(html)
    check_no_openai_key(html)

    for name, _ in passes:
        print(f"  PASS  {name}")
    for name, detail in failures:
        print(f"  FAIL  {name}" + (f"\n        {detail}" if detail else ""))

    print(f"\n{len(passes)} passed, {len(failures)} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
