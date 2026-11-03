import { PetStateStore } from '../state.js';
import { apply } from '../index.js';
import assert from 'node:assert';
import { Writable } from 'node:stream';

function makeRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    }
  });
  res._status = 0;
  res._headers = {};
  res._body = Buffer.alloc(0);
  res.writeHead = (status, headers) => { res._status = status; res._headers = headers || {}; return res; };
  res._closed = new Promise(resolve => {
    res.on('finish', () => { res._body = Buffer.concat(chunks); resolve(); });
    res.on('close', () => { res._body = Buffer.concat(chunks); resolve(); });
    res.on('error', () => resolve());
  });
  return res;
}

async function main() {
  // 1. state machine transitions
  let nowMs = 0;
  const store = new PetStateStore({ now: () => nowMs });
  const s = { header: { id: 'sess-1' } };
  store.update(s, { type: 'turn/start', seq: 1 });
  assert.equal(store.snapshot().state, 'working', 'turn/start -> working');
  store.update(s, { type: 'approval/asked', seq: 2 });
  assert.equal(store.snapshot().state, 'waiting', 'approval/asked -> waiting');
  store.update(s, { type: 'tool/call', seq: 3, data: { name: 'ask_user_question' } });
  assert.equal(store.snapshot().state, 'waiting', 'ask_user_question -> waiting');
  store.update(s, { type: 'tool/call', seq: 4, data: { name: 'Bash' } });
  assert.equal(store.snapshot().state, 'working', 'normal tool -> working');
  store.update(s, { type: 'todo/write', seq: 5, data: { todos: [
    { status: 'completed' }, { status: 'in_progress', content: '写插件' }, { status: 'pending' }
  ] } });
  let snap = store.snapshot();
  assert.equal(snap.task.completed, 1);
  assert.equal(snap.task.total, 3);
  assert.equal(snap.task.title, '写插件');
  store.update(s, { type: 'turn/end', seq: 6, data: { reason: { kind: 'completed' } } });
  assert.equal(store.snapshot().state, 'complete', 'turn/end completed -> complete');
  store.update(s, { type: 'turn/end', seq: 7, data: { reason: { kind: 'error' } } });
  assert.equal(store.snapshot().state, 'error', 'turn/end error -> error');
  store.error({ sessionId: 'sess-1' });
  assert.equal(store.snapshot().state, 'error', 'agent/error -> error');

  // stuck-alert recovery: an archived errored session must not dominate forever
  store.update(s, { type: 'turn/end', seq: 8, data: { reason: { kind: 'error' } } });
  const sB = { header: { id: 'sess-b' } };
  store.update(sB, { type: 'turn/start', seq: 9 });
  assert.equal(store.snapshot().state, 'error', 'stale error still wins until handled');
  assert.equal(store.snapshot().sessionId, 'sess-1');
  assert.equal(store.ack('sess-1'), true, 'ack clears the error');
  assert.equal(store.snapshot().state, 'working', 'falls back to the live session');
  assert.equal(store.ack('sess-1'), false, 'ack on non-error returns false');
  store.update(s, { type: 'turn/end', seq: 10, data: { reason: { kind: 'error' } } });
  store.drop('sess-1');
  assert.equal(store.snapshot().state, 'working', 'drop removes the archived record');
  console.log('state-machine OK');

  // 2. HTTP routes with a mock ctx
  let registered;
  const ctx = {
    logger: { info() {} },
    on() { return () => {}; },
    effect(fn) { fn(); },
    webServer: { register(def) { registered = def; } }
  };
  apply(ctx);
  assert.ok(registered, 'webServer route registered');
  assert.equal(registered.path, '/claude-pet-dsh');
  const handler = registered.handler;

  async function req(url, method = 'GET') {
    const res = makeRes();
    await handler({ method, url }, res);
    await res._closed;
    return res;
  }

  const health = await req('/claude-pet-dsh/health');
  assert.equal(health._status, 200);
  assert.match(health._headers['content-type'], /application\/json/);
  assert.equal(JSON.parse(health._body.toString()).plugin, 'claude-pet-dsh');

  const state = await req('/claude-pet-dsh/state');
  assert.equal(state._status, 200);
  const stateBody = JSON.parse(state._body.toString());
  assert.ok('state' in stateBody && 'source' in stateBody);

  const sheet = await req('/claude-pet-dsh/spritesheet.webp');
  assert.equal(sheet._status, 200, 'spritesheet served');
  assert.equal(sheet._headers['content-type'], 'image/webp');

  const mini = await req('/claude-pet-dsh/assets/svg/clawd-mini-idle.svg');
  assert.equal(mini._status, 200, 'mini svg served');
  assert.equal(mini._headers['content-type'], 'image/svg+xml');

  const icon = await req('/claude-pet-dsh/icon.png');
  assert.equal(icon._status, 200, 'icon served');

  const traversal = await req('/claude-pet-dsh/assets/..%2F..%2Fpackage.json');
  assert.equal(traversal._status, 404, 'path traversal blocked');

  const missing = await req('/claude-pet-dsh/nope');
  assert.equal(missing._status, 404);

  const ack = await req('/claude-pet-dsh/ack?session=sess-z', 'POST');
  assert.equal(ack._status, 200, 'ack route responds');
  assert.equal(JSON.parse(ack._body.toString()).cleared, false, 'unknown session -> cleared:false');

  console.log('http-routes OK');
  console.log('ALL CHECKS PASSED');
}
main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
