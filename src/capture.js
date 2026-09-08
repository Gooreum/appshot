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
  try {
    execFileSync('xcrun', ['simctl', 'io', target, 'screenshot', dest], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    const detail = err.stderr?.toString().trim().split('\n').pop() ?? err.message;
    throw new Error(`시뮬레이터 캡처에 실패했습니다: ${detail}`);
  }

  return { dest, device: udid ?? booted[0]?.name ?? 'booted' };
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
  const png = execFileSync(adb, [...args, 'exec-out', 'screencap', '-p'], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (!png?.length) {
    throw new Error('adb가 빈 이미지를 반환했습니다. 기기 화면이 꺼져 있는지 확인하세요.');
  }

  fs.writeFileSync(dest, png);
  return { dest, device: serial ?? devices[0] };
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
