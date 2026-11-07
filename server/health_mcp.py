#!/usr/bin/env python3
"""Local MCP stdio adapter. Protocol 2025-11-25; stdout is JSON-RPC only."""
import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

KINDS = ['labs', 'reports', 'weights', 'body', 'vitals', 'symptoms', 'visits', 'medications',
         'allergies', 'familyHistory', 'surgeries', 'dietDays', 'dietWeeks', 'sleepLogs', 'todoItems']


def tool(name, description, properties, required):
    return {'name': name, 'description': description,
            'inputSchema': {'type': 'object', 'properties': properties, 'required': required, 'additionalProperties': False},
            'annotations': {'readOnlyHint': name in ('list_profiles', 'read_archive'),
                            'destructiveHint': name == 'delete_record', 'openWorldHint': name == 'ask'}}


P = {'type': 'string', 'description': 'Explicit member ID from list_profiles; never infer the patient.'}
K = {'type': 'string', 'enum': KINDS}
TOOLS = [
    tool('list_profiles', 'List household health archives. Select the intended person before any record operation.', {}, []),
    tool('save_profile', 'Create a member or rename one using its id. Existing records are preserved.',
         {'profile': {'type': 'object', 'properties': {'id': {'type': 'string'}, 'name': {'type': 'string'},
          'relation': {'type': 'string'}}, 'required': ['name'], 'additionalProperties': False}}, ['profile']),
    tool('read_archive', 'Read structured health data for one member. Missing data is unknown, not negative.', {'profile_id': P}, ['profile_id']),
    tool('upsert_record', 'Create or patch one record; omit id to create. Dates YYYY-MM-DD. Read existing records for field names. '
         'Labs require date/category/name/unit and numeric value or qualitative; reports date/title; weights date/kg; '
         'visits date; medications name; symptoms date/part; todos text. Never invent medical facts.',
         {'profile_id': P, 'kind': K, 'record': {'type': 'object'}}, ['profile_id', 'kind', 'record']),
    tool('delete_record', 'Delete one record by ID from the explicit member. Report deletion unlinks results.',
         {'profile_id': P, 'kind': K, 'record_id': {'type': 'string'}}, ['profile_id', 'kind', 'record_id']),
    tool('ask', 'Ask the configured model using only this member’s retrieved records; sends context to the configured model service.',
         {'profile_id': P, 'question': {'type': 'string', 'maxLength': 4000}}, ['profile_id', 'question'])]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    parser.add_argument('--token-file', type=Path, default=Path(__file__).resolve().parent.parent / 'data' / 'health.agent-token')
    args = parser.parse_args()
    url = urlparse(args.url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost', '::1'):
        parser.error('The agent bridge connects only to a local HTTP health service.')
    initialized = False
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict) or request.get('jsonrpc') != '2.0' or not isinstance(request.get('method'), str):
                raise ValueError('Invalid JSON-RPC request')
            method = request['method']
            if 'id' not in request:
                continue
            if method == 'initialize':
                requested = request.get('params', {}).get('protocolVersion')
                version = requested if requested in ('2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25') else '2025-11-25'
                result = {'protocolVersion': version, 'capabilities': {'tools': {}},
                          'serverInfo': {'name': 'health-archive', 'version': '1.0.0'}}
                initialized = True
            elif method == 'ping':
                result = {}
            elif not initialized:
                raise ValueError('Initialize first')
            elif method == 'tools/list':
                result = {'tools': TOOLS}
            elif method == 'tools/call':
                params = request.get('params', {})
                definition = next((t for t in TOOLS if t['name'] == params.get('name')), None)
                values = params.get('arguments', {})
                if definition is None or not isinstance(values, dict):
                    raise ValueError('Unknown tool or invalid arguments')
                schema = definition['inputSchema']
                if any(k not in values for k in schema['required']) or any(k not in schema['properties'] for k in values):
                    raise ValueError('Missing or unexpected tool arguments')
                try:
                    payload = {**values, 'action': definition['name']}
                    secret = args.token_file.read_text(encoding='utf-8').strip()
                    req = Request(args.url.rstrip('/') + '/api/agent', data=json.dumps(payload).encode(),
                                  headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + secret})
                    with urlopen(req, timeout=100) as response:
                        data = json.loads(response.read())
                    result = {'content': [{'type': 'text', 'text': json.dumps(data, ensure_ascii=False)}]}
                except Exception as error:
                    from urllib.error import HTTPError
                    message = '本机服务不可用，请确认已启动健康档案服务且 token-file 与数据库匹配'
                    if isinstance(error, HTTPError):
                        try:
                            message = json.loads(error.read()).get('error', message)
                        except Exception:
                            pass
                    result = {'isError': True, 'content': [{'type': 'text', 'text': message}]}
            else:
                print(json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'error': {'code': -32601, 'message': 'Method not found'}}), flush=True)
                continue
            response = {'jsonrpc': '2.0', 'id': request['id'], 'result': result}
        except Exception as error:
            response = {'jsonrpc': '2.0', 'id': request.get('id') if isinstance(request, dict) else None,
                        'error': {'code': -32700 if isinstance(error, json.JSONDecodeError) else -32602, 'message': str(error)}}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    main()
