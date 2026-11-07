const assert = require('node:assert/strict');
const M = require('../assets/metrics.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const row = (id, value, patch = {}) => ({ id, name: '测试指标', category: '测试类别', unit: 'u', date: '2026-01-01', value, low: 1, high: 10, ...patch });
test('同一指标跨报告合并且按日期排序', () => {
  const g = M.collect({ labs: [row('b', 8, {date:'2026-02-01',reportId:'b'}), row('a', 4, {reportId:'a'})], reports: [{id:'a',specimen:'血清'}, {id:'b',specimen:'血清'}] });
  assert.equal(g.length, 1); assert.deepEqual(g[0].records.map(r=>r.id), ['a','b']);
  assert.equal(M.summary(g[0].records).delta, 4);
});
test('不同单位和样本分开，未知样本不推断', () => {
  const g = M.collect({labs:[row('a',1),row('b',1,{unit:'other'}),row('c',1,{reportId:'c'}),row('d',1,{reportId:'d'})],reports:[{id:'c',specimen:'血清'},{id:'d',specimen:'尿液'}]});
  assert.equal(g.length,4);
});
test('定性与缺失值不伪装成零，真实零保留', () => {
  const g=M.collect({labs:[row('z',0),row('q',null,{qualitative:'阴性'}),row('missing',null),row('nan',NaN)]});
  assert.equal(g[0].records.length,2);const s=M.summary(g[0].records);assert.equal(s.numeric.length,1);assert.equal(s.min,0);assert.equal(s.delta,null);
});
test('时间筛选包含边界，空范围统计为空', () => {
  const r=M.collect({labs:[row('a',1),row('b',2,{date:'2026-01-02'}),row('c',3,{date:'2026-01-03'})]})[0].records;
  assert.deepEqual(M.filter(r,'2026-01-02','2026-01-03').map(r=>r.id),['b','c']);assert.equal(M.summary(M.filter(r,'2027-01-01')).min,null);
});
test('参考范围变化时不套用最后一次范围', () => {
  const same=M.collect({labs:[row('a',2),row('b',3)]})[0];assert.deepEqual(M.summary(same.records).sharedRange,{low:1,high:10});
  const diff=M.collect({labs:[row('a',2),row('b',3,{high:9})]})[0];assert.equal(M.summary(diff.records).sharedRange,null);assert.equal(M.summary(diff.records).variedRange,true);
});
test('空腹与餐后血糖不合并，检验与体征不合并', () => {
  const g=M.collect({vitals:[{id:'a',date:'2026-01-01',glucose:5,glucoseTag:'fasting'},{id:'b',date:'2026-01-01',glucose:6,glucoseTag:'post2h'},{id:'c',date:'2026-01-01',glucose:6}],labs:[row('l',5,{name:'血糖',unit:'mmol/L'})]});assert.equal(g.length,4);assert.ok(g.some(x=>x.detail==='空腹'));
});
test('覆盖体重、围度和睡眠，不补造缺失项目',()=>{
  const g=M.collect({weights:[{id:'w',date:'2026-01-01',kg:70}],body:[{id:'b',date:'2026-01-01',waist:80}],sleepLogs:[{id:'s',date:'2026-01-01',hours:7,score:null}]});assert.deepEqual(g.map(x=>x.label).sort(),['体重','腰围','睡眠时长'].sort());
});
test('保留同日每次测量与小数差值，不聚合平均',()=>{
 const g=M.collect({labs:[row('a',0.1),row('b',0.2),row('c',0.3)]})[0];assert.equal(g.records.length,3);assert.equal(M.summary(g.records).delta,0.1);assert.equal(M.summary(g.records).days,1);
});
test('非法日期排除且输入保持不变',()=>{
 const d={labs:[row('a',1,{date:'2026-02-30'}),row('b',2)]};const before=JSON.stringify(d);assert.equal(M.collect(d)[0].records.length,1);assert.equal(JSON.stringify(d),before);assert.deepEqual(M.collect({}),[]);
});
console.log(`${passed} metric checks passed`);
