# -*- coding: utf-8 -*-
"""引用检索的服务端回归：refs() 列出什么、context() 怎么排、pins 是否覆盖普通检索。

跑法：python Tools/test-ai-refs.py
用临时库，不碰 data/health.db；不调用模型。
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'server'))

import health_server as hs          # noqa: E402
import health_features as hf        # noqa: E402

TMP = Path(tempfile.mkdtemp(prefix='health-refs-'))
hs.DB_PATH = TMP / 'test.db'
hs.init_db()
hf.install(hs)      # 正常启动时由 main() 注入，单测要自己补上

passed = failed = 0


def check(ok, label, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print('  ok   ' + label)
    else:
        failed += 1
        print('  FAIL ' + label + (('  → ' + str(detail)) if detail else ''))


def seed():
    with hs.connect() as c:
        c.execute("INSERT OR REPLACE INTO reports (id,date,title,panel,specimen,hospital,note,file,created_at) "
                  "VALUES (?,?,?,?,?,?,?,?,?)",
                  ('r-kidney', '2026-03-12', '肾功能 + 电解质', '生化', '血液', '示例医院', '', '/files/r-kidney.jpg', 1))
        c.execute("INSERT OR REPLACE INTO reports (id,date,title,panel,specimen,hospital,note,file,created_at) "
                  "VALUES (?,?,?,?,?,?,?,?,?)",
                  ('r-liver', '2026-01-08', '肝功能', '生化', '血液', '示例医院', '', '', 2))
        for i, name in enumerate(['肌酐', '尿酸', '尿素']):
            c.execute("INSERT OR REPLACE INTO labs (id,date,category,name,value,unit,low,high,source,note,report_id) "
                      "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                      ('l%d' % i, '2026-03-12', '肾功能', name, 70 + i, 'μmol/L', 40, 100, '医院报告', '', 'r-kidney'))
        c.execute("INSERT OR REPLACE INTO visit (id,date,visit_type,department,hospital,doctor,chief,diagnosis,summary,report_id,note,created_at) "
                  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                  ('v1', '2026-03-20', '复诊', '肾内科', '示例医院', '', '复查', '', '带报告复诊', '', '', 3))
        c.commit()


seed()

print('refs()')
data = hf.refs()['refs']
kinds = [r['kind'] for r in data]
check(len(data) == 4, '列出了可引用的记录', len(data))
check(kinds.count('reports') == 2, '两份报告都在', kinds.count('reports'))
check(any(r['kind'] == 'visits' for r in data), '就诊记录可引用')
lab_ref = next((r for r in data if r['kind'] == 'labs'), None)
check(lab_ref is not None and lab_ref['id'] == 'date:2026-03-12', '检验按日期成批', lab_ref)
check(lab_ref and '3 项' in lab_ref['label'], '检验批次标了项数', lab_ref and lab_ref['label'])
check([r['date'] for r in data if r['kind'] == 'reports'] == ['2026-03-12', '2026-01-08'], '报告按日期倒序')
check(next(r for r in data if r['id'] == 'r-kidney')['hasImage'] is True, '带图片的报告有标记')
check(all(r['label'] for r in data), '每条都有可读名称')

print('context() 引用优先')
plain = hf.context('随便问一句')
pinned = hf.context('随便问一句', [{'kind': 'reports', 'id': 'r-liver'}])
check(pinned[0]['id'] == 'r-liver' and pinned[0].get('pinned'), '引用的报告排在第一条', pinned[0].get('id'))
check(sum(1 for s in pinned if s['kind'] == 'reports' and s['id'] == 'r-liver') == 1, '同一条不重复出现')
check([s['ref'] for s in pinned[:3]] == ['S1', 'S2', 'S3'], '编号从 S1 连续分配')
check(pinned[0]['record'].get('title') == '肝功能', '记录字段原样搬运')

print('context() 检验按日期展开')
labs_pin = hf.context('这天的结果', [{'kind': 'labs', 'id': 'date:2026-03-12'}])
pinned_labs = [s for s in labs_pin if s.get('pinned')]
check(len(pinned_labs) == 3, '同一天的 3 项都进来了', len(pinned_labs))
check(all(s['kind'] == 'labs' and s['date'] == '2026-03-12' for s in pinned_labs), '都是那天的检验')
check(len({s['id'] for s in labs_pin}) == len(labs_pin), '没有重复条目')

print('context() 失效引用')
broken = hf.context('问一句', [{'kind': 'reports', 'id': '不存在'}, {'kind': 'visits', 'id': ''}, 'junk', None])
check(isinstance(broken, list) and broken, '坏引用不影响正常检索', len(broken))
check(not any(s.get('pinned') for s in broken), '坏引用不会留下空壳')
check(hf.context('', None) == hf.context(''), '空问句也稳定')

print('引用大小上限')
big = hf.context('问', [{'kind': 'labs', 'id': 'date:2026-03-12'}] * 5)
check(len(json.dumps(big, ensure_ascii=False)) <= 48000, '整包不超过 48000 字符')

print('chat() 真的用上了引用')
hf.call_model = lambda messages, model=None: '按引用的记录整理。'   # 不联网，只验链路
entry = hf.chat({'question': '这份报告怎么看', 'refs': [{'kind': 'reports', 'id': 'r-liver'}]})
check(entry['sources'][0]['id'] == 'r-liver', '回答带回来的第一条就是引用的报告', entry['sources'][0]['id'])
check(entry['sources'][0].get('pinned') is True, '来源上标了 pinned')
with hs.connect() as c:
    saved = json.loads(c.execute('SELECT sources FROM ai_chat ORDER BY created_at DESC LIMIT 1').fetchone()['sources'])
check(any(s.get('pinned') for s in saved), '引用随问答一起落库，重新打开还能看出来')
check(hf.chat({'question': '普通提问'})['sources'][0].get('pinned') is None, '不引用时不打标记')

shutil.rmtree(TMP, ignore_errors=True)
print('\n通过 %d 项，失败 %d 项' % (passed, failed))
sys.exit(1 if failed else 0)
