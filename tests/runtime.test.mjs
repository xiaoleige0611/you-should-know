import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = new URL('../scripts/ysk.mjs', import.meta.url);
function fixture() {
  const data = mkdtempSync(join(tmpdir(), 'ysk-test-'));
  return {
    data,
    run(args, payload = {}) {
      return spawnSync(process.execPath, [fileURLToPath(script), ...args], {
        env: { ...process.env, PLUGIN_DATA: data },
        input: JSON.stringify(payload), encoding: 'utf8',
      });
    },
  };
}
test('fresh installation injects hidden review context without activation command', () => {
  const { run } = fixture();
  const result = run(['hook'], { hook_event_name: 'SessionStart' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('YSK_REVIEW_ENABLED'));
  assert.equal(out.suppressOutput, true);
});
test('off persists across processes; on restores review context', () => {
  const { run } = fixture();
  assert.equal(run(['off']).status, 0);
  assert.equal(JSON.parse(run(['status']).stdout).enabled, false);
  const disabled = JSON.parse(run(['hook'], { hook_event_name: 'UserPromptSubmit' }).stdout);
  assert.ok(disabled.hookSpecificOutput.additionalContext.includes('YSK_REVIEW_DISABLED'));
  assert.ok(!disabled.hookSpecificOutput.additionalContext.includes('YSK_REVIEW_ENABLED'));
  assert.equal(run(['on']).status, 0);
  assert.equal(JSON.parse(run(['status']).stdout).enabled, true);
});
test('status is read-only and off state stays outside the plugin install', () => {
  const { run, data } = fixture();
  run(['off']);
  assert.deepEqual(JSON.parse(readFileSync(join(data, 'state.json'), 'utf8')), { enabled: false });
  const before = readFileSync(join(data, 'state.json'), 'utf8');
  run(['status']);
  assert.equal(readFileSync(join(data, 'state.json'), 'utf8'), before);
});
test('invalid state does not silently re-enable review', () => {
  const { run, data } = fixture();
  for (const text of ['broken', '{}', '{"enabled":"false"}']) {
    writeFileSync(join(data, 'state.json'), text);
    assert.notEqual(run(['status']).status, 0);
    const result = run(['hook'], { hook_event_name: 'SessionStart' });
    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes('YSK_REVIEW_ENABLED'));
    assert.ok(result.stdout.includes('YSK_REVIEW_DISABLED'));
    assert.ok(result.stderr.includes('state'));
  }
});
test('unsupported and malformed hook inputs cannot activate review', () => {
  const { run } = fixture();
  assert.equal(run(['hook'], { hook_event_name: 'SubagentStart' }).stdout, '');
  assert.equal(run(['hook'], {}).stdout, '');
  assert.notEqual(run(['unknown']).status, 0);
});
