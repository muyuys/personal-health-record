'use strict';
/* 回答内容的轻量 Markdown 渲染。
   目标只有一件事：把模型返回的 Markdown 转成可读的 HTML。
   规则刻意收窄——先整体转义，再按白名单拼装标签，链接只放行 http(s)、锚点与站内相对路径。
   不做 HTML 直通、不引第三方库（本项目离线运行，vendor 里也不该为这点语法塞一个 30KB 的解析器）。 */
(function () {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

  // 中文与全角标点：软换行处直接拼接，不加空格（否则中文段落会出现莫名的缝）
  const CJK_TAIL = /[\u2E80-\u9FFF\u3000-\u303F\uFE30-\uFE4F\uFF00-\uFFEF]$/;
  const CJK_HEAD = /^[\u2E80-\u9FFF\u3000-\u303F\uFE30-\uFE4F\uFF00-\uFFEF]/;
  const joinLine = (a, b) => (!a ? b : (CJK_TAIL.test(a) || CJK_HEAD.test(b) ? a + b : a + ' ' + b));

  const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const HEADING = /^(#{1,6})\s+(.*)$/;
  const FENCE = /^\s*(```|~~~)/;
  const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const QUOTE = /^\s*>\s?/;
  const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  function inline(raw) {
    let s = esc(raw);
    const stash = [];
    const hold = html => '\u0001' + (stash.push(html) - 1) + '\u0001';

    // 行内代码最先占位：里面的 * _ [ ] 不该再被解析
    s = s.replace(/`([^`]+)`/g, (_, code) => hold('<code>' + code + '</code>'));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
      const url = href.replace(/&amp;/g, '&');
      if (!/^(https?:\/\/|#|\/(?!\/))/i.test(url)) return all;
      return hold('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>');
    });
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+?)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(（，。、；：！？])\*([^*\n]+?)\*(?=$|[\s)）.,，。；;：:！？])/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[+i]);
  }

  function cellRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(cell => cell.trim());
  }

  function table(lines, start) {
    if (start + 1 >= lines.length) return null;
    if (lines[start].indexOf('|') < 0) return null;
    if (!TABLE_DIVIDER.test(lines[start + 1]) || !/^[\s|:-]+$/.test(lines[start + 1])) return null;
    const head = cellRow(lines[start]);
    let i = start + 2, body = '';
    while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) {
      body += '<tr>' + cellRow(lines[i]).map(cell => '<td>' + inline(cell) + '</td>').join('') + '</tr>';
      i++;
    }
    const html = '<div class="md-table"><table><thead><tr>' + head.map(cell => '<th>' + inline(cell) + '</th>').join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
    return [html, i];
  }

  function list(lines, start) {
    const first = lines[start].match(LIST_ITEM);
    const base = first[1].length;
    const ordered = /\d/.test(first[2]);
    let html = ordered ? '<ol>' : '<ul>';
    let i = start, last = '';
    while (i < lines.length) {
      const m = lines[i].match(LIST_ITEM);
      if (!m) {
        // 缩进续行：接在上一条项内，否则列表到此为止
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && last) {
          last = joinLine(last, lines[i].trim());
          html = html.slice(0, html.lastIndexOf('<li>')) + '<li>' + inline(last) + '</li>';
          i++;
          continue;
        }
        break;
      }
      const indent = m[1].length;
      if (indent < base) break;
      if (indent > base) {
        const [sub, next] = list(lines, i);
        html = html.replace(/<\/li>$/, sub + '</li>');
        i = next;
        continue;
      }
      // 无序与有序相邻时切成两个列表，否则会被并进同一个 <ul>
      if (/\d/.test(m[2]) !== ordered) break;
      let text = m[3];
      i++;
      while (i < lines.length && lines[i].trim() && !LIST_ITEM.test(lines[i]) && !HEADING.test(lines[i].trim()) && !FENCE.test(lines[i])) {
        text = joinLine(text, lines[i].trim());
        i++;
      }
      html += '<li>' + inline(text) + '</li>';
      last = text;
    }
    return [html + (ordered ? '</ol>' : '</ul>'), i];
  }

  function render(source) {
    const text = String(source ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    if (!text.trim()) return '';
    const lines = text.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      const fence = line.match(FENCE);
      if (fence) {
        const mark = fence[1];
        const body = [];
        i++;
        while (i < lines.length && lines[i].trim().indexOf(mark) !== 0) { body.push(lines[i]); i++; }
        i++;
        out.push('<pre class="md-pre"><code>' + esc(body.join('\n')) + '</code></pre>');
        continue;
      }

      const heading = line.match(HEADING);
      if (heading) {
        const level = heading[1].length;
        const tag = level <= 2 ? 'h3' : level === 3 ? 'h4' : 'h5';
        out.push('<' + tag + '>' + inline(heading[2].trim()) + '</' + tag + '>');
        i++;
        continue;
      }

      if (HR.test(line)) { out.push('<hr>'); i++; continue; }

      if (QUOTE.test(line)) {
        const body = [];
        while (i < lines.length && QUOTE.test(lines[i])) { body.push(lines[i].replace(QUOTE, '')); i++; }
        out.push('<blockquote>' + render(body.join('\n')) + '</blockquote>');
        continue;
      }

      if (LIST_ITEM.test(line)) {
        const [html, next] = list(lines, i);
        out.push(html);
        i = next;
        continue;
      }

      const tbl = table(lines, i);
      if (tbl) { out.push(tbl[0]); i = tbl[1]; continue; }

      // 普通段落：吃到空行或下一个块级标记为止
      const body = [line.trim()];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const trimmed = next.trim();
        if (!trimmed || HEADING.test(trimmed) || FENCE.test(next) || QUOTE.test(next) || LIST_ITEM.test(next) || HR.test(next)) break;
        if (next.indexOf('|') >= 0 && table(lines, i)) break;
        body.push(trimmed);
        i++;
      }
      const joined = body.reduce((acc, part) => joinLine(acc, part), '');
      out.push('<p>' + inline(joined) + '</p>');
    }
    return out.join('');
  }

  window.MD = { render, escape: esc };
})();
