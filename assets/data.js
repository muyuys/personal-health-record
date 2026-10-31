'use strict';

/* 档案内容数据：整理自 private_data/健康档案/*.md（2026-10-27 版）。
   静态内容只读渲染；体重、检验、待办勾选保存在本机浏览器。 */

const ARCHIVE = {
  updated: '2026-10-27',

  profile: {
    sex: '男',
    age: '27 岁',
    birth: '未记录',
    height: 170,
    weight: 88.0,
    weightNote: '2026-10-27 自报，称量条件未说明',
    bmi: 30.4,
    activity: '久坐，运动很少',
    limit: '右踝仍偶尔影响活动，具体医疗限制待确认',
    fields: [
      { k: '姓名／称呼', v: '待补充', ok: false },
      { k: '出生日期', v: '待填（2026-10-27 时自报 27 岁，出生日期未记录）', ok: false },
      { k: '年龄', v: '27 岁（2026-10-27 提供，出生日期未记录）', ok: true },
      { k: '生理性别（能量估算用）', v: '男', ok: true },
      { k: '身高', v: '170 cm', ok: true },
      { k: '最近自报体重', v: '88.0 kg / 176 斤', ok: true },
      { k: '腰围', v: '待测', ok: false },
      { k: '日常活动', v: '久坐，运动很少', ok: true },
      { k: '睡眠与作息', v: '待补充', ok: false },
      { k: '吸烟／饮酒', v: '待补充', ok: false },
      { k: '饮食习惯、外卖频率', v: '待补充', ok: false },
      { k: '药物／食物过敏及反应', v: '未记录，不能视作无过敏', ok: false },
      { k: '既往手术／住院史', v: '未记录', ok: false },
      { k: '其他确诊疾病与家族史', v: '未记录', ok: false },
      { k: '当前全部药物／补充剂', v: '待核对', ok: false }
    ]
  },

  weight: {
    start: 88.0,
    startDate: '2026-10-27',
    target: 65.0,
    stageTarget: '春节前 82 kg（164 斤，建议值）',
    kcal: '1800 kcal/日（参考 1700–1900）',
    rules: [
      '同一台秤、相近衣着、晨起排尿后及进食前称重。',
      '首个完整 7 天的晨重均值作为趋势基线，自报体重不并入均值。',
      '体重以 kg 为主，可同时写斤（1 kg = 2 斤）。'
    ]
  },

  statuses: {
    active:   { label: '记录中', tone: 'green' },
    followup: { label: '待复诊', tone: 'warn' },
    monitor:  { label: '监测中', tone: 'green' },
    history:  { label: '历史记录', tone: 'mute' },
    pending:  { label: '待补充', tone: 'amber' },
    stub:     { label: '仅目录', tone: 'amber' }
  },

  issues: [
    {
      id: 'weight', name: '体重管理', status: 'active',
      lastDate: '2026-10-27', lastLabel: '本人提供',
      card: '88.0 kg，长期目标 65.0 kg；久坐、运动少，需建立晨重基线。',
      head: '2026-10-27 提供 88 kg／170 cm　·　长期目标 65 kg',
      evidence: [
        { type: '本人描述', text: '2026-10-27 提供体重 88 kg（176 斤）、身高 170 cm，希望减至 65 kg（130 斤）；久坐、运动很少。' },
        { type: '建议计划', text: '摄入暂定 1800 kcal/日（参考 1700–1900）；春节前阶段目标建议 164 斤，是建议值，需按实际记录调整。' },
        { type: '辅助分析', text: 'BMI 约 30.4 由自报身高体重计算，不是体脂率，也不是诊断结论。' }
      ],
      need: '建立同条件晨重与饮食记录；2–3 周后校准热量预算；补测腰围。',
      files: [
        { name: '目标与计划', href: 'private_data/weight-loss/目标与计划.html', meta: 'html' },
        { name: '热量估算规则', href: 'private_data/weight-loss/热量估算规则.html', meta: 'html' },
        { name: '每周复盘', href: 'private_data/weight-loss/每周复盘.html', meta: 'html' }
      ],
      timeline: [
        { date: '2026-10-27', text: '建档：88 kg／170 cm，提出减重目标与阶段计划' }
      ]
    },
    {
      id: 'ankle', name: '右踝 / 右足', status: 'followup',
      lastDate: '2026-08-19', lastLabel: 'CT 平扫',
      card: '跟骨、骰骨边缘骨折史；距腓前韧带损伤。仍偶尔影响活动。',
      head: '2025-12 跟骨、骰骨边缘骨折　·　2026-02 距腓前韧带损伤　·　共 4 次影像检查',
      evidence: [
        { type: '医院报告', text: '2025-12-27 右足 CT 摘要记载跟骨前外侧缘、骰骨后外侧缘骨折；报告 12-29 签发。' },
        { type: '医院报告', text: '2026-02-24 MRI：骨髓水肿、距腓前韧带损伤、下胫腓前韧带部分撕裂不除外。' },
        { type: '本人描述', text: '持续外踝疼痛与活动受限；2026-10-27 补充仍偶尔影响活动，自认暂时做不了高强度运动。' },
        { type: '辅助分析', text: '四次影像对照与复诊沟通单属于整理材料，不是新增诊断；旧伤是否愈合不能仅凭 8 月报告未提骨折判定。' }
      ],
      need: '当前痛点与步行耐受、肿胀情况；是否接受过封闭治疗；医生允许的负重与活动范围；扭伤日期与最早 CT 的出入需核对。',
      files: [
        { name: '右踝四次检查对照分析', href: 'private_data/cases/orthopedics/right-ankle/右踝四次检查对照分析.html', meta: '2026-10-08' },
        { name: '右踝复诊沟通单', href: 'private_data/cases/orthopedics/right-ankle/右踝复诊沟通单.html', meta: '2026-10-08' },
        { name: '检查原件目录（CT / MRI 报告图片）', href: 'data/右脚踝/检查/', meta: '12 个文件' }
      ],
      timeline: [
        { date: '2026-08-19', text: 'CT 平扫 + 三维重组：外踝形态变化，未报告新骨折' },
        { date: '2026-07-05', text: 'MRI：少量积液，距腓后韧带及跟腱损伤不除外' },
        { date: '2026-02-24', text: 'MRI：骨髓水肿，距腓前韧带损伤，下胫腓前韧带部分撕裂不除外' },
        { date: '2025-12-27', text: '右足 CT：跟骨前外侧缘、骰骨后外侧缘骨折' }
      ]
    },
    {
      id: 'eyes', name: '眼睛', status: 'monitor',
      lastDate: '2026-10-22', lastLabel: '症状沟通',
      card: '干眼、睑板腺堵塞；半年多流泪刺痛，长期灯光光晕。',
      head: '自述干眼、睑板腺堵塞　·　2026-10-22 症状详录　·　当前用药待核对',
      evidence: [
        { type: '本人描述', text: '本人回忆医生曾诊断干眼、睑板腺堵塞。' },
        { type: '本人描述', text: '2026-10-22 描述双眼反复流泪刺痛半年多、长期灯光光晕、偶发冷暖色差。' },
        { type: '医院报告', text: '2026-05-23 眼科病历记录三种滴眼液，未写诊断、剂量及疗程。' },
        { type: '辅助分析', text: '光晕不自动归为真正的复视；5 月用药列表与 10 月自述海露分开记录，不能推定同时使用。' }
      ],
      need: '眼科复查结果与实际用药（海露频次、是否仍在用其他滴眼液）；流泪刺痛是否改善；开封日期年份待核对。',
      files: [
        { name: '2026-10-22 干眼与视觉症状沟通记录', href: 'private_data/cases/ophthalmology/dry-eye/2026-10-22_干眼与视觉症状沟通记录.html', meta: '2026-10-22' },
        { name: '2026-05-23 病历（用药列表）', href: 'private_data/cases/ophthalmology/dry-eye/病历.html', meta: '2026-05-23' }
      ],
      timeline: [
        { date: '2026-10-22', text: '记录流泪刺痛、光晕、色差与自述用药' },
        { date: '2026-05-23', text: '病历记录三种滴眼液，未写诊断与疗程' }
      ]
    },
    {
      id: 'septum', name: '鼻中隔偏右', status: 'history',
      lastDate: '2026-04-14', lastLabel: '文字记录',
      card: '2026-04 诊断鼻中隔偏右，磺胺冰片膏 7 天外用；现状待补充。',
      head: '2026-04-14 文字记录诊断　·　磺胺冰片膏 7 天外用　·　现状未记录',
      evidence: [
        { type: '本人描述', text: '2026-04-14 文字记录医生诊断鼻中隔偏右，外用磺胺冰片膏 7 天，部位未详述。' },
        { type: '辅助分析', text: '历史短疗程，是否完成未记录，不列为长期用药。' }
      ],
      need: '当前鼻塞、用药及复诊情况；当年是否做过影像检查。',
      files: [
        { name: '鼻中隔偏曲原记录', href: 'private_data/cases/ent/septum-deviation/鼻中隔偏曲.html', meta: '2026-04-14' }
      ],
      timeline: [
        { date: '2026-04-14', text: '诊断鼻中隔偏右；磺胺冰片膏短期外用' }
      ]
    },
    {
      id: 'rhinitis', name: '鼻炎', status: 'pending',
      lastDate: '未记录', lastLabel: '待补充',
      card: '存在空白文件，暂无病史或诊断内容。',
      head: '仅有空白文件　·　无病史或诊断内容',
      evidence: [
        { type: '辅助分析', text: '存在名为「鼻炎」的空白文件，不能由此推定确诊或曾有症状。' }
      ],
      need: '是否有医生诊断、具体症状、过敏情况及治疗经过。',
      files: [
        { name: '鼻炎空白记录', href: 'private_data/cases/ent/rhinitis/鼻炎.html', meta: '空白' }
      ],
      timeline: []
    },
    {
      /* 检验结论不写死：由 app.js 的 applyLabDerived() 从数据库化验实时派生，
         覆盖 card/head/evidence/need/lastDate/lastLabel/status。
         这里的占位文案不含任何“正常/异常”结论，避免像旧版那样过期误导。 */
      id: 'liver', name: '肝肾功能', status: 'pending',
      labDerived: ['肾功能', '肝功能'],
      lastDate: '未记录', lastLabel: '待录入化验单',
      card: '检验结论由数据库化验记录自动生成，随记录更新。',
      head: '化验结论自动派生　·　等待数据库记录',
      evidence: [],
      need: '录入报告后，结论与异常标记会自动更新。',
      files: [
        { name: '肝肾功能检查（空白表）', href: 'private_data/cases/nephrology/renal-function/肝肾功能检查.html', meta: '空白' }
      ],
      timeline: []
    },
    {
      id: 'hair', name: '脱发', status: 'pending',
      lastDate: '未记录', lastLabel: '待确认是否确诊',
      card: '「雄脱」空白记录，未经医生确认，也无可核实的治疗经过。',
      head: '仅有「雄脱」空白文件　·　未经医生确认',
      evidence: [
        { type: '辅助分析', text: '文件名为「雄脱」，但没有医生诊断、用药或疗效记录，不能视为已确诊。' }
      ],
      need: '是否经医生确诊、开始时间、目前用药与疗效。',
      files: [
        { name: '雄脱空白记录', href: 'private_data/cases/dermatology/androgenetic-alopecia/雄脱.html', meta: '空白' }
      ],
      timeline: []
    },
    {
      id: 'teeth', name: '牙齿 · 甲沟炎 · 脚气', status: 'stub',
      lastDate: '未记录', lastLabel: '仅有目录',
      card: '三个主题目前仅有目录，无任何记录。',
      head: '牙齿、甲沟炎、脚气　·　仅有主题目录',
      evidence: [
        { type: '辅助分析', text: '仅有目录结构，没有症状、诊断或治疗记录。' }
      ],
      need: '分别补充症状、是否确诊、就诊与治疗经过。',
      files: [],
      timeline: []
    },
    {
      id: 'urinary', name: '尿频尿急尿不尽', status: 'stub',
      lastDate: '未记录', lastLabel: '仅有目录',
      card: '仅有目录，无泌尿相关记录。',
      head: '仅有主题目录　·　无泌尿相关记录',
      evidence: [
        { type: '辅助分析', text: '仅有目录结构，没有症状起始时间、检查或诊断记录。' }
      ],
      need: '补充症状起始时间与频率、是否就诊、检查结果与用药。',
      files: [],
      timeline: []
    }
  ],

  timeline: [
    { date: '2026-10-27', type: '本人补充／建档', text: '27 岁、男、170 cm、88 kg；久坐少运动；右踝仍偶尔影响活动；提出减重目标。', href: 'private_data/record/profile/个人资料.html', src: '个人资料' },
    { date: '2026-10-22', type: '眼科症状沟通', text: '保存流泪刺痛、光晕、色差和自述用药，供复查参考。', href: 'private_data/cases/ophthalmology/dry-eye/2026-10-22_干眼与视觉症状沟通记录.html', src: '沟通原记录' },
    { date: '2026-10-09', type: '照片归档', text: '舌苔照片；未附症状或诊断，日期取自文件名。', href: 'data/照片/舌苔-20261009.jpg', src: '照片' },
    { date: '2026-10-07', type: '辅助资料整理', text: '四次右踝影像对照与复诊沟通准备，不是新增医院诊断。', href: 'private_data/cases/orthopedics/right-ankle/右踝四次检查对照分析.html', src: '对照分析' },
    { date: '2026-08-19', type: '右踝 CT', text: '外踝形态变化、骨岛及距骨喙／变异可能；未报告新骨折，不能由此确认旧伤完全愈合。', href: 'data/右脚踝/检查/', src: '报告原件' },
    { date: '2026-07-05', type: '右踝 MRI', text: '少量积液、软组织异常，距腓后韧带及跟腱损伤不除外。', href: 'data/右脚踝/检查/', src: '报告原件' },
    { date: '2026-05-23', type: '眼科用药列表', text: '记录三种滴眼液，未写诊断、剂量及疗程。', href: 'private_data/cases/ophthalmology/dry-eye/病历.html', src: '原记录' },
    { date: '2026-04-14', type: '鼻部就诊文字记录', text: '鼻中隔偏右；磺胺冰片膏短期外用。', href: 'private_data/cases/ent/septum-deviation/鼻中隔偏曲.html', src: '原记录' },
    { date: '2026-02-24', type: '右踝 MRI', text: '骨髓水肿、距腓前韧带损伤、下胫腓前韧带部分撕裂不除外。', href: 'data/右脚踝/检查/', src: '报告原件' },
    { date: '2025-12-27', type: '右足 CT', text: '跟骨前外侧缘、骰骨后外侧缘骨折等；报告 12-29 签发。', href: 'data/右脚踝/检查/', src: '报告原件' },
    { date: '2025-12-28', type: '扭伤日期（待核对）', text: '曾自述 12-28 扭伤，与最早 CT 12-27 有出入，暂不强行修正。', href: 'private_data/cases/orthopedics/right-ankle/右踝四次检查对照分析.html', src: '对照分析' }
  ],

  meds: {
    current: [
      {
        name: '海露玻璃酸钠滴眼液', use: '本人自述一般每日 1 次；每次滴数未说明',
        date: '2026-10-22', status: '是否仍用、浓度／包装待确认；开封日期「9 月 10 号」年份待核对',
        href: 'private_data/cases/ophthalmology/dry-eye/2026-10-22_干眼与视觉症状沟通记录.html'
      }
    ],
    history: [
      { name: '磺胺冰片膏', use: '每日 3 次，7 天，外用；部位未详述', date: '2026-04-14', status: '历史短疗程，是否完成未记录' },
      { name: '全氟乙基辛烷滴眼液', use: '未记录', date: '2026-05-23', status: '是否曾实际使用、是否已停用待确认' },
      { name: '环孢素滴眼液', use: '未记录', date: '2026-05-23', status: '同上' },
      { name: '思源（聚乙二醇滴眼液）', use: '未记录', date: '2026-05-23', status: '同上' }
    ],
    note: '原沟通中讨论的增加用药频次与护理方式属于建议，没有记录证明已执行，未写成实际用法。本页不构成续药、停药或调整剂量指令。'
  },

  todos: [
    {
      group: '近期核对',
      items: [
        { id: 't-eye', text: '眼科复查：确认 10-22 之后是否复查、流泪刺痛是否改善、目前实际用药', meta: '眼科　·　尚无复查记录', flag: true },
        { id: 't-ankle', text: '足踝门诊：带复诊沟通单，确认允许的负重与活动', meta: '右踝　·　上次检查 2026-08-19' },
        { id: 't-med', text: '用药核对：现用滴眼液、其他处方药、补充剂及过敏史', meta: '用药　·　当前用药未核对' }
      ]
    },
    {
      group: '减重起步',
      items: [
        { id: 't-waist', text: '记录腰围，开始同条件晨重，建立首个 7 天均值', meta: '减重　·　2026-11-03 首次周复盘' },
        { id: 't-diet', text: '从 2026-10-27 起记录饮食，含饮料、零食、烹调油和酱料；漏记写明', meta: '减重　·　每日记录' },
        { id: 't-review', text: '2026-11-03 首次周复盘；11-10 至 11-17 复核体重趋势和热量预算', meta: '减重　·　自行复盘，未设置提醒' },
        { id: 't-stage', text: '结合连续记录与身体反应确认春节前阶段目标', meta: '减重　·　原期望 130 斤，建议阶段目标 164 斤' }
      ]
    },
    {
      group: '档案逐步补齐',
      items: [
        { id: 't-lab', text: '核对最近肝肾功能化验的异常项（肌酐、尿酸）与医生意见', meta: '肝肾功能　·　按最近化验核对' },
        { id: 't-themes', text: '鼻炎、脱发、牙齿、甲沟炎、脚气、尿频：逐项确认症状、确诊与用药', meta: '6 个主题　·　待补充' },
        { id: 't-ankle2', text: '核对 2025 年末扭伤日期；补充右踝是否实际接受封闭及药物、部位、效果', meta: '右踝　·　日期有 1 天出入' },
        { id: 't-base', text: '补充睡眠、吸烟饮酒、手术住院和家族史', meta: '个人资料　·　4 项空白' }
      ]
    }
  ]
};
