"""Feature integration tests: temporary databases, loopback HTTP and fake model only."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'server'))
import health_server as h
import health_features as f


class Model(BaseHTTPRequestHandler):
    contexts = []
    last_authorization = None

    def do_GET(self):
        raw = json.dumps({'data': [
            {'id': 'test-model', 'owned_by': 'test', 'modalities': {'input': ['text', 'image']}},
            {'id': 'test-vision-alt', 'owned_by': 'test', 'modalities': {'input': ['text', 'image']}},
            {'id': 'test-text-only', 'owned_by': 'test', 'modalities': {'input': ['text']}}
        ]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        Model.last_authorization = self.headers.get('Authorization')
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        content = payload['messages'][1]['content']
        if '只返回 JSON' in payload['messages'][0]['content']:
            self.contexts.append({'image': content[1]['image_url']['url']})
            answer = json.dumps({'lines': ['报告日期：2026-01-01', '测试项目\t12\tu\t1--20']})
        else:
            context = json.loads(content[0]['text'])
            context['requestedModel'] = payload['model']
            context['imageCount'] = sum(c['type'] == 'image_url' for c in content)
            self.contexts.append(context)
            answer = '测试回答，依据 [S1]。'
        raw = json.dumps({'choices': [{'message': {'content': answer}}]}).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):
        pass


class Features(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='health-features-')
        h.DB_PATH = Path(cls.tmp.name) / 'test.db'
        h.IMG_DIR = Path(cls.tmp.name) / 'default-files'
        h.init_db()
        f.install(h)
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), h.Handler)
        cls.model = ThreadingHTTPServer(('127.0.0.1', 0), Model)
        for server in (cls.http, cls.model):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.url = 'http://127.0.0.1:' + str(cls.http.server_port)
        cls.saved_env = {key: os.environ.get(key) for key in ('HEALTH_AI_URL', 'HEALTH_AI_MODEL')}
        os.environ['HEALTH_AI_URL'] = 'http://127.0.0.1:' + str(cls.model.server_port) + '/chat'
        os.environ['HEALTH_AI_MODEL'] = 'test-model'
        cls.pid = cls.api('/api/profiles', {'name': '测试成员', 'relation': '家人'})['id']

    @classmethod
    def tearDownClass(cls):
        for server in (cls.http, cls.model):
            server.shutdown()
            server.server_close()
        for key, value in cls.saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        cls.tmp.cleanup()

    @classmethod
    def api(cls, path, data=None, pid='default', method=None, auth=False, origin=None):
        headers = {'Content-Type': 'application/json', 'X-Health-Profile': pid}
        if auth:
            headers['Authorization'] = 'Bearer ' + (h.DB_PATH.parent / 'test.agent-token').read_text()
        if origin:
            headers['Origin'] = origin
        req = Request(cls.url + path, data=json.dumps(data).encode() if data is not None else None,
                      method=method, headers=headers)
        with urlopen(req, timeout=10) as r:
            raw = r.read()
            return json.loads(raw) if 'json' in r.headers.get('Content-Type', '') else raw

    def test_profile_isolation_concurrent(self):
        def write(pid, value):
            self.api('/api/state', {'weights': [{'id': 'same-id', 'date': '2026-01-01', 'kg': value}], 'done': {}}, pid, 'PUT')
            return self.api('/api/all', pid=pid)['weights'][0]['kg']
        with concurrent.futures.ThreadPoolExecutor() as pool:
            futures = [pool.submit(write, 'default', 61), pool.submit(write, self.pid, 72)]
            self.assertEqual([v.result() for v in futures], [61, 72])

    def test_report_images_and_export(self):
        for pid, contents in [('default', 'QQ=='), (self.pid, 'Qg==')]:
            self.api('/api/reports', [{'id': 'same-report', 'date': '2026-01-01', 'title': '测试报告',
                     'file': 'data:image/png;base64,' + contents}], pid, 'PUT')
            report = self.api('/api/all', pid=pid)['reports'][0]
            self.assertEqual(self.api(report['file'], pid=pid), b'A' if pid == 'default' else b'B')
            exported = self.api('/api/export', pid=pid)
            self.assertTrue(exported['reports'][0]['file'].endswith(contents))
            self.api('/api/reports', [report], pid, 'PUT')
            self.assertEqual(self.api(report['file'], pid=pid), b'A' if pid == 'default' else b'B')

    def test_saved_connection_settings_and_secret_redaction(self):
        endpoint = 'http://127.0.0.1:' + str(self.model.server_port) + '/v1'
        try:
            config = self.api('/api/ai/config', {'mode': 'custom', 'custom': {
                'endpoint': endpoint, 'model': 'test-vision-alt', 'key': 'test-only-secret'}})
            self.assertTrue(config['custom']['keySet'])
            self.assertEqual(config['custom']['endpoint'], endpoint + '/chat/completions')
            self.assertNotIn('test-only-secret', json.dumps(config))
            self.assertNotIn('test-only-secret', json.dumps(self.api('/api/ai/config')))
            result = self.api('/api/ai/chat', {'question': '自定义 API 测试'}, self.pid)
            self.assertEqual(result['model'], 'test-vision-alt')
            self.assertEqual(Model.last_authorization, 'Bearer test-only-secret')
            with self.assertRaises(HTTPError) as error:
                self.api('/api/ai/config', {'mode': 'custom', 'custom': {
                    'endpoint': endpoint + '/other', 'model': 'test-model', 'key': ''}})
            self.assertEqual(error.exception.code, 400)
            self.api('/api/ai/config', {'mode': 'magpie'})
            self.assertEqual(self.api('/api/ai/status')['model'], 'workbuddy/glm-5.3-flash')
            self.assertTrue(self.api('/api/ai/config')['custom']['keySet'])
            self.api('/api/ai/config', {'mode': 'custom', 'custom': {
                'endpoint': endpoint, 'model': 'test-model', 'key': ''}})
            self.assertEqual(f.effective_ai_config()['key'], 'test-only-secret')
            self.assertEqual(json.loads(f.config_path().read_text())['mode'], 'custom')
            self.api('/api/ai/config', {'mode': 'custom', 'custom': {
                'endpoint': endpoint, 'model': 'test-model', 'clearKey': True}})
            self.assertFalse(self.api('/api/ai/config')['custom']['keySet'])
        finally:
            f.config_path().unlink(missing_ok=True)
            f._model_cache.clear()

    def test_saved_connection_validation(self):
        for endpoint in ('http://remote.example/v1', 'https://user:secret@example.com/v1', 'file:///etc/passwd',
                         'https://example.com:invalid/v1'):
            with self.assertRaises(HTTPError) as error:
                self.api('/api/ai/config', {'mode': 'custom', 'custom': {'endpoint': endpoint, 'model': 'test-model'}})
            self.assertEqual(error.exception.code, 400)

    def test_agent_crud_and_auth(self):
        with self.assertRaises(HTTPError) as error:
            self.api('/api/agent', {'action': 'list_profiles'})
        self.assertEqual(error.exception.code, 401)
        saved = self.api('/api/agent', {'action': 'upsert_record', 'profile_id': self.pid, 'kind': 'symptoms',
                        'record': {'date': '2026-01-01', 'part': '测试部位'}}, auth=True)
        self.assertTrue(saved['ok'])
        self.api('/api/agent', {'action': 'delete_record', 'profile_id': self.pid, 'kind': 'symptoms',
                 'record_id': saved['id']}, auth=True)
        self.assertEqual(self.api('/api/all', pid=self.pid)['symptoms'], [])

    def test_invalid_member_and_origin(self):
        for kwargs, code in [({'pid': '../bad'}, 404), ({'origin': 'https://untrusted.example'}, 403)]:
            with self.assertRaises(HTTPError) as error:
                self.api('/api/all', **kwargs)
            self.assertEqual(error.exception.code, code)

    def test_agent_requires_explicit_member_and_valid_fields(self):
        for payload in [{'action': 'read_archive'}, {'action': 'upsert_record', 'profile_id': self.pid,
                        'kind': 'labs', 'record': {'date': 'wrong'}}]:
            with self.assertRaises(HTTPError) as error:
                self.api('/api/agent', payload, auth=True)
            self.assertEqual(error.exception.code, 400)

    def test_grounded_chat_isolation_history(self):
        self.api('/api/symptoms', [{'id': 'private-symptom', 'date': '2026-01-01', 'part': '成员专属测试'}], self.pid, 'PUT')
        reply = self.api('/api/ai/chat', {'question': '成员专属测试情况'}, self.pid)
        self.assertIn('[S1]', reply['answer'])
        context = Model.contexts[-1]
        self.assertEqual(context['member']['id'], self.pid)
        self.assertTrue(any(s['id'] == 'private-symptom' for s in context['sources']))
        self.assertFalse(any(s['kind'] == 'document' for s in context['sources']))
        self.assertEqual(len(self.api('/api/ai/history', pid=self.pid)['messages']), 1)
        self.assertEqual(self.api('/api/ai/history')['messages'], [])
        self.api('/api/symptoms', [], self.pid, 'PUT')

    def test_model_unconfigured(self):
        model = os.environ['HEALTH_AI_MODEL']
        os.environ['HEALTH_AI_MODEL'] = ''
        try:
            with self.assertRaises(HTTPError) as error:
                self.api('/api/ai/chat', {'question': '测试'}, self.pid)
            self.assertEqual(error.exception.code, 400)
        finally:
            os.environ['HEALTH_AI_MODEL'] = model

    def test_model_catalog_and_per_request_selection(self):
        catalog = self.api('/api/ai/models?refresh=1')
        self.assertEqual([m['id'] for m in catalog['models']], ['test-model', 'test-vision-alt'])
        self.assertEqual(catalog['defaultModel'], 'test-model')
        result = self.api('/api/ai/chat', {'question': '测试模型切换', 'model': 'test-vision-alt'}, self.pid)
        self.assertEqual(result['model'], 'test-vision-alt')
        self.assertEqual(Model.contexts[-1]['requestedModel'], 'test-vision-alt')
        saved = self.api('/api/ai/history', pid=self.pid)['messages'][-1]
        self.assertEqual(saved['model'], 'test-vision-alt')
        self.assertEqual(self.api('/api/ai/status')['model'], 'test-model')
        for model in ('unknown-model', 'test-text-only'):
            with self.assertRaises(HTTPError) as error:
                self.api('/api/ai/chat', {'question': '测试', 'model': model}, self.pid)
            self.assertEqual(error.exception.code, 400)

    def test_multimodal_report_parse(self):
        image = b'\x89PNG\r\n\x1a\n' + b'test-image'
        req = Request(self.url + '/api/ai/parse', data=image,
                      headers={'Content-Type': 'image/png', 'X-Health-Profile': self.pid})
        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read())
        self.assertEqual(result['engine'], 'multimodal')
        self.assertTrue(result['reviewRequired'])
        self.assertIn('测试项目', result['lines'][1]['text'])
        self.assertTrue(Model.contexts[-1]['image'].startswith('data:image/png;base64,'))

    def test_multimodal_chat_attaches_only_current_member_images(self):
        import base64
        raw = b'\x89PNG\r\n\x1a\n' + b'current-member'
        other = b'\x89PNG\r\n\x1a\n' + b'other-member'
        for pid, image in [(self.pid, raw), ('default', other)]:
            self.api('/api/reports', [{'id': 'image-test', 'date': '2026-01-01', 'title': '测试图片报告',
                     'file': 'data:image/png;base64,' + base64.b64encode(image).decode()}], pid, 'PUT')
        result = self.api('/api/ai/chat', {'question': '请看测试图片报告'}, self.pid)
        self.assertEqual(Model.contexts[-1]['imageCount'], 1)
        self.assertTrue(any(s.get('imageProvided') for s in result['sources']))

    def test_mcp_stdio_lifecycle_and_write(self):
        messages = [
            {'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-11-25'}},
            {'method': 'notifications/initialized'}, {'id': 2, 'method': 'tools/list'},
            {'id': 3, 'method': 'tools/call', 'params': {'name': 'list_profiles'}},
            {'id': 4, 'method': 'tools/call', 'params': {'name': 'upsert_record', 'arguments': {
                'profile_id': self.pid, 'kind': 'todoItems', 'record': {'text': '测试待办'}}}},
            {'id': 5, 'method': 'tools/call', 'params': {'name': 'read_archive', 'arguments': {'profile_id': self.pid}}}]
        process = subprocess.run([sys.executable, str(Path(h.__file__).with_name('health_mcp.py')), '--url', self.url,
                                  '--token-file', str(h.DB_PATH.parent / 'test.agent-token')],
                                 input=''.join(json.dumps({'jsonrpc': '2.0', **m})+'\n' for m in messages),
                                 capture_output=True, text=True, encoding='utf-8', timeout=20)
        self.assertEqual(process.returncode, 0, process.stderr)
        results = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual(len(results), 5)
        self.assertEqual(len(results[1]['result']['tools']), 6)
        self.assertNotIn('isError', results[3]['result'])
        archive = json.loads(results[4]['result']['content'][0]['text'])
        self.assertTrue(any(r['text'] == '测试待办' for r in archive['todoItems']))


if __name__ == '__main__':
    unittest.main(verbosity=2)
