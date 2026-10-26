// Actual Codex install in a disposable config home; no real user settings or auth.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = process.argv[2] || root;
const testHome = mkdtempSync(join(tmpdir(), 'ysk-codex-install-'));
const env = { ...process.env, CODEX_HOME: testHome };
function cli(args) {
  const result = spawnSync('codex', args, { env, cwd: testHome, encoding: 'utf8', timeout: 25000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
console.log('Isolated Codex directory:', testHome);
console.log(cli(['plugin', 'marketplace', 'add', source, '--json']));
const installed = JSON.parse(cli(['plugin', 'add', 'you-should-know@team-ysk', '--json']));
console.log(JSON.stringify(installed));

const server = spawn('codex', ['app-server', '--stdio'], { cwd: testHome, env, stdio: ['pipe', 'pipe', 'pipe'] });
let sequence = 0;
const pending = new Map();
const notifications = [];
const lines = createInterface({ input: server.stdout });
server.stderr.on('data', () => {});
lines.on('line', line => {
  let response;
  try { response = JSON.parse(line); } catch { return; }
  if (response.method) notifications.push(response);
  if (pending.has(response.id)) {
    pending.get(response.id)(response);
    pending.delete(response.id);
  }
});
async function rpc(method, params) {
  const id = ++sequence;
  let timer;
  try {
    const response = await Promise.race([
      new Promise(resolve => { pending.set(id, resolve); server.stdin.write(JSON.stringify({ id, method, params }) + '\n'); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 20000); }),
    ]);
    assert.ok(!response.error, JSON.stringify(response.error));
    return response.result;
  } finally { clearTimeout(timer); pending.delete(id); }
}
async function waitFor(check) {
  const deadline = Date.now() + 10000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for host hook/turn events');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
try {
  await rpc('initialize', { clientInfo: { name: 'ysk-install-test', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  server.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  const skills = await rpc('skills/list', { cwds: [testHome], forceReload: true });
  const yskSkills = skills.data.flatMap(entry => entry.skills).filter(skill => skill.name.includes('ysk-review'));
  assert.equal(yskSkills.length, 1);
  assert.ok(skills.data.every(entry => entry.errors.length === 0));
  console.log('PASS: host parses and discovers ysk-review skill without errors.');
  const result = await rpc('hooks/list', { cwds: [testHome] });
  const entries = result.data ?? result.entries;
  assert.ok(Array.isArray(entries), 'Expected hook entries');
  const hooks = entries.flatMap(entry => entry.hooks).filter(hook => hook.pluginId === 'you-should-know@team-ysk');
  assert.equal(hooks.length, 2);
  assert.ok(hooks.every(hook => hook.enabled && hook.trustStatus === 'untrusted'));
  assert.ok(entries.every(entry => entry.errors.length === 0));
  assert.ok(entries.every(entry => entry.warnings.length === 0));
  console.log('PASS: both hooks parsed and enabled. First install requires host trust.');
  // Test-only trust of our own code, confined to this disposable config home.
  // Production plugin never writes trust settings or bypasses host trust.
  await rpc('config/batchWrite', { edits: hooks.map(hook => {
    const [trusted_hash, trusted_content_hash] = hook.currentHash.split('/');
    return { keyPath: `hooks.state.${JSON.stringify(hook.key)}`, mergeStrategy: 'replace', value: { trusted_hash, trusted_content_hash } };
  }) });
  const trusted = await rpc('hooks/list', { cwds: [testHome] });
  assert.ok(trusted.data[0].hooks.every(hook => hook.trustStatus === 'trusted'));
  console.log('PASS: isolated host trust correctly activates both hooks.');
  async function turn(expected) {
    const started = await rpc('thread/start', { cwd: testHome, ephemeral: true, approvalPolicy: 'never',
      modelProvider: 'offline', config: { model_providers: { offline: { name: 'Offline hook test', base_url: 'http://127.0.0.1:9/v1', wire_api: 'responses', request_max_retries: 0 } } } });
    const offset = notifications.length;
    const result = await rpc('turn/start', { threadId: started.thread.id, input: [{ type: 'text', text: 'Hook integration test only.', text_elements: [] }] });
    await waitFor(() => notifications.slice(offset).some(item => item.method === 'hook/completed' && item.params.run.eventName === 'userPromptSubmit'));
    await rpc('turn/interrupt', { threadId: started.thread.id, turnId: result.turn.id });
    const runs = notifications.slice(offset).filter(item => item.method === 'hook/completed').map(item => item.params.run);
    assert.ok(runs.some(run => run.eventName === 'userPromptSubmit'));
    assert.ok(runs.some(run => run.eventName === 'sessionStart'));
    assert.ok(runs.every(run => run.status === 'completed'));
    const contexts = runs.flatMap(run => run.entries).filter(entry => entry.kind === 'context').map(entry => entry.text);
    assert.ok(contexts.length > 0 && contexts.every(text => text.includes(expected)));
    return contexts[0];
  }
  const initial = await turn('YSK_REVIEW_ENABLED');
  console.log('PASS: host executes both hooks and accepts hidden enabled context.');
  const data = JSON.parse(initial.split('\n').find(line => line.startsWith('YSK data directory: ')).slice('YSK data directory: '.length));
  function control(command) {
    const result = spawnSync(process.execPath, [join(installed.installedPath, 'scripts/ysk.mjs'), command, '--data', data], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  assert.equal(control('off').enabled, false);
  await turn('YSK_REVIEW_DISABLED');
  console.log('PASS: next real host turn receives disabled context after off.');
  cli(['plugin', 'add', 'you-should-know@team-ysk', '--json']);
  assert.equal(control('status').enabled, false);
  console.log('PASS: reinstall preserves disabled state outside version cache.');
  assert.equal(control('on').enabled, true);
  await turn('YSK_REVIEW_ENABLED');
  console.log('PASS: explicit on restores real host context.');
  console.log('No live model was called; independent-review behavior still needs a live pilot.');
} finally {
  lines.close();
  server.kill();
}
