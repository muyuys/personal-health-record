'use strict';
/* 检验报告解析引擎 —— 把粘贴的化验单文字或体检导出的 CSV 转成待确认的记录。

   设计原则：只做转写，不做推断。
   - 识别不到的字段留空，不猜、不用历史值填补；
   - 参考范围缺失就如实标出，宁可让趋势图少一条色带，也不编一个区间；
   - 每行带置信度，低置信度的交给预览表人工确认。 */
(function (global) {
  const CATS = ['血常规', '肝功能', '肾功能', '其他'];

  /* ---------------- 项目名 → 类别词典 ---------------- */
  const ITEM_DICT = [
    ['血常规', [
      '白细胞', '红细胞', '血红蛋白', '血小板', '中性粒细胞', '淋巴细胞', '单核细胞',
      '嗜酸性', '嗜碱性', '红细胞压积', '平均红细胞', '红细胞分布', '平均血小板',
      '网织红细胞', '粒细胞', '红细胞沉降', '血沉',
      'WBC', 'RBC', 'HGB', 'HCT', 'MCV', 'MCH', 'MCHC', 'PLT', 'RDW', 'MPV',
      'PDW', 'NEUT', 'LYM', 'MONO', 'EOS', 'BASO', 'NRBC', 'ESR'
    ]],
    ['肝功能', [
      '丙氨酸氨基转移酶', '天门冬氨酸氨基转移酶', '天冬氨酸氨基转移酶', '谷丙转氨酶', '谷草转氨酶', '转氨酶',
      '总胆红素', '直接胆红素', '间接胆红素', '总蛋白', '白蛋白', '球蛋白', '白球比',
      '碱性磷酸酶', '谷氨酰转肽酶', '胆汁酸', '前白蛋白',
      'ALT', 'AST', 'ALP', 'GGT', 'TBIL', 'DBIL', 'IBIL', 'TP', 'ALB', 'GLB'
    ]],
    ['肾功能', [
      '肌酐', '尿素', '尿酸', '肾小球滤过', '胱抑素', '尿素氮', '尿微量白蛋白',
      'CREA', 'CRE', 'UA', 'BUN', 'eGFR', 'CysC', 'mALB'
    ]],
    ['其他', [
      '总胆固醇', '甘油三酯', '高密度脂蛋白', '低密度脂蛋白', '载脂蛋白', '脂蛋白',
      '空腹血糖', '葡萄糖', '糖化血红蛋白', '胰岛素',
      '血钾', '血钠', '血氯', '血钙', '血镁', '血磷', '二氧化碳结合力',
      '促甲状腺', '甲状腺素', '三碘甲状腺', '游离T3', '游离T4', '游离甲状腺',
      '维生素', '叶酸', '同型半胱氨酸', '铁蛋白', 'C反应蛋白', '降钙素原',
      '尿蛋白', '尿潜血', '尿糖', '尿比重', '酸碱度', '酮体', '尿胆原', '亚硝酸盐', '白细胞酯酶',
      'CHOL', 'TG', 'HDL', 'LDL', 'GLU', 'HBA1C', 'TSH', 'FT3', 'FT4', 'CRP'
    ]]
  ];

  /* 单字项目名只在整名完全相等时才算命中，避免「氯化钠」误判成血氯 */
  const SINGLE = { '钾': '其他', '钠': '其他', '氯': '其他', '钙': '其他', '镁': '其他', '磷': '其他' };

  function matchCategory(name) {
    const n = String(name).toLowerCase().replace(/\s+/g, '');
    if (SINGLE[n]) return SINGLE[n];
    let best = null;
    for (const [cat, words] of ITEM_DICT) {
      for (const w of words) {
        const kw = w.toLowerCase();
        if (kw.length < 2) continue;
        if (n.includes(kw) && (!best || kw.length > best.len)) best = { cat, len: kw.length };
      }
    }
    return best ? best.cat : null;
  }

  /* ---------------- 文本归一化 ---------------- */
  function halfWidth(s) {
    return String(s)
      .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/\u00a0/g, ' ')
      .replace(/[\u3000]/g, '\t')
      .replace(/[～〜]/g, '~')
      .replace(/[│┃┆∣]/g, '\t')
      .replace(/[−–—]/g, '-');
  }

  const DATE_RE = /(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/;

  function findDate(s) {
    const m = String(s).match(DATE_RE);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /* 报告常用两位年份：采样时间 26-09-04 11:52。只在含时间/日期字样的行里启用，
     避免把参考区间之类误判成日期。 */
  const SHORT_DATE_RE = /(?:^|[^\d])(\d{2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})(?:[^\d]|$)/;

  function findShortDate(s) {
    const m = String(s).match(SHORT_DATE_RE);
    if (!m) return null;
    const y = 2000 + Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const RANGE_RE = /^[（(\[]?\s*(\d+(?:\.\d+)?)\s*(?:-{1,2}|~|至|到)\s*(\d+(?:\.\d+)?)\s*[)）\]]?$/;

  function parseRange(t) {
    if (t == null) return null;
    const m = String(t).trim().match(RANGE_RE);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a <= b ? { low: a, high: b } : { low: b, high: a };
  }

  function parseOneSided(t) {
    const m = String(t).trim().match(/^([<>])\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const v = Number(m[2]);
    if (!Number.isFinite(v)) return null;
    return m[1] === '<' ? { low: null, high: v } : { low: v, high: null };
  }

  function parseValue(tok) {
    if (tok == null) return null;
    let t = String(tok).trim();
    if (!t) return null;
    let flag = '';
    if (/[↑⇑]/.test(t)) flag = 'H';
    if (/[↓⇓]/.test(t)) flag = 'L';
    t = t.replace(/[↑↓⇑⇓*#＊]/g, '').replace(/[（(]\s*[HLhl]\s*[）)]/g, '').trim();
    const m = t.match(/^([<>])?\s*(-?\d+(?:\.\d+)?)\s*([HLhl])?$/);
    if (!m) return null;
    const v = Number(m[2]);
    if (!Number.isFinite(v)) return null;
    if (!flag && m[3]) flag = m[3].toUpperCase();
    return { v, flag, cmp: m[1] || '' };
  }

  /* 注意：不把单独的「-」当作阴性——它在报告里更常是区间分隔符 */
  const QUALITY = /^(阴性|阳性|弱阳性|未见异常|正常|异常|可疑|±|\+{1,4})$/;

  /* 定性结果规范化：返回 { q, flag } 或 null。
     兼容带括注写法「阴性(−)」「弱阳性(+)」；flag: H=异常/阳性，N=正常/阴性。 */
  function parseQualitative(tok) {
    if (tok == null) return null;
    const t = String(tok).trim();
    if (!t || t.length > 20) return null;
    const bare = t.replace(/[（(]\s*[^()（）]{0,6}\s*[)）]\s*$/, '').trim();
    const cands = bare !== t ? [t, bare] : [t];
    for (const s of cands) {
      if (/^(阴性|阳性|弱阳性|未见异常|正常|异常|可疑|未检出)$/.test(s)) {
        return { q: s, flag: /^(阴性|未见异常|正常|未检出)$/.test(s) ? 'N' : 'H' };
      }
      if (/^(±|\+\-|\+−|\+{1,4})$/.test(s)) {
        return { q: (s === '+-' || s === '+−') ? '±' : s, flag: 'H' };
      }
    }
    return null;
  }

  /* 构造一条「定性结果」记录：value 置 null（无数字），qualitative 存原文，flag 给 H/N。 */
  function buildQualRecord(ctx, name, qo, raw) {
    name = normalizeName(String(name || ''));
    if (!name || !qo) return { kind: 'skip', why: '定性结果（未能匹配项目名，未纳入）' };
    const cat = matchCategory(name) || ctx.cat || '其他';
    return {
      kind: 'record',
      date: ctx.found || '',
      category: cat,
      name,
      value: null,
      unit: '',
      low: null, high: null,
      flag: qo.flag,
      qualitative: qo.q,
      cmp: '',
      conf: 'high',
      problems: [],
      qualitativeOnly: true
    };
  }
  function qualFromPending(ctx, qo, raw) {
    if (!qo) return { kind: 'skip', why: '定性结果（未纳入）' };
    if (!ctx.pending) return { kind: 'skip', why: '定性结果（未找到对应项目名，未纳入）' };
    const name = ctx.pending.name;
    if (ctx.pending.date && !ctx.date) ctx.date = ctx.pending.date;
    ctx.pending = null;
    return buildQualRecord(ctx, name, qo, raw);
  }
  /* 尿液沉渣的计数单位（每微升 / 每高倍视野），不用于血常规 */
  const URINE_UNIT = /^\/?\s*(ul|hp|uL|μl)$/i;

  function isUnit(t) {
    if (!t) return false;
    const s = String(t).replace(/\s+/g, '');
    if (!s || s.length > 16) return false;
    if (/^[HLhl]$/.test(s)) return false;
    if (parseRange(s) || parseOneSided(s) || parseValue(s) || QUALITY.test(s)) return false;
    if (/^[\d.\-]+$/.test(s)) return false;
    return /[A-Za-zμµΩ%‰]/.test(s) || /^个?\/[A-Za-zμµ]+$/.test(s);
  }

  function cleanName(s) {
    return String(s)
      .replace(/^["']+|["']+$/g, '')
      .replace(/[（(]\s*[)）]/g, '')
      .replace(/^[\s:：、,，.。\-|]+/, '')
      .replace(/[\s:：、,，.。\-|↑↓*]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function tokens(line) {
    const byTab = line.split(/\t| {2,}/).map(s => s.trim()).filter(Boolean);
    if (byTab.length > 1) return byTab;
    // 把 CSV 内容直接粘进文本框时的兜底
    if ((line.match(/,/g) || []).length >= 2) return line.split(',').map(s => s.trim()).filter(Boolean);
    return byTab;
  }

  /* 项目名归一：去掉报告自带的序号、互认标记 *、方法学括注和尾部英文缩写。
     只处理名称外形，不改变「报告上写了什么」这一事实——去掉的都是标注而非项目名主体。 */
  function normalizeName(s) {
    let n = String(s)
      .replace(/[*#＊]/g, ' ')
      .replace(/^\s*\d{1,3}\s*[.、)）]\s*/, '')
      .replace(/^\s*\d{1,3}\s+/, '')
      .replace(/[（(][^()（）]{0,8}法[)）]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // 尾部独立英文缩写：葡萄糖 GLU / 肌酐 Cr / 胱抑素C CysC / 白球比 A/G
    const tail = n.match(/^(.*)\s+[A-Za-z][A-Za-z0-9\/]{1,12}$/);
    if (tail && /[\u4e00-\u9fa5]{2,}/.test(tail[1])) n = tail[1].trim();
    return n;
  }

  /* ---------------- 单行解析 ---------------- */
  const HEAD_WORDS = ['项目', '结果', '单位', '参考', '提示', '英文', '缩写', '序号', '名称', '数值', '范围', '标本', '检验'];
  const FOOT_RE = /^(第\s*\d+\s*页|共\s*\d+\s*页|打印|审核|检验者|检验人|操作者|医生|备注|说明|注[:：]|标本|采集|采样|送检|接收|收样|报告时间|地址|电话|本报告|声明)/;
  const PERSON_RE = /姓名|性别|年龄|床号|门诊号|住院号|身份证|条码|病历号|申请医生|临床诊断/;

  function parseLine(raw, ctx) {
    let line = halfWidth(raw).replace(/\r/g, '').trim();
    if (!line) return null;

    // 记下标本类型，供类别判断用：尿里的「白细胞/红细胞」不属于血常规
    if (/标本类型|标本[:：]/.test(line)) {
      if (/尿/.test(line)) ctx.specimen = 'urine';
      else if (/血清|血浆|全血|末梢血/.test(line)) ctx.specimen = 'blood';
      // 原文写法留给报告元信息（血清 / 血浆 / 全血 / 尿液 …），只取短词
      const m = line.match(/(?:标本类型|标本)[:：]?\s*([\u4e00-\u9fa5]{1,6})/);
      if (m) ctx.specimenText = m[1];
    }

    // 申请项目是报告表头，不是检验结果——哪怕带数字（「…比肌酐2项」）也不能当记录
    if (/申请项目/.test(line)) {
      const m = line.match(/申请项目[:：]?\s*(.+)$/);
      if (m) ctx.apply = String(m[1]).replace(/[\s　]+/g, ' ').trim().slice(0, 40);
      return { kind: 'skip', why: '报告表头 / 申请项目' };
    }

    // 个人信息行：宁可漏，不可错（否则「年龄 35」会被当成指标）
    if (PERSON_RE.test(line) && !/[↑↓]/.test(line) && !/\d\s*(?:-|~)\s*\d/.test(line)) {
      const d0 = findDate(line);
      if (d0) { ctx.date = d0; ctx.found = d0; }
      return { kind: 'skip', why: '报告表头 / 个人信息' };
    }

    let d = findDate(line);
    if (!d && /时间|日期|采样|送检|接收|报告/.test(line)) d = findShortDate(line);
    let body = line;
    if (d) {
      ctx.date = d;
      ctx.found = d;
      body = line.replace(DATE_RE, ' ');
      const rest = body.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ').replace(/[\s:：,，、]/g, '');
      if (!rest || /^(采样|送检|检验|检查|报告|打印|采集|收到)?(日期|时间|日)?$/.test(rest)) {
        return { kind: 'date', date: d };
      }
      if (FOOT_RE.test(rest) || PERSON_RE.test(rest)) return { kind: 'skip', why: '报告表头 / 页脚' };
    }

    if (FOOT_RE.test(line)) return { kind: 'skip', why: '页脚 / 说明' };

    // 参考范围单独一行：参考：3.1-5.7 / 正常值 <5
    if (/^(参考|正常|范围|区间)/.test(body)) {
      const nums = body.replace(/[\u4e00-\u9fa5]/g, ' ').replace(/^[^\d<>]+/, '').trim();
      const flat = nums.replace(/\s+/g, '');
      const rg = parseRange(flat) || parseOneSided(flat);
      if (rg) return { kind: 'refpatch', ...rg };
      const two = flat.match(/^(\d+(?:\.\d+)?)[\s,，\/]+(\d+(?:\.\d+)?)$/);
      if (two) {
        const a = Number(two[1]), b = Number(two[2]);
        return { kind: 'refpatch', ...(a <= b ? { low: a, high: b } : { low: b, high: a }) };
      }
      return { kind: 'skip', why: '参考范围行' };
    }

    // 只有名称、没有数字的行：手机端报告常把「项目名」和「结果」拆成上下两行
    if (!/\d/.test(body)) {
      // 申请项目 / 临床诊断这类说明行，不能当成小节标题（否则会改写后续记录的类别）
      if (/申请项目|临床诊断|检验备注|开单|送检科室|申请科室/.test(body)) {
        return { kind: 'skip', why: '报告表头 / 说明' };
      }
      for (const [cat, words] of [
        ['血常规', ['血常规', '全血细胞', '血细胞分析']],
        ['肝功能', ['肝功能', '肝功']],
        ['肾功能', ['肾功能', '肾功']]
      ]) {
        if (words.some(w => body.includes(w))) { ctx.cat = cat; return { kind: 'section', cat }; }
      }
      if (/血脂|血糖|电解质|甲状腺|尿常规|凝血|心肌|炎症|肿瘤标志|免疫|微量元素/.test(body)) {
        ctx.cat = '其他';
        return { kind: 'section', cat: '其他' };
      }
      // 表头：命中两个以上列名
      if (HEAD_WORDS.filter(w => body.includes(w)).length >= 2) return { kind: 'skip', why: '表头行' };

      const nm = cleanName(body);
      let nmToks = tokens(body);
      // 「项目 定性」用单个空格分隔的情况：只有含定性词时才按空格再切，避免误伤带空格的英文项目名
      if (nmToks.length === 1) {
        const sp = body.trim().split(/\s+/).filter(Boolean);
        if (sp.length > 1 && sp.some(t => parseQualitative(t))) nmToks = sp;
      }
      const qSingle = nmToks.length === 1 ? parseQualitative(nm) : null;
      // 单独一行的定性结果（阴性 / ++）：结合上一行暂存的项目名记成一条定性记录
      if (qSingle) return qualFromPending(ctx, qSingle, body);
      // 只有单个片段才算「项目名占一行」；多列粘连说明是别的行
      if (nmToks.length > 1) {
        const qi = nmToks.findIndex(t => parseQualitative(t));
        if (qi > 0) return buildQualRecord(ctx, cleanName(nmToks.slice(0, qi).join(' ')), parseQualitative(nmToks[qi]), body);
        if (qi === 0) return qualFromPending(ctx, parseQualitative(nmToks[0]), body);
        // 单元格里「项目 定性」粘在一起（阴性(-)）：再按空格拆一次，仅当恰好一个定性词
        const flat = nmToks.flatMap(t => String(t).trim().split(/\s+/).filter(Boolean));
        const qhits = flat.map((t, i2) => [i2, parseQualitative(t)]).filter(x => x[1]);
        if (qhits.length === 1 && qhits[0][0] > 0) return buildQualRecord(ctx, cleanName(flat.slice(0, qhits[0][0]).join(' ')), qhits[0][1], body);
        return { kind: 'skip', why: '没有数值（未纳入）' };
      }
      if (nm && nm.length <= 24 && !/参考|正常|范围|区间|科室|医院|医生|日期|时间|报告|化验|结果单|门诊|住院|签名|盖章/.test(nm)) {
        ctx.pending = { name: nm, date: ctx.date };
        return { kind: 'pending' };
      }
      return { kind: 'skip', why: '没有数值（未纳入）' };
    }

    let toks = tokens(body);
    if (toks.length < 2) toks = body.split(/\s+/).filter(Boolean);
    if (!toks.length) return { kind: 'skip', why: '没有数值' };

    // 第一个「像结果值」的 token；索引必须 >= 1，名字要在它前面
    let vi = -1;
    for (let i = 1; i < toks.length; i++) {
      if (parseValue(toks[i])) { vi = i; break; }
    }

    let name, val, rest;
    if (vi === -1 && ctx.pending && parseValue(toks[0])) {
      // 上一行给了项目名，这一行以数值开头
      name = ctx.pending.name;
      val = parseValue(toks[0]);
      rest = toks.slice(1);
      if (ctx.pending.date && !ctx.date) ctx.date = ctx.pending.date;
      ctx.pending = null;
    } else if (vi === -1) {
      const qi = toks.findIndex(t => parseQualitative(t));
      if (qi >= 0) {
        if (qi > 0) return buildQualRecord(ctx, cleanName(toks.slice(0, qi).join(' ')), parseQualitative(toks[qi]), body);
        return qualFromPending(ctx, parseQualitative(toks[0]), body);
      }
      const loose = body.match(/^([^\d]+?)\s*([<>]?\d+(?:\.\d+)?)\s*(.*)$/);
      if (!loose) return { kind: 'skip', why: '没有数值' };
      name = cleanName(loose[1]);
      val = parseValue(loose[2]);
      rest = loose[3] ? loose[3].split(/\s+/).filter(Boolean) : [];
    } else {
      name = cleanName(toks.slice(0, vi).join(' '));
      val = parseValue(toks[vi]);
      rest = toks.slice(vi + 1);
    }
    if (!val) return { kind: 'skip', why: '没有数值' };
    if (!name) return { kind: 'skip', why: '没有项目名' };
    name = name.replace(/^(血常规|肝功能|肾功能|血脂|血糖|电解质|甲状腺|尿常规|凝血|心肌)\s*[:：]?\s+/, '');
    name = normalizeName(name);
    if (!name) return { kind: 'skip', why: '没有项目名' };
    if (HEAD_WORDS.filter(w => name.includes(w)).length >= 2) return { kind: 'skip', why: '表头行' };
    if (/^(参考|正常|范围|区间)/.test(name)) return { kind: 'skip', why: '参考范围行' };

    let unit = '', ref = null, one = null, inRef = false, qual = false, qualTok = '';

    // 单位与区间粘成一串：μmol/L208-428 → ['μmol/L', '208-428']
    const expanded = [];
    for (const t of rest) {
      const m = String(t).match(/^(.*?[A-Za-zμµΩ%‰\/^)])\s*(\d+(?:\.\d+)?\s*(?:-{1,2}|~)\s*\d+(?:\.\d+)?)$/);
      if (m && m[1] && !/\d/.test(m[1])) expanded.push(m[1], m[2]);
      else expanded.push(t);
    }

    const extra = [];
    for (const raw of expanded) {
      let t = raw;
      // 标签与数值粘连：参考值<0.05、参考范围208-428
      if (/[\u4e00-\u9fa5]/.test(t)) {
        if (/参考|正常|范围|区间/.test(t)) inRef = true;
        const stripped = t.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
        if (stripped && /^[\s:：<>\d.\-~]*$/.test(stripped)) t = stripped;
      }
      if (!t) continue;
      if (/^[↑↓⇑⇓*#＊]+$/.test(t)) {
        if (/[↑⇑]/.test(t)) val.flag = 'H';
        if (/[↓⇓]/.test(t)) val.flag = 'L';
        continue;
      }
      if (/^(参考范围|参考值|正常范围|正常值|参考区间|参考|区间|范围)[:：]?$/.test(t)) { inRef = true; continue; }
      const rg = parseRange(t) || parseRange(t.replace(/^.*?[:：]/, ''));
      if (rg && !ref) { ref = rg; continue; }
      const os = parseOneSided(t);
      if (os && !one) { one = os; continue; }
      if (QUALITY.test(t)) { if (!qualTok) qualTok = t; qual = true; continue; }
      if (!unit && isUnit(t)) { unit = t; continue; }
      const n2 = parseValue(t);
      if (n2) extra.push(n2.v);
    }

    // 表格里「下限 / 上限」拆成两列的情况
    if (!ref && !one && extra.length === 2) {
      const a = extra[0], b = extra[1];
      ref = a <= b ? { low: a, high: b } : { low: b, high: a };
    }

    // 名称里带单位：肌酐(μmol/L)
    const um = name.match(/[（(]\s*([^()（）]{1,16})\s*[)）]\s*$/);
    if (um && !unit && isUnit(um[1])) { unit = um[1]; name = cleanName(name.replace(um[0], '')); }

    // 数值列其实是定性结果（无单位）：按定性记录，不再静默丢弃
    if (qual && !unit) return buildQualRecord(ctx, name, parseQualitative(qualTok) || { q: qualTok, flag: '' }, body);

    const low = ref ? ref.low : (one ? one.low : null);
    const high = ref ? ref.high : (one ? one.high : null);

    const problems = [];
    let conf = 'high';
    if (!unit) { conf = 'low'; problems.push('缺单位'); }
    if (low === null && high === null) { if (conf === 'high') conf = 'mid'; problems.push('缺参考范围'); }
    if (name.length > 30) { conf = 'low'; problems.push('项目名可能粘连'); }
    // 报告自带的箭头与区间对不上：如实标出交给人工核对，不替它改箭头
    if (low !== null && high !== null) {
      if (val.flag === 'H' && val.v <= high) problems.push('报告标↑，数值却在区间内');
      if (val.flag === 'L' && val.v >= low) problems.push('报告标↓，数值却在区间内');
    }

    // /ul、/HP 是尿液沉渣的计数单位，血常规用的是 ×10^9/L；
    // 名字里的「白细胞/红细胞」会被词典判成血常规，这里按单位纠正回来
    let cat = matchCategory(name) || ctx.cat || '其他';
    if (cat === '血常规' && (URINE_UNIT.test(unit) || ctx.specimen === 'urine')) cat = '其他';

    const qFlag = qualTok ? ((parseQualitative(qualTok) || {}).flag || '') : '';
    return {
      kind: 'record',
      date: ctx.found || '',
      category: cat,
      name, value: val.v, unit, low, high,
      flag: val.flag || qFlag, cmp: val.cmp,
      qualitative: qualTok || '',
      conf, problems
    };
  }

  /* ---------------- 文本入口 ---------------- */
  function text(raw, opts) {
    opts = opts || {};
    const ctx = { date: opts.date || '', found: '', cat: '', specimen: '', specimenText: '', apply: '', pending: null };
    const rows = [], skipped = [];
    String(raw).split(/\r?\n/).forEach((line, i) => {
      const r = parseLine(line, ctx);
      if (!r) return;

      if (r.kind === 'refpatch') {
        // 参考范围单独一行时，补给上一条记录
        const last = rows[rows.length - 1];
        if (last && last.low === null && last.high === null) {
          last.low = r.low;
          last.high = r.high;
          last.problems = (last.problems || []).filter(p => p !== '缺参考范围');
          if (last.conf === 'mid' && last.unit) last.conf = 'high';
        }
        return;
      }
      if (r.kind === 'record') {
        rows.push({ ...r, date: r.date || '', raw: line.trim().slice(0, 90), no: i + 1 });
        return;
      }
      if (r.kind === 'skip') {
        ctx.pending = null;
        if (line.trim()) skipped.push({ line: line.trim().slice(0, 90), why: r.why, no: i + 1 });
        return;
      }
      // 'date' / 'section' / 'header' 打断暂存的项目名；'pending' 自己维护
      if (r.kind !== 'pending') ctx.pending = null;
    });
    // 采样日期常印在页脚，记录行可能在它之前；用最终日期游标兜底（不凭空造日期）
    const fallback = ctx.found || opts.date || '';
    if (fallback) rows.forEach(r => { if (!r.date) r.date = fallback; });
    // meta 只转写报告表头上明写的东西，供「新建报告」预填；没写就是空
    return { rows, skipped, date: ctx.date, meta: { specimen: ctx.specimenText || '', apply: ctx.apply || '' } };
  }

  /* ---------------- CSV 入口 ---------------- */
  const COLS = {
    name: ['项目名称', '检查项目', '检验项目', '项目名', '项目', '指标名称', '指标', '名称', '缩写', '英文名', 'item', 'test', 'name'],
    value: ['检验结果', '结果值', '测定值', '结果', '数值', 'value', 'result'],
    unit: ['计量单位', '单位', 'unit', 'units'],
    ref: ['参考范围', '参考区间', '正常范围', '参考值', '正常值', '范围', '区间', 'reference', 'ref'],
    low: ['参考下限', '下限', '低值', '最小值', 'low', 'min'],
    high: ['参考上限', '上限', '高值', '最大值', 'high', 'max'],
    date: ['检查日期', '采样日期', '送检日期', '检验日期', '报告日期', '日期', '时间', 'date'],
    cat: ['项目类别', '类别', '分类', '科室', '专业组', '大类', '组套', 'category'],
    flag: ['结果提示', '提示', '异常标志', '标志', 'flag'],
    note: ['备注', '说明', 'note', 'remark']
  };

  function sniffDelim(raw) {
    const lines = String(raw).split(/\r?\n/).filter(l => l.trim()).slice(0, 6);
    let best = ',', score = 0;
    for (const d of ['\t', ',', ';', '|']) {
      const counts = lines.map(l => l.split(d).length - 1).filter(c => c > 0);
      if (!counts.length) continue;
      const freq = {};
      counts.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
      const mode = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
      const s = Number(mode) * counts.length;
      if (s > score) { score = s; best = d; }
    }
    return best;
  }

  function splitRows(raw, delim) {
    const rows = [];
    let row = [], cell = '', q = false;
    const s = String(raw).replace(/^\ufeff/, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(c => String(c).trim())).filter(r => r.some(c => c));
  }

  function mapHeader(cells) {
    const norm = cells.map(c => halfWidth(c).replace(/[\s\t]/g, '').replace(/[（(].*?[）)]/g, '').toLowerCase());
    const map = {}, used = new Set();
    for (const key of Object.keys(COLS)) {
      for (const alias of COLS[key]) {
        const i = norm.findIndex((c, idx) => !used.has(idx) && c === alias);
        if (i >= 0) { map[key] = i; used.add(i); break; }
      }
    }
    for (const key of Object.keys(COLS)) {
      if (map[key] != null) continue;
      for (const alias of COLS[key]) {
        const i = norm.findIndex((c, idx) => !used.has(idx) && c.length >= 2 && (c.includes(alias) || (alias.length >= 3 && alias.includes(c))));
        if (i >= 0) { map[key] = i; used.add(i); break; }
      }
    }
    return map;
  }

  function csv(raw, opts) {
    opts = opts || {};
    const delim = sniffDelim(raw);
    const rows = splitRows(raw, delim);
    let headIdx = -1, map = null;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const m = mapHeader(rows[i]);
      if (m.name != null && m.value != null) { headIdx = i; map = m; break; }
    }
    if (headIdx < 0) return { rows: [], skipped: [], error: '没有找到「项目 / 结果」这样的表头' };

    const out = [], skipped = [];
    for (let i = headIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const name = cleanName(r[map.name] || '');
      const val = parseValue(r[map.value]);
      if (!name && !val) continue;
      if (!name) { skipped.push({ line: r.join(delim).slice(0, 90), why: '缺项目名', no: i + 1 }); continue; }
      if (!val) {
        // 结果列是定性值（阴性 / + / 弱阳性）：记成定性记录，不再跳过
        const qo = parseQualitative(String(r[map.value] || '').trim());
        if (qo) {
          const catQ = map.cat != null ? String(r[map.cat] || '').trim() : '';
          out.push({
            kind: 'record',
            date: (map.date != null && findDate(String(r[map.date] || ''))) || opts.date || '',
            category: CATS.includes(catQ) ? catQ : (matchCategory(name) || '其他'),
            name, value: null, unit: '', low: null, high: null,
            flag: qo.flag, qualitative: qo.q, cmp: '',
            conf: 'high', problems: [], qualitativeOnly: true,
            note: map.note != null ? String(r[map.note] || '').trim().slice(0, 120) : '',
            raw: r.join(delim).slice(0, 90),
            no: i + 1
          });
          continue;
        }
        skipped.push({ line: r.join(delim).slice(0, 90), why: '没有数值（未纳入）', no: i + 1 });
        continue;
      }
      const unit = map.unit != null ? String(r[map.unit] || '').trim() : '';
      const refRaw = map.ref != null ? String(r[map.ref] || '').trim() : '';
      let ref = parseRange(refRaw.replace(/[\s]/g, '')) || parseOneSided(refRaw.replace(/[\s]/g, ''));
      let one = null;
      if (!ref) { const o = parseOneSided(refRaw.replace(/\s/g, '')); if (o) { one = o; ref = o; } }
      if (!ref && map.low != null && map.high != null) {
        const lo = Number(String(r[map.low] || '').trim());
        const hi = Number(String(r[map.high] || '').trim());
        if (Number.isFinite(lo) && (lo !== 0 || String(r[map.low]).trim() === '0')) {
          if (Number.isFinite(hi) && (hi !== 0 || String(r[map.high]).trim() === '0')) {
            ref = lo <= hi ? { low: lo, high: hi } : { low: hi, high: lo };
          }
        }
      }
      const low = ref ? ref.low : null;
      const high = ref ? ref.high : null;
      const catRaw = map.cat != null ? String(r[map.cat] || '').trim() : '';
      const flagRaw = map.flag != null ? String(r[map.flag] || '').trim() : '';
      let flag = '';
      if (/[↑⇑]|偏高|增高|高$/.test(flagRaw)) flag = 'H';
      else if (/[↓⇓]|偏低|降低|低$/.test(flagRaw)) flag = 'L';
      if (!flag) flag = val.flag;

      const problems = [];
      let conf = 'high';
      if (!unit) { conf = 'low'; problems.push('缺单位'); }
      if (low === null && high === null) { if (conf === 'high') conf = 'mid'; problems.push('缺参考范围'); }

      out.push({
        kind: 'record',
        date: (map.date != null && findDate(String(r[map.date] || ''))) || opts.date || '',
        category: CATS.includes(catRaw) ? catRaw : (matchCategory(name) || '其他'),
        name, value: val.v, unit, low, high, flag, cmp: val.cmp,
        qualitative: '',
        conf, problems,
        note: map.note != null ? String(r[map.note] || '').trim().slice(0, 120) : '',
        raw: r.join(delim).slice(0, 90),
        no: i + 1
      });
    }
    return { rows: out, skipped, delim };
  }

  function auto(raw, opts) {
    const head = String(raw).trim().slice(0, 200);
    const isCsv = /[,\t;]/.test(head) && /\n/.test(String(raw)) &&
      (/(项目|指标|名称|检验)/.test(head) || sniffDelim(raw) !== undefined) &&
      /\n[^\n]*[,\t;][^\n]*/.test(String(raw).slice(0, 600));
    return isCsv ? csv(raw, opts) : text(raw, opts);
  }

  global.LabParse = { text, csv, auto, sniffDelim, splitRows, matchCategory, parseRange, parseValue, isUnit, findDate, CATS };
})(typeof window !== 'undefined' ? window : globalThis);
