import fs from 'node:fs';
import path from 'node:path';
import { captureIOS, captureAndroid, nextScreenPath, CaptureUnavailable } from '../capture.js';
import { configPath, CONFIG_NAME } from '../config.js';
import { PLATFORMS } from '../devices.js';

export async function run({ opts }) {
  const cwd = process.cwd();

  const platform = opts.platform ?? platformFromConfig(cwd);
  if (!platform) {
    console.error('플랫폼을 알 수 없습니다.');
    console.error(`  --platform ios|android 를 지정하거나, 'appshot init'으로 ${CONFIG_NAME}을 만드세요.`);
    return 1;
  }
  if (!Object.hasOwn(PLATFORMS, platform)) {
    console.error(`알 수 없는 플랫폼: '${platform}'`);
    console.error(`  사용 가능: ${Object.keys(PLATFORMS).join(', ')}`);
    return 1;
  }

  // macOS는 자동 캡처를 하지 않는다.
  // 시뮬레이터와 달리 "어느 창을 찍을지"는 사람만 아는 것이고,
  // 화면을 통째로 찍으면 열려 있던 다른 창의 내용이 스토어에 그대로 올라간다.
  // screens/를 만들기 전에 빠져나가야 빈 폴더가 남지 않는다.
  if (platform === 'macos') {
    console.log(`
  macOS는 자동 캡처를 지원하지 않습니다. 앱 창만 찍어 screens/에 넣으세요:

    screencapture -o -l <창 ID> screens/01.png

  -o는 창 그림자를 뺍니다 (appshot이 CSS로 그림자를 따로 줍니다).
  ⚠️ 화면 전체를 찍지 마세요 — 다른 창의 내용이 스토어에 그대로 올라갑니다.
`);
    return 0;
  }

  const dir = path.join(cwd, 'screens');
  const dest = opts.name
    ? path.join(dir, opts.name.endsWith('.png') ? opts.name : `${opts.name}.png`)
    : nextScreenPath(dir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  try {
    const { device, statusBar } = platform === 'ios'
      ? captureIOS(dest, { udid: opts.udid })
      : captureAndroid(dest, { serial: opts.serial });

    const { size } = fs.statSync(dest);
    console.log(`\n  캡처 완료 — ${path.relative(cwd, dest)}  (${(size / 1024).toFixed(0)}KB)`);
    console.log(`  기기: ${device}`);
    console.log(`  상태바: ${STATUS_BAR_NOTE[String(statusBar)] ?? STATUS_BAR_NOTE.false}\n`);
    return 0;
  } catch (err) {
    // 도구 자체가 없는 것은 실패가 아니다 — PNG를 직접 넣으면 된다
    if (err instanceof CaptureUnavailable) {
      console.log(`\n  ${err.message.split('\n').join('\n  ')}\n`);
      return 0;
    }
    console.error(`\n  ${err.message.split('\n').join('\n  ')}\n`);
    return 1;
  }
}

const STATUS_BAR_NOTE = {
  cleaned: '시간·신호·배터리를 가득 찬 상태로 정리해 찍고 원래대로 복구했습니다',
  kept: '시뮬레이터에 이미 걸린 상태바 설정을 그대로 사용했습니다',
  false: '상태바를 정리하지 못했습니다 — 알림·배터리 표시가 스토어 권장과 맞는지 확인하세요',
};

function platformFromConfig(cwd) {
  const file = configPath(cwd);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).platform ?? null;
  } catch {
    return null;
  }
}
