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
# 代码块 / 行内代码里出现的 [文字](路径) 只是被引用的源码文本，不是可点的链接，
# 检查时必须先挖掉，否则「描述某个断链的文档」自己会被判成断链。
MD_FENCE = re.compile(r'```.*?```', re.S)
MD_CODE = re.compile(r'`[^`\n]*`')
HTML_CODE = re.compile(r'<(code|pre)\b[^>]*>.*?</\1>', re.S | re.I)


def strip_code(text, is_md):
    if is_md:
        text = MD_FENCE.sub(lambda m: ' ' * len(m.group()), text)
        return MD_CODE.sub(lambda m: ' ' * len(m.group()), text)
    return HTML_CODE.sub(lambda m: ' ' * len(m.group()), text)


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
    raw = path.read_text(encoding='utf-8', errors='surrogateescape')
    is_md = path.suffix.lower() == '.md'
    text = strip_code(raw, is_md)
    if is_md:
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
