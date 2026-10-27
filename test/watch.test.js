import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watchTargets, createWatcher, createRunner } from '../src/watch.js';

const cwd = '/proj';
const base = {
  screens: [
    { source: 'screens/01.png', layout: 'caption-top' },
    { source: 'screens/02.png', source2: 'screens/02b.png', layout: 'duo' },
    { source: 'screens/01.png', layout: 'caption-top' },
  ],
  theme: {},
};

test('watchTargets — config와 참조 파일 전부를 절대경로로, 중복 없이', () => {
  const cfg = {
    ...base,
    theme: {
      background: { type: 'image', source: 'assets/bg.png' },
      fontFile: [{ path: 'fonts/a.ttf', weight: 400 }, { path: 'fonts/b.ttf', weight: 700 }],
    },
    featureGraphic: { headline: 'x', source: 'screens/fg.png' },
  };
  assert.deepEqual(watchTargets(cfg, cwd), [
    '/proj/appshot.config.json',
    '/proj/screens/01.png',
    '/proj/screens/02.png',
    '/proj/screens/02b.png',
    '/proj/assets/bg.png',
    '/proj/fonts/a.ttf',
    '/proj/fonts/b.ttf',
    '/proj/screens/fg.png',
  ]);
});

test('watchTargets — fontFile 문자열도 받고, 그라디언트 배경은 빠진다', () => {
  const cfg = { ...base, theme: { background: { type: 'gradient', source: 'assets/bg.png' }, fontFile: 'fonts/a.otf' } };
  const files = watchTargets(cfg, cwd);
  assert.ok(files.includes('/proj/fonts/a.otf'));
  assert.ok(!files.includes('/proj/assets/bg.png'));
});

/** 손으로 돌리는 가짜 타이머 */
function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return {
    setTimer: (fn) => { timers.set(++id, fn); return id; },
    clearTimer: (t) => timers.delete(t),
    flush() {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
    get size() { return timers.size; },
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('createRunner — 연속 trigger는 디바운스로 한 번만 실행된다', async () => {
  const t = fakeTimers();
  const calls = [];
  const runner = createRunner((reasons) => { calls.push(reasons); }, t);
  runner.trigger('a');
  runner.trigger('b');
  runner.trigger('a');
  assert.equal(t.size, 1);
  t.flush();
  await runner.idle();
  assert.deepEqual(calls, [['a', 'b']]);
});

test('createRunner — 실행 중에 온 trigger는 끝난 뒤 정확히 한 번 더 실행된다', async () => {
  const t = fakeTimers();
  const calls = [];
  let release;
  const runner = createRunner((reasons) => {
    calls.push(reasons);
    if (calls.length === 1) return new Promise((r) => { release = r; });
  }, t);
  runner.trigger('a');
  t.flush();
  await tick();
  runner.trigger('b');
  runner.trigger('c');
  t.flush(); // 실행 중이라 겹쳐 돌지 않는다
  t.flush();
  assert.equal(calls.length, 1);
  release();
  await runner.idle();
  await tick();
  t.flush();
  await runner.idle();
  assert.deepEqual(calls, [['a'], ['b', 'c']]);
  assert.equal(t.size, 0);
});

test('createRunner — task 예외 뒤에도 다음 trigger가 동작한다', async () => {
  const t = fakeTimers();
  let n = 0;
  const runner = createRunner(() => { n++; if (n === 1) throw new Error('boom'); }, t);
  runner.trigger('a');
  t.flush();
  await runner.idle();
  runner.trigger('b');
  t.flush();
  await runner.idle();
  assert.equal(n, 2);
});

test('createRunner — close 뒤에는 예약된 실행도 새 trigger도 무시한다', async () => {
  const t = fakeTimers();
  let n = 0;
  const runner = createRunner(() => { n++; }, t);
  runner.trigger('a');
  runner.close();
  runner.trigger('b');
  t.flush();
  await runner.idle();
  assert.equal(n, 0);
});

test('createWatcher — 대상 basename만 반응하고, 없는 폴더는 skipped로 돌려준다', () => {
  const handlers = new Map();
  const watch = (dir, _opts, fn) => { handlers.set(dir, fn); return { close() {}, on() {} }; };
  const seen = [];
  const w = createWatcher(['/proj/appshot.config.json', '/proj/screens/01.png'], (f) => seen.push(f), {
    watch: (dir, o, fn) => {
      if (dir === '/proj/screens') throw Object.assign(new Error('nope'), { code: 'ENOENT' });
      return watch(dir, o, fn);
    },
  });
  assert.deepEqual(w.skipped, ['/proj/screens']);
  handlers.get('/proj')('change', 'appshot.config.json');
  handlers.get('/proj')('rename', '.appshot.config.json.swp');
  assert.deepEqual(seen, ['/proj/appshot.config.json']);
});

test('createWatcher — 실제 fs에서 수정·atomic rename·새 파일 생성을 잡는다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appshot-watch-'));
  const a = path.join(dir, 'a.json');
  const b = path.join(dir, 'b.png');
  fs.writeFileSync(a, '1');
  const seen = new Set();
  const w = createWatcher([a, b], (f) => seen.add(path.basename(f)));
  const waitFor = async (name) => {
    for (let i = 0; i < 50 && !seen.has(name); i++) await new Promise((r) => setTimeout(r, 20));
    return seen.has(name);
  };
  try {
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(a, '2');
    assert.ok(await waitFor('a.json'), '수정');
    seen.clear();
    fs.writeFileSync(path.join(dir, 'a.json.tmp'), '3');
    fs.renameSync(path.join(dir, 'a.json.tmp'), a);
    assert.ok(await waitFor('a.json'), 'atomic rename');
    fs.writeFileSync(b, 'x');
    assert.ok(await waitFor('b.png'), '새 파일');
    assert.ok(!seen.has('a.json.tmp'));
  } finally {
    w.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
