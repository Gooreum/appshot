import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 시뮬레이터/실기기에서 앱 화면을 캡처한다.
 *
 * 원칙: 도구가 없는 것(adb 미설치)은 실패가 아니다.
 * 사용자는 PNG를 screens/에 직접 넣어도 되므로, 안내만 하고 정상 종료한다.
 * 반대로 사용자가 바로 고칠 수 있는 상황(시뮬레이터 미실행)은 실패로 알린다.
 */

export function which(bin) {
  try {
    return execFileSync('which', [bin], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** PATH → ANDROID_HOME → SDK 기본 경로 순으로 adb를 찾는다. 없으면 null. */
export function resolveAdb() {
  const onPath = which('adb');
  if (onPath) return onPath;

  const candidates = [
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'),
    path.join(os.homedir(), 'Android/Sdk/platform-tools/adb'),
  ].filter(Boolean);

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** 부팅된 시뮬레이터 목록. 비어 있으면 캡처할 대상이 없다. */
export function bootedSimulators() {
  try {
    const json = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const { devices } = JSON.parse(json);
    return Object.values(devices)
      .flat()
      .filter((d) => d.state === 'Booted')
      .map((d) => ({ name: d.name, udid: d.udid }));
  } catch {
    return [];
  }
}

/** 연결된 Android 기기/에뮬레이터 목록. */
export function connectedAndroidDevices(adb) {
  try {
    const out = execFileSync(adb, ['devices'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l && l.endsWith('device'))
      .map((l) => l.split(/\s+/)[0]);
  } catch {
    return [];
  }
}

export class CaptureUnavailable extends Error {}

/** 명령을 실행하고 성공 여부만 돌려준다. 상태바 정리처럼 실패해도 캡처는 계속해야 하는 보조 작업용. */
function tryRun(bin, args) {
  try {
    execFileSync(bin, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

/*
 * 스토어 권장 상태바 — Google Play는 "배터리·와이파이·셀룰러 표시가 가득 차 있고
 * 알림이 없어야 한다"고 명시한다. iOS는 애플 마케팅 관례대로 9:41.
 * 배터리는 discharging 100% — charged로 두면 초록 번개 아이콘이 붙는다.
 */
const IOS_STATUS_BAR = [
  '--time', '9:41',
  '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
  '--cellularMode', 'active', '--cellularBars', '4',
  '--batteryState', 'discharging', '--batteryLevel', '100',
];

/** 시뮬레이터에 이미 걸린 상태바 오버라이드가 있는지. 사용자가 직접 걸어둔 값은 덮거나 지우지 않는다. */
function hasStatusBarOverride(target) {
  try {
    const out = execFileSync('xcrun', ['simctl', 'status_bar', target, 'list'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out.split('\n');
    const sep = lines.findIndex((l) => /^=+$/.test(l.trim()));
    return lines.slice(sep + 1).some((l) => l.trim());
  } catch {
    return false;
  }
}

/** iOS 시뮬레이터 캡처. 부팅된 기기가 없으면 사용자가 고칠 수 있는 실패로 던진다. */
export function captureIOS(dest, { udid } = {}) {
  if (process.platform !== 'darwin' || !which('xcrun')) {
    throw new CaptureUnavailable(
      'iOS 캡처는 Xcode가 설치된 macOS에서만 가능합니다.\n' +
        '  PNG를 screens/에 직접 넣어주세요.',
    );
  }

  const booted = bootedSimulators();
  if (!udid && booted.length === 0) {
    throw new Error(
      '부팅된 iOS 시뮬레이터가 없습니다.\n' +
        '  Xcode에서 시뮬레이터를 실행한 뒤 다시 시도하세요.\n' +
        "  예: xcrun simctl boot 'iPhone 17 Pro Max' && open -a Simulator",
    );
  }

  const target = udid ?? 'booted';

  // 'kept' = 사용자 오버라이드를 그대로 씀, 'cleaned' = 정리 후 원래대로 되돌림, false = 정리 못 함
  let statusBar = 'kept';
  if (!hasStatusBarOverride(target)) {
    statusBar = tryRun('xcrun', ['simctl', 'status_bar', target, 'override', ...IOS_STATUS_BAR]) && 'cleaned';
  }

  try {
    execFileSync('xcrun', ['simctl', 'io', target, 'screenshot', dest], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    const detail = err.stderr?.toString().trim().split('\n').pop() ?? err.message;
    throw new Error(`시뮬레이터 캡처에 실패했습니다: ${detail}`);
  } finally {
    if (statusBar === 'cleaned') tryRun('xcrun', ['simctl', 'status_bar', target, 'clear']);
  }

  return { dest, device: udid ?? booted[0]?.name ?? 'booted', statusBar };
}

/** Android 캡처. adb 자체가 없으면 CaptureUnavailable — 실패가 아니라 안내 대상이다. */
export function captureAndroid(dest, { serial } = {}) {
  const adb = resolveAdb();
  if (!adb) {
    throw new CaptureUnavailable(
      'adb를 찾을 수 없습니다.\n' +
        '  Android Studio(또는 platform-tools)를 설치하거나,\n' +
        '  기기에서 찍은 PNG를 screens/에 직접 넣어주세요.',
    );
  }

  const devices = connectedAndroidDevices(adb);
  if (!serial && devices.length === 0) {
    throw new Error(
      '연결된 Android 기기/에뮬레이터가 없습니다.\n' +
        '  USB 디버깅을 켜고 연결하거나 에뮬레이터를 실행한 뒤 다시 시도하세요.',
    );
  }

  const args = serial ? ['-s', serial] : [];
  const shell = (...cmd) => tryRun(adb, [...args, 'shell', ...cmd]);
  const demo = (command, ...extra) =>
    shell('am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', command, ...extra);

  // SystemUI demo mode로 상태바를 고정한다. 허용 설정은 원래 값을 기억했다가 되돌린다.
  const allowed = readGlobalSetting(adb, args, 'sysui_demo_allowed');
  if (allowed !== '1') shell('settings', 'put', 'global', 'sysui_demo_allowed', '1');
  const entered = demo('enter');
  const cleaned = entered && [
    demo('clock', '-e', 'hhmm', '1200'),
    demo('battery', '-e', 'level', '100', '-e', 'plugged', 'false'),
    demo('network', '-e', 'wifi', 'show', '-e', 'level', '4'),
    demo('network', '-e', 'mobile', 'show', '-e', 'datatype', 'none', '-e', 'level', '4'),
    demo('notifications', '-e', 'visible', 'false'),
  ].every(Boolean);
  if (entered) sleepSync(DEMO_SETTLE_MS);

  let png;
  try {
    png = execFileSync(adb, [...args, 'exec-out', 'screencap', '-p'], {
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    if (entered) demo('exit');
    if (allowed !== '1') {
      if (allowed === null || allowed === 'null') shell('settings', 'delete', 'global', 'sysui_demo_allowed');
      else shell('settings', 'put', 'global', 'sysui_demo_allowed', allowed);
    }
  }

  if (!png?.length) {
    throw new Error('adb가 빈 이미지를 반환했습니다. 기기 화면이 꺼져 있는지 확인하세요.');
  }

  fs.writeFileSync(dest, png);
  return { dest, device: serial ?? devices[0], statusBar: cleaned && 'cleaned' };
}

/** demo mode broadcast는 비동기다 — SystemUI가 상태바를 다시 그릴 때까지 기다린다. */
const DEMO_SETTLE_MS = 500;

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** adb shell settings get global <key>. 읽지 못하면 null. */
function readGlobalSetting(adb, args, key) {
  try {
    return execFileSync(adb, [...args, 'shell', 'settings', 'get', 'global', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * screens/ 안에서 아직 쓰이지 않은 다음 번호를 고른다.
 * 기존 캡처를 덮어쓰지 않는 것이 목적이다.
 */
export function nextScreenPath(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const used = new Set(fs.readdirSync(dir));
  for (let i = 1; i < 1000; i++) {
    const name = `${String(i).padStart(2, '0')}.png`;
    if (!used.has(name)) return path.join(dir, name);
  }
  throw new Error(`${dir}에 파일이 너무 많습니다.`);
}
