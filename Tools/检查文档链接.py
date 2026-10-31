# -*- coding: utf-8 -*-
"""检查 docs/ 下 md 与 html 里的相对链接是否都能落到真实文件。

用途：改目录结构、加新文档之后跑一遍，确认没有断链。
    python Tools/检查文档链接.py
"""
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
MD_OPEN = re.compile(r'\]\(')
HTML_LINK = re.compile(r'(?:href|src)="([^"]+)"', re.I)


def md_targets(text):
    for m in MD_OPEN.finditer(text):
        i, depth = m.end(), 1
        while i < len(text) and depth:
            c = text[i]
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    break
            elif c == '\n':
                break
            i += 1
        if depth == 0:
            yield text[m.end():i]


def check(path: Path):
    text = path.read_text(encoding='utf-8', errors='surrogateescape')
    if path.suffix.lower() == '.md':
        targets = list(md_targets(text))
    else:
        targets = [unquote(t) for t in HTML_LINK.findall(text)]
    bad = []
    for t in targets:
        t = t.split('#', 1)[0].strip()
        if not t or re.match(r'^(https?:|mailto:|data:|javascript:)', t):
            continue
        f = (path.parent / unquote(t)).resolve()
        if not f.exists():
            bad.append(t)
    return bad


def main():
    files = sorted(DOCS.rglob('*.md')) + sorted(DOCS.rglob('*.html'))
    total_bad = 0
    for f in files:
        bad = check(f)
        if bad:
            total_bad += len(bad)
            print(f'\n{f.relative_to(ROOT)}')
            for b in bad:
                print(f'   断链 -> {b}')
    print(f'\n检查 {len(files)} 个文件，断链 {total_bad} 处')
    return 1 if total_bad else 0


if __name__ == '__main__':
    sys.exit(main())
