import assert from 'node:assert/strict';
import test from 'node:test';
import { redactEvidenceText } from './redaction.mjs';

test('redacts live evidence credential patterns', () => {
  const githubToken = ['github', '_pat_', '1234567890abcdefghijklmnopqrstuvwxyz'].join('');
  const googleKey = ['AI', 'za', 'SyAabcdefghijklmnopqrstuvwxyz123456789'].join('');
  const openAiStyleKey = ['sk', '-proj-', 'abcdefghijklmnopqrstuvwxyz'].join('');
  const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----\nsecret\n-----END ', 'PRIVATE KEY-----'].join('');
  const input = [
    'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    'Proxy-Authorization: Token abcdefghijklmnopqrstuvwxyz',
    'x-api-key: opaque-provider-secret',
    'https://user:password@example.com/path?access_token=secret-token&safe=value',
    'postgres://user:database-password@localhost/db',
    'cookie: sid=session-value; csrf=csrf-value',
    githubToken,
    '123456789:abcdefghijklmnopqrstuvwxyzABCDE_12345',
    googleKey,
    openAiStyleKey,
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature',
    privateKey
  ].join('\n');

  const output = redactEvidenceText(input, 4000);

  assert.match(output, /Authorization: Basic \[redacted\]/u);
  assert.match(output, /Proxy-Authorization: Token \[redacted\]/u);
  assert.match(output, /x-api-key: \[redacted\]/u);
  assert.match(output, /access_token=\[redacted\]/u);
  assert.match(output, /https:\/\/\[redacted\]@example\.com/u);
  assert.match(output, /postgres:\/\/user:\[redacted\]@localhost/u);
  assert.match(output, /cookie: \[redacted\]/u);
  assert.match(output, /gh\[redacted\]/u);
  assert.match(output, /bot\[redacted\]/u);
  assert.match(output, /AIza\[redacted\]/u);
  assert.match(output, /sk-\[redacted\]/u);
  assert.match(output, /jwt\[redacted\]/u);
  assert.match(output, /\[redacted-private-key\]/u);

  assert.doesNotMatch(output, /dXNlcjpwYXNzd29yZA/u);
  assert.doesNotMatch(output, /opaque-provider-secret/u);
  assert.doesNotMatch(output, /database-password/u);
  assert.doesNotMatch(output, /secret-token/u);
});
