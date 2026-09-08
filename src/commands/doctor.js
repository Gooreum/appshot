import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_ROOT } from '../paths.js';

const OK = '✓';
const NO = '✗';

function row(ok, label, detail, hint) {
  const mark = ok ? OK : NO;
  const line = `  ${mark}  ${label.padEnd(20)}${detail}`;
  return hint && !ok ? `${line}\n${' '.repeat(28)}→ ${hint}` : line;
}

function which(bin) {
  try {
    return execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** PATH → Android SDK 기본 경로 순으로 adb를 찾는다. */
export function resolveAdb() {
  const onPath = which('adb');
  if (onPath) return onPath;
  const candidates = [
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'),
    path.join(os.homedir(), 'Android/Sdk/platform-tools/adb'),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

export async function run() {
  const lines = [];
  let issues = 0;
  const fail = () => { issues++; };

  // 1) Node
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  const nodeOk = major >= 18;
  if (!nodeOk) fail();
  lines.push(row(nodeOk, 'Node.js', `v${process.versions.node}`, 'Node 18 이상이 필요합니다'));

  // 2) Playwright 모듈
  let chromium = null;
  let pwVersion = null;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    pwVersion = require('playwright/package.json').version;
    lines.push(row(true, 'Playwright', `v${pwVersion}`));
  } catch {
    fail();
    lines.push(row(false, 'Playwright', 'not installed', `cd ${SKILL_ROOT} && npm install`));
  }

  // 3) Chromium 바이너리
  if (chromium) {
    let exe = null;
    try {
      exe = chromium.executablePath();
    } catch {
      exe = null;
    }
    const hasChromium = Boolean(exe) && existsSync(exe);
    if (!hasChromium) fail();
    lines.push(
      row(hasChromium, 'Chromium binary', hasChromium ? shorten(exe) : 'not downloaded',
        `cd ${SKILL_ROOT} && npx playwright install chromium`),
    );
  } else {
    lines.push(row(false, 'Chromium binary', 'skipped (playwright 없음)'));
  }

  // 4) iOS 시뮬레이터 캡처 (선택 기능)
  const hasSimctl = process.platform === 'darwin' && Boolean(which('xcrun'));
  lines.push(row(hasSimctl, 'xcrun simctl', hasSimctl ? 'available' : 'not available',
    'iOS 자동 캡처만 불가 — PNG를 screens/에 직접 넣으면 됩니다'));

  // 5) Android 캡처 (선택 기능)
  const adb = resolveAdb();
  lines.push(row(Boolean(adb), 'adb (Android)', adb ? shorten(adb) : 'not found',
    'Android 자동 캡처만 불가 — PNG를 screens/에 직접 넣으면 됩니다'));

  console.log('\nappshot doctor\n');
  console.log(lines.join('\n'));
  console.log(`\n  skill root: ${SKILL_ROOT}`);
  console.log(`  project   : ${process.cwd()}\n`);

  if (issues === 0) {
    console.log('렌더링 준비 완료.\n');
  } else {
    console.log(`${issues}건은 렌더링에 필요합니다. 위 → 안내를 따라 해결하세요.`);
    console.log('(simctl/adb는 자동 캡처용 선택 항목이라 위 집계에 포함되지 않습니다.)\n');
  }
  return 0; // doctor는 진단 도구 — 항목이 빠져도 성공 종료
}

const shorten = (p) => (p.length > 44 ? `…${p.slice(-43)}` : p);
