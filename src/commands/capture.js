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

  const dir = path.join(cwd, 'screens');
  const dest = opts.name
    ? path.join(dir, opts.name.endsWith('.png') ? opts.name : `${opts.name}.png`)
    : nextScreenPath(dir);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  try {
    const { device } = platform === 'ios'
      ? captureIOS(dest, { udid: opts.udid })
      : captureAndroid(dest, { serial: opts.serial });

    const { size } = fs.statSync(dest);
    console.log(`\n  캡처 완료 — ${path.relative(cwd, dest)}  (${(size / 1024).toFixed(0)}KB)`);
    console.log(`  기기: ${device}\n`);
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

function platformFromConfig(cwd) {
  const file = configPath(cwd);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).platform ?? null;
  } catch {
    return null;
  }
}
