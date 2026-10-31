/*
 * 健康档案领域规则：纯函数、无 DOM、无存储、无网络。
 * 经典脚本通过 HealthDomain 使用；Node 可直接 require 做回归测试。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HealthDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATS = ['血常规', '肝功能', '肾功能', '其他'];
  const VITAL_RANGES = {
    systolic: [90, 139], diastolic: [60, 89], pulse: [60, 100],
    temperature: [36.0, 37.3], spo2: [95, 100], glucose: [3.9, 6.1]
  };

  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function labKey(r) {
    return JSON.stringify([r.category, r.name.trim(), r.unit.trim()]);
  }

  function labRange(r) {
    if (r.low === null && r.high === null) return '未填写';
    return `${r.low === null ? '—' : r.low} – ${r.high === null ? '—' : r.high}`;
  }

  function labValueRaw(r) {
    if (r && r.value !== null && r.value !== undefined && Number.isFinite(r.value)) return r.value;
    return r ? (r.qualitative || '') : '';
  }

  function calcLabFlag(value, low, high) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '';
    if (high !== null && high !== undefined && value > high) return 'H';
    if (low !== null && low !== undefined && value < low) return 'L';
    if ((low !== null && low !== undefined) || (high !== null && high !== undefined)) return 'N';
    return '';
  }

  function qualFlagOf(q) {
    const s = String(q || '').trim();
    if (!s) return '';
    if (/^(阴性|未见异常|正常|未检出)$/.test(s)) return 'N';
    if (/^(阳性|弱阳性|异常|可疑|±|\+\-|\+−|\+{1,4})$/.test(s)) return 'H';
    return '';
  }

  function isAbnormal(r) {
    if (!r) return false;
    if (r.flag === 'H' || r.flag === 'L') return true;
    if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return false;
    return (r.low !== null && r.low !== undefined && r.value < r.low)
      || (r.high !== null && r.high !== undefined && r.value > r.high);
  }

  function vitalRange(k, rec) {
    if (k === 'glucose' && rec && rec.glucoseTag && rec.glucoseTag !== 'fasting') return [3.9, 7.8];
    return VITAL_RANGES[k] || [null, null];
  }

  function vitalFlag(k, v, rec) {
    if (!Number.isFinite(v)) return '';
    const r = vitalRange(k, rec);
    if (r[0] == null) return '';
    if (v > r[1]) return 'H';
    if (v < r[0]) return 'L';
    return 'N';
  }

  return {
    CATS, VITAL_RANGES, numOrNull,
    labKey, labRange, labValueRaw, calcLabFlag, qualFlagOf, isAbnormal,
    vitalRange, vitalFlag
  };
});
