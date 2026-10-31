/* 领域规则单元测试：node Tools/test-domain.cjs */
const assert = require('assert/strict');
const D = require('../js/app.domain.js');

assert.equal(D.calcLabFlag(11, 1, 10), 'H');
assert.equal(D.calcLabFlag(0, 1, 10), 'L');
assert.equal(D.calcLabFlag(5, 1, 10), 'N');
assert.equal(D.calcLabFlag(5, null, null), '', '无参考区间不能臆造正常');
assert.equal(D.calcLabFlag(null, 1, 10), '', '定性结果不走数值判断');
assert.equal(D.qualFlagOf('阴性'), 'N');
assert.equal(D.qualFlagOf('+++'), 'H');
assert.equal(D.qualFlagOf('其他文本'), '', '未知识别结果保持未知');
assert.equal(D.labValueRaw({ value: null, qualitative: '阴性' }), '阴性');
assert.equal(D.labValueRaw({ value: 0, qualitative: '阴性' }), 0, '真实数值 0 不应被定性文本覆盖');
assert.equal(D.isAbnormal({ value: 5, low: 1, high: 10, flag: '' }), false);
assert.equal(D.isAbnormal({ value: 5, low: 1, high: 10, flag: 'H' }), true, '报告异常标志优先');
assert.equal(D.isAbnormal({ value: null, qualitative: '阳性', flag: 'H' }), true);
assert.equal(D.labKey({ category: '其他', name: ' 项目 ', unit: ' U/L ' }), '["其他","项目","U/L"]');
assert.equal(D.labRange({ low: null, high: null }), '未填写');
assert.equal(D.numOrNull(''), null);
assert.equal(D.numOrNull(0), null, '沿用现有测量字段约定：空白与非正数都不是有效测量');
assert.equal(D.numOrNull('2.5'), 2.5);
assert.deepEqual(D.vitalRange('glucose', { glucoseTag: 'fasting' }), [3.9, 6.1]);
assert.deepEqual(D.vitalRange('glucose', { glucoseTag: 'post2h' }), [3.9, 7.8]);
assert.equal(D.vitalFlag('glucose', 7, { glucoseTag: 'post2h' }), 'N');
assert.equal(D.vitalFlag('glucose', 7, { glucoseTag: 'fasting' }), 'H');
assert.equal(D.vitalFlag('unknown', 7, {}), '');

console.log('全部通过：领域规则 21 项断言');
