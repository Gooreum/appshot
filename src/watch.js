import fs from 'node:fs';
import path from 'node:path';
import { configPath, normalizeFontFiles } from './config.js';

/**
 * render --watch가 감시할 파일 — config 자체와 config가 참조하는 파일 전부(절대경로, 중복 제거).
 * cfg는 expandConfig로 펼친 단일 config다({locale}·{device} 토큰이 이미 치환된 경로).
 * screens/ 폴더 전체가 아니라 참조된 파일만 본다 — config에 없는 새 파일은 렌더 결과와 무관하다.
 */
export function watchTargets(cfg, cwd) {
  const rel = [];
  for (const s of cfg.screens ?? []) {
    rel.push(s.source);
    if (s.source2) rel.push(s.source2);
  }
  const bg = cfg.theme?.background;
  if (bg?.type === 'image' && bg.source) rel.push(bg.source);
  for (const f of normalizeFontFiles(cfg.theme?.fontFile)) rel.push(f.path);
  if (cfg.featureGraphic?.source) rel.push(cfg.featureGraphic.source);

  const files = [configPath(cwd), ...rel.filter((p) => typeof p === 'string' && p).map((p) => path.resolve(cwd, p))];
  return [...new Set(files)];
}

/**
 * 파일 목록을 감시한다. 파일이 아니라 부모 디렉터리를 fs.watch(non-recursive)로 보고 basename으로 거른다:
 * - 에디터의 atomic save(임시 파일 → rename)로 inode가 바뀌어도 감시가 끊기지 않는다
 * - 아직 없는 파일(곧 캡처할 화면)이 생겨도 잡힌다
 * - Node 18 Linux의 recursive watch 미지원을 피한다
 * 부모 디렉터리가 없는 항목은 건너뛰고 skipped로 돌려준다.
 */
export function createWatcher(files, onChange, { watch = fs.watch } = {}) {
  const byDir = new Map();
  for (const file of files) {
    const dir = path.dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, new Set());
    byDir.get(dir).add(path.basename(file));
  }

  const watchers = [];
  const skipped = [];
  for (const [dir, names] of byDir) {
    let w;
    try {
      w = watch(dir, { persistent: true }, (_event, filename) => {
        // filename을 못 주는 플랫폼도 있다 — 그때는 어떤 대상이 바뀌었는지 몰라도 다시 렌더한다
        const name = filename ? path.basename(String(filename)) : null;
        if (name === null || names.has(name)) onChange(name ? path.join(dir, name) : dir);
      });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        skipped.push(dir);
        continue;
      }
      throw err;
    }
    // 감시 중 폴더가 지워지면 그 폴더만 놓친다 — 프로세스를 죽이지 않는다
    w.on?.('error', () => {});
    watchers.push(w);
  }

  return {
    skipped,
    close() {
      for (const w of watchers) w.close();
    },
  };
}

/**
 * 디바운스 + 직렬 실행. trigger가 연달아 오면 debounceMs 뒤 한 번만 task를 부른다.
 * task가 도는 중에 온 trigger는 쌓아 두었다가 끝난 뒤 정확히 한 번 더 부른다(렌더가 겹치지 않는다).
 * task에는 그동안 모인 reason 목록(중복 제거)을 넘긴다. task 예외는 삼킨다 — 호출자가 직접 출력한다.
 */
export function createRunner(task, { debounceMs = 200, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  let running = null; // 진행 중인 task Promise
  let pending = new Set();
  let closed = false;

  const fire = () => {
    timer = null;
    if (running || closed) return; // 끝나면 finally에서 다시 잡는다
    const reasons = [...pending];
    pending = new Set();
    running = Promise.resolve()
      .then(() => task(reasons))
      .catch(() => {})
      .finally(() => {
        running = null;
        if (pending.size && !closed) schedule();
      });
  };

  const schedule = () => {
    if (timer) clearTimer(timer);
    timer = setTimer(fire, debounceMs);
  };

  return {
    trigger(reason) {
      if (closed) return;
      pending.add(reason);
      schedule();
    },
    /** 진행 중인 task가 끝날 때까지 기다린다(없으면 바로) */
    idle() {
      return running ?? Promise.resolve();
    },
    /** 예약된 실행을 취소하고 더 받지 않는다. 진행 중인 task는 idle()로 기다린다 */
    close() {
      closed = true;
      if (timer) clearTimer(timer);
      timer = null;
    },
  };
}
