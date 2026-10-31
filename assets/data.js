'use strict';

/* 空白档案模板：不包含任何个人健康信息。
   只读静态内容留空；可写记录全部存入 data/health.db。 */

const ARCHIVE = {
  updated: '',

  profile: {
    sex: '',
    age: '',
    birth: '',
    height: null,
    weight: null,
    weightNote: '',
    bmi: null,
    activity: '',
    limit: '',
    fields: []
  },

  weight: {
    start: null,
    startDate: '',
    target: null,
    stageTarget: '',
    kcal: '',
    rules: []
  },

  statuses: {
    active:   { label: '记录中', tone: 'green' },
    followup: { label: '待复诊', tone: 'warn' },
    monitor:  { label: '监测中', tone: 'green' },
    history:  { label: '历史记录', tone: 'mute' },
    pending:  { label: '待补充', tone: 'amber' },
    stub:     { label: '仅目录', tone: 'amber' }
  },

  issues: [],
  timeline: [],
  meds: { current: [], history: [], note: '' },
  todos: []
};
