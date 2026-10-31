/* 解析引擎回归测试：node Tools/test-parse.cjs */
const path = require('path');
require(path.join(__dirname, '..', 'assets', 'parse.js'));
const P = globalThis.LabParse;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + label + (extra ? '\n     ' + extra : ''));
}
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), label, `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
}

/* ---------- 1. Tab 分隔的完整报告 ---------- */
const T1 = `2026-10-20
姓名 张某某  性别 男  年龄 35  门诊号 1234567
血常规
项目名称\t结果\t单位\t参考范围\t提示
白细胞计数\t6.23\t10^9/L\t3.5-9.5
红细胞计数\t4.85\t10^12/L\t4.3-5.8
血红蛋白\t148\tg/L\t130-175
血小板计数\t212\t10^9/L\t125-350
肝功能
丙氨酸氨基转移酶（ALT）\t38\tU/L\t9-50
天门冬氨酸氨基转移酶（AST）\t29\tU/L\t15-40
总胆红素\t24.6\tμmol/L\t3.4-20.5\t↑
肾功能
肌酐\t92\tμmol/L\t57-97
尿酸\t486\tμmol/L\t208-428\t↑
尿素\t5.31\tmmol/L\t3.1-8.0
尿常规
尿蛋白\t阴性
第 1 页 共 2 页
打印时间 2026-10-21`;

const r1 = P.text(T1, { date: '2026-10-20' });
eq(r1.rows.length, 11, 'T1 识别 11 条（含定性结果）');
const get = (n) => r1.rows.find(r => r.name.includes(n));
eq(get('白细胞').value, 6.23, 'T1 白细胞数值');
eq(get('白细胞').unit, '10^9/L', 'T1 白细胞单位');
eq([get('白细胞').low, get('白细胞').high], [3.5, 9.5], 'T1 白细胞参考区间');
eq(get('白细胞').category, '血常规', 'T1 白细胞类别');
eq(get('总胆红素').flag, 'H', 'T1 总胆红素 ↑ 标记');
eq(get('总胆红素').category, '肝功能', 'T1 总胆红素类别');
eq(get('尿酸').category, '肾功能', 'T1 尿酸类别');
eq(get('ALT').category, '肝功能', 'T1 ALT 类别');
eq(get('肌酐').date, '2026-10-20', 'T1 日期游标');
eq(get('尿蛋白').qualitative, '阴性', 'T1 定性结果保留原文');
eq(get('尿蛋白').value, null, 'T1 定性结果不伪造数值');
eq(get('尿蛋白').flag, 'N', 'T1 阴性使用统一正常标志');

/* ---------- 2. 双空格对齐、区间拆两列 ---------- */
const T2 = `采样日期  2026-09-18
项目      结果    单位      下限   上限
肌酐      88      μmol/L    57     97
尿酸      512     μmol/L    208    428   ↑
胱抑素C   0.92    mg/L      0.51   1.09`;
const r2 = P.text(T2, {});
eq(r2.rows.length, 3, 'T2 识别 3 条');
eq([r2.rows[0].low, r2.rows[0].high], [57, 97], 'T2 拆列区间');
eq(r2.rows[1].value, 512, 'T2 尿酸数值');
eq(r2.rows[1].flag, 'H', 'T2 尿酸 ↑');
eq(r2.rows[2].unit, 'mg/L', 'T2 单位含斜杠');
eq(r2.rows[0].date, '2026-09-18', 'T2 采样日期作为默认日期');

/* ---------- 3. 名称带单位、无参考范围 ---------- */
const T3 = `2026-08-01
空腹血糖（mmol/L）  5.8
甘油三酯 2.31 mmol/L 0.45-1.70`;
const r3 = P.text(T3, {});
eq(r3.rows.length, 2, 'T3 识别 2 条');
eq(r3.rows[0].name, '空腹血糖', 'T3 名称剥离单位');
eq(r3.rows[0].unit, 'mmol/L', 'T3 单位从括号提取');
eq(r3.rows[0].conf, 'mid', 'T3 缺参考范围 → mid');
eq(r3.rows[1].category, '其他', 'T3 甘油三酯类别');
eq([r3.rows[1].low, r3.rows[1].high], [0.45, 1.7], 'T3 单空格行区间');

/* ---------- 4. 单边区间 ---------- */
const T4 = `2026-07-15
C反应蛋白  12.4  mg/L  <10
降钙素原  0.02  ng/mL  参考值 <0.05`;
const r4 = P.text(T4, {});
eq(r4.rows.length, 2, 'T4 识别 2 条');
eq([r4.rows[0].low, r4.rows[0].high], [null, 10], 'T4 单边上限');
eq([r4.rows[1].low, r4.rows[1].high], [null, 0.05], 'T4 参考值标签后单边上限');

/* ---------- 5. 页脚 / 表头 / 无数字行不应产生记录 ---------- */
const T5 = `个人健康档案
检验报告单
审核者：王某
备注：建议结合临床
项目 结果 单位 参考范围`;
const r5 = P.text(T5, {});
eq(r5.rows.length, 0, 'T5 全部跳过');
ok(r5.skipped.length >= 3, 'T5 跳过项有记录');

/* ---------- 6. CSV ---------- */
const C1 = `\ufeff项目名称,结果,单位,参考范围,检查日期,类别
肌酐,92,μmol/L,57-97,2026-10-20,肾功能
"尿酸",486,μmol/L,"208-428",2026-10-20,
血红蛋白,148,g/L,130-175,2026-10-20,`;
const c1 = P.csv(C1, {});
eq(c1.rows.length, 3, 'C1 CSV 识别 3 条');
eq(c1.rows[1].name, '尿酸', 'C1 引号包裹');
eq([c1.rows[1].low, c1.rows[1].high], [208, 428], 'C1 引号内区间');
eq(c1.rows[2].category, '血常规', 'C1 空类别时按词典推断');
eq(c1.rows[0].date, '2026-10-20', 'C1 取日期列');

/* ---------- 7. 分号 / 制表符嗅探 ---------- */
eq(P.sniffDelim('a;b;c\n1;2;3'), ';', '嗅探分号');
eq(P.sniffDelim('a\tb\tc\n1\t2\t3'), '\t', '嗅探制表符');
eq(P.sniffDelim('a,b\n1,2'), ',', '嗅探逗号');

/* ---------- 8. 单行解析边界 ---------- */
eq(P.parseRange('208-428'), { low: 208, high: 428 }, '区间 208-428');
eq(P.parseRange('0.45~1.70'), { low: 0.45, high: 1.7 }, '区间 0.45~1.70');
eq(P.parseRange('428-208'), { low: 208, high: 428 }, '上下限颠倒自动纠正');
eq(P.parseValue('486↑'), { v: 486, flag: 'H', cmp: '' }, '数值带箭头');
eq(P.parseValue('<0.5'), { v: 0.5, flag: '', cmp: '<' }, '数值带小于号');
eq(P.parseValue('10^9/L'), null, '单位不被当数值');
eq(P.isUnit('10^9/L'), true, '10^9/L 是单位');
eq(P.isUnit('参考范围'), false, '中文标签不是单位');
eq(P.findDate('采样日期 2026年9月8日'), '2026-09-08', '中文日期');

/* ---------- 9. 手机 App 分行格式（项目名一行、数值一行、参考范围一行） ---------- */
const T9 = `2026-10-20 09:12
总胆固醇
5.42 mmol/L
参考：3.1-5.7
甘油三酯
2.31 mmol/L
参考：0.45-1.7
尿蛋白
阴性`;
const r9 = P.text(T9, {});
eq(r9.rows.length, 3, 'T9 分行格式识别 3 条（含定性结果）');
eq(r9.rows[0].name, '总胆固醇', 'T9 名称取自上一行');
eq([r9.rows[0].low, r9.rows[0].high], [3.1, 5.7], 'T9 参考行补到上一条');
eq(r9.rows[1].unit, 'mmol/L', 'T9 单位');
eq(r9.rows[2].qualitative, '阴性', 'T9 分行定性结果保留');
eq(r9.rows[2].value, null, 'T9 分行定性结果不伪造数值');

/* ---------- 10. 无空格粘连：尿酸486μmol/L208-428 ---------- */
const r10 = P.text('2026-10-20\n尿酸486μmol/L208-428\n血红蛋白148g/L 130-175', {});
eq(r10.rows.length, 2, 'T10 粘连行识别 2 条');
eq(r10.rows[0].unit, 'μmol/L', 'T10 单位与区间拆分');
eq([r10.rows[0].low, r10.rows[0].high], [208, 428], 'T10 区间');
eq(r10.rows[1].unit, 'g/L', 'T10 单位2');

/* ---------- 11. 单行带小节前缀 ---------- */
const r11 = P.text('2026-10-20 血常规 白细胞 6.2 10^9/L 3.5-9.5', {});
eq(r11.rows[0].name, '白细胞', 'T11 去掉小节前缀');
eq(r11.rows[0].category, '血常规', 'T11 类别');

/* ---------- 12. 真实医院报告（北京同仁 2026-09-04）：序号 + * + 英文缩写 + -- 区间 ---------- */
const T12 = `北京同仁医院  北京市医疗机构临床检验结果报告单  普通
姓名：某男  性别：男  年龄：26岁  标本条码：26090454847
No\t检验项目\t结果\t提示\t单位\t参考区间
1\t*葡萄糖 GLU\t4.9\t\tmmol/L\t3.9--6.1
3\t*肌酐(酶法) Cr\t112.0\t↑\tμmol/L\t57--97
4\t胱抑素C CysC\t1.09\t↑\tmg/L\t0.63--1.25
8\t白球比 A/G\t1.7\t\t\t1.2--2.4
12\t*天冬氨酸氨基转移酶 AST\t30\t\tU/L\t15--40
采样时间：26-09-04 11:52  接收时间：26-09-04 12:05  报告时间：26-09-04 13:33`;
const r12 = P.text(T12, {});
const g12 = (n) => r12.rows.find(r => r.name.includes(n));
eq(r12.rows.length, 5, 'T12 识别 5 条');
eq(g12('葡萄糖').name, '葡萄糖', 'T12 去掉序号、* 与英文缩写');
eq(g12('肌酐').name, '肌酐', 'T12 去掉方法学括注');
eq(g12('胱抑素').name, '胱抑素C', 'T12 保留名称里的字母 C');
eq(g12('白球比').name, '白球比', 'T12 白球比归一');
eq([g12('葡萄糖').low, g12('葡萄糖').high], [3.9, 6.1], 'T12 -- 双横线区间');
eq(g12('白球比').high, 2.4, 'T12 无单位项的区间仍保留');
eq(g12('天冬氨酸').category, '肝功能', 'T12 天冬氨酸归肝功能');
eq(g12('肌酐').flag, 'H', 'T12 箭头保留');
ok(g12('胱抑素').problems.includes('报告标↑，数值却在区间内'), 'T12 箭头与区间矛盾要标出');
eq(g12('肌酐').date, '2026-09-04', 'T12 页脚两位年份日期兜底');
ok(!r12.rows.some(r => r.name.includes('采样')), 'T12 页脚时间行不产生记录');
eq(r12.rows.filter(r => r.unit === '').length, 1, 'T12 只有白球比缺单位');

/* ---------- T13 尿液标本：白细胞/红细胞不算血常规 ---------- */
const r13 = P.text(`标本类型：尿液
No\t检验项目\t结果\t单位\t参考区间
1\t白细胞 UWBC\t1\t/ul\t0--30
2\t红细胞(高倍视野) JJRBC\t0\t/HP\t0--3
23\t酸碱度 pH\t7.0\t\t5.4--8.4`, { date: '2026-05-07' });
eq(r13.rows[0].category, '其他', 'T13 尿白细胞不归入血常规');
eq(r13.rows[1].category, '其他', 'T13 /HP 视野计数不归入血常规');
eq(r13.rows[0].unit, '/ul', 'T13 尿液单位原样保留');
eq(r13.rows[2].unit, '', 'T13 无量纲项不编造单位');

/* 血标本仍按血常规处理（别把正常报告也一起改掉） */
const r13b = P.text(`标本类型：血清
1\t白细胞 WBC\t6.2\t10^9/L\t3.5--9.5`, { date: '2026-05-07' });
eq(r13b.rows[0].category, '血常规', 'T13 血清白细胞仍是血常规');

console.log(`\n${fail === 0 ? '全部通过' : '有失败'}：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
