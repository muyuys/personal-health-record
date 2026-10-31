# -*- coding: utf-8 -*-
"""2026-10-30 目录迁移后，重算 md / html 里的相对链接。

迁移把「根目录下按主题分目录」改成 docs/ 与 data/ 两个根，
所有跨目录链接的层数都变了；html 里的中文还是 URL 编码的。
同一份 Markdown 里的图片进了 data/、文档进了 docs/，所以按扩展名分流。

用法：
    python Tools/迁移修正链接.py            # dry-run，只打印
    python Tools/迁移修正链接.py --apply    # 实际写入
"""
import re
import sys
from pathlib import Path
from urllib.parse import quote, unquote

ROOT = Path(__file__).resolve().parent.parent

# 目录级映射：旧（相对根） -> 新（相对根），长前缀优先
DIRMAP = [
    ('健康档案/', 'docs/健康档案/'),
    ('减重记录/', 'docs/减重记录/'),
    ('眼睛/', 'docs/主题/眼睛/'),
    ('鼻子/', 'docs/主题/鼻子/'),
    ('肾功能/', 'docs/主题/肾功能/'),
    ('脱发/', 'docs/主题/脱发/'),
    ('报告原件/', 'data/报告原件/'),
    ('小米健康数据/', 'data/小米健康数据/'),
    ('设计稿/', 'data/设计稿/'),
]
FILEMAP = {
    '舌苔-20261009.jpg': 'data/照片/舌苔-20261009.jpg',
    '使用指南.md': 'docs/使用指南.md',
}
DATA_EXT = {'.png', '.jpg', '.jpeg', '.npy', '.json', '.dcm'}


def map_old_to_new(rel_old: str) -> str:
    """旧位置 -> 新位置。右脚踝 被拆成文档、数据、工具三处，单独判。"""
    p = rel_old
    while p.startswith('./'):
        p = p[2:]

    if p.startswith('右脚踝/'):
        rest = p[len('右脚踝/'):]
        top, _, sub = rest.partition('/')
        ext = Path(p).suffix.lower()
        if top == '检查':
            return 'data/右脚踝/检查/' + sub
        if top in ('ct_analysis', 'longitudinal_analysis'):
            if ext in DATA_EXT:
                return f'data/右脚踝/{top}/' + sub
            if ext == '.py':
                return 'Tools/影像分析/' + sub
            return f'docs/主题/右脚踝/{top}/' + sub

    for old, new in DIRMAP:
        if p.startswith(old):
            return new + p[len(old):]
    return FILEMAP.get(p, p)


def old_of_new(rel_new: str) -> str:
    """新位置 -> 迁移前的位置（用于知道当时相对基准在哪）。"""
    for top in ('ct_analysis', 'longitudinal_analysis'):
        pre = f'docs/主题/右脚踝/{top}/'
        if rel_new.startswith(pre):
            return '右脚踝/' + top + '/' + rel_new[len(pre):]
    if rel_new.startswith('data/右脚踝/检查/'):
        return '右脚踝/检查/' + rel_new[len('data/右脚踝/检查/'):]
    for top in ('ct_analysis', 'longitudinal_analysis'):
        pre = f'data/右脚踝/{top}/'
        if rel_new.startswith(pre):
            return '右脚踝/' + top + '/' + rel_new[len(pre):]
    table = {new: old for old, new in DIRMAP}
    table['data/照片/'] = ''          # 旧位在根下
    for new, old in sorted(table.items(), key=lambda x: -len(x[0])):
        if rel_new.startswith(new):
            return old + rel_new[len(new):]
    return rel_new


def normjoin(base: str, rel: str) -> str:
    parts = [p for p in base.split('/') if p] if base else []
    for seg in rel.split('/'):
        if seg in ('', '.'):
            continue
        if seg == '..':
            if parts:
                parts.pop()
        else:
            parts.append(seg)
    return '/'.join(parts)


def relpath(target: str, from_file: str, encode: bool) -> str:
    tgt = [p for p in target.split('/') if p]
    base = [p for p in from_file.split('/')[:-1] if p]
    i = 0
    while i < len(base) and i < len(tgt) - 1 and base[i] == tgt[i]:
        i += 1
    out = '/'.join(['..'] * (len(base) - i) + tgt[i:])
    # + 必须保留：原 html 里文件名含 '+'，编码后会找不到文件
    return quote(out, safe="/:._~()!*'@,+") if encode else out


def fix(target: str, old_file: str, new_file: str, encode: bool):
    if not target or target.startswith(('#', 'http:', 'https:', 'mailto:', 'data:')):
        return None
    raw = unquote(target) if encode else target
    if raw.startswith('F:/Health/') or raw.startswith('F:\\Health\\'):
        old_rel = raw.replace('\\', '/').split('Health/', 1)[1]
    else:
        old_dir = old_file.rsplit('/', 1)[0] if '/' in old_file else ''
        old_rel = normjoin(old_dir, raw) if old_dir else normjoin('', raw)
    new_rel = map_old_to_new(old_rel)
    plain = relpath(new_rel, new_file, False)
    if plain == raw:          # 位置没变，别动它（也不要把中文重新编码）
        return None
    out = relpath(new_rel, new_file, encode)
    return out if out != target else None


# md: ]( ... )  允许路径里带成对括号；html: href="..." / src="..."
MD_OPEN = re.compile(r'\]\(')


def walk_md(text):
    """逐个找出 md 链接目标，正确处理文件名里的括号。"""
    spans = []
    for m in MD_OPEN.finditer(text):
        i = m.end()
        depth = 1
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
            spans.append((m.end(), i, text[m.end():i]))
    return spans


HTML_LINK = re.compile(r'(href="|src=")([^"]+)(")', re.I)


def process(path: Path, apply: bool):
    rel_new = path.relative_to(ROOT).as_posix()
    old_file = old_of_new(rel_new)
    is_html = path.suffix.lower() == '.html'
    text = path.read_text(encoding='utf-8', errors='surrogateescape')
    changes = []

    if is_html:
        def repl(m):
            fixed = fix(m.group(2), old_file, rel_new, True)
            if not fixed:
                return m.group(0)
            changes.append((m.group(2), fixed))
            return m.group(1) + fixed + m.group(3)
        new_text = HTML_LINK.sub(repl, text)
    else:
        parts, last = [], 0
        for start, end, target in walk_md(text):
            fixed = fix(target, old_file, rel_new, False)
            if not fixed:
                continue
            parts.append(text[last:start])
            parts.append(fixed)
            changes.append((target, fixed))
            last = end
        parts.append(text[last:])
        new_text = ''.join(parts)

    if changes:
        print(f'\n{rel_new}')
        for a, b in changes:
            print(f'   {a}\n   -> {b}')
        if apply:
            path.write_text(new_text, encoding='utf-8', errors='surrogateescape')
    return len(changes), bool(changes)


def main():
    apply = '--apply' in sys.argv
    files = sorted((ROOT / 'docs').rglob('*.md')) + sorted((ROOT / 'docs').rglob('*.html'))
    total = touched = 0
    for p in files:
        n, t = process(p, apply)
        total += n
        touched += 1 if t else 0
    print(f'\n{"已写入" if apply else "待修改"}：{total} 处链接，{touched}/{len(files)} 个文件')
    if not apply:
        print('确认无误后加 --apply 执行')


if __name__ == '__main__':
    main()
