/* 通用主题「最小可用档案」模板工具。
 * 不内置任何主题名或病历内容；发现 docs/主题/<主题>/<主题>.md 缺失或为空时，
 * 可用 --init 写入五段模板。没有主题目录时幂等退出。 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const topicsRoot = path.join(root, 'docs', '主题');
const args = process.argv.slice(2);
const INIT = args.includes('--init');
const CHECK = args.includes('--check');

const FIELDS = [
  ['主诉', '症状部位、出现时间、持续时长、频率、加重/缓解因素'],
  ['诊断', '医院、科室、医生、诊断名称、诊断日期'],
  ['诱因', '可疑诱因，如环境、饮食、作息、接触物'],
  ['当前处置', '当前用药 / 剂量 / 频次 / 疗程、非药物处理'],
  ['复诊节点', '上次就诊日期、下次复诊日期、需复查项目']
];

function template(title) {
  const lines = [`# ${title}`, '',
    '> 本页为「最小可用档案」模板：主诉 / 诊断 / 诱因 / 当前处置 / 复诊节点。',
    '> 未采集的字段统一标注「待补」，不臆测诊断或用药。', ''];
  for (const [name, hint] of FIELDS) {
    lines.push(`## ${name}`, `待补（提示：${hint}）`, '');
  }
  return lines.join('\n');
}

if (!fs.existsSync(topicsRoot)) {
  console.log('[跳过] docs/主题 不存在：当前是空白档案，没有主题需要初始化');
  process.exit(0);
}

let changed = 0;
for (const entry of fs.readdirSync(topicsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(topicsRoot, entry.name, `${entry.name}.md`);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) continue;
  if (CHECK) {
    console.log('[check] 待初始化:', path.relative(root, file));
  } else if (INIT) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, template(entry.name), 'utf8');
    changed++;
  }
}
console.log(changed ? `已初始化 ${changed} 个主题模板` : '主题模板无需变更');
