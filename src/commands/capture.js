import fs from 'node:fs';
import path from 'node:path';
import { captureIOS, captureAndroid, captureMac, nextScreenPath, CaptureUnavailable } from '../capture.js';
import { configPath, CONFIG_NAME, LOCALE_ID } from '../config.js';
import { DEVICES, PLATFORMS, getDevice } from '../devices.js';
import { listCombos } from '../expand.js';

export async function run({ opts }) {
  const cwd = process.cwd();

  const cfg = readConfigLoose(cwd);

  let target;
  try {
    target = resolveCaptureDir(cwd, cfg, { locale: opts.locale, device: opts.device });
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  const devicePlatform = target.device ? DEVICES[target.device].platform : null;
  if (opts.platform && devicePlatform && opts.platform !== devicePlatform) {
    console.error(`device '${target.device}'는 ${devicePlatform} 기기인데 --platform ${opts.platform}이 지정되었습니다.`);
    return 1;
  }

  const platform = opts.platform ?? cfg?.platform ?? devicePlatform;
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

  const { dir } = target;
  // 경로 부분은 버린다 — 캡처는 screens/ 밖으로 나가지 않는다
  const name = typeof opts.name === 'string' ? path.basename(opts.name.trim()) : null;
  if (opts.name !== undefined && !name) {
    console.error('--name에는 파일명을 지정하세요.');
    return 1;
  }
  const dest = name
    ? path.join(dir, name.endsWith('.png') ? name : `${name}.png`)
    : nextScreenPath(dir);
  if (name && fs.existsSync(dest) && !opts.force) {
    console.error(`이미 있습니다: ${path.relative(cwd, dest)} (--force로 덮어쓰기)`);
    return 1;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  try {
    const { device, statusBar } = platform === 'ios'
      ? captureIOS(dest, { udid: opts.udid })
      : platform === 'macos'
        ? captureMac(dest, { onPrompt: () => console.log('\n  찍을 창을 클릭하세요… (esc로 취소)') })
        : captureAndroid(dest, { serial: opts.serial });

    const { size } = fs.statSync(dest);
    console.log(`\n  캡처 완료 — ${path.relative(cwd, dest)}  (${(size / 1024).toFixed(0)}KB)`);
    console.log(`  기기: ${device}`);
    // 창 캡처(statusBar null)에는 메뉴바가 없어서 정리할 상태바가 없다
    if (statusBar !== null) {
      console.log(`  상태바: ${STATUS_BAR_NOTE[String(statusBar)] ?? STATUS_BAR_NOTE.false}`);
    }
    console.log('');
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

/**
 * 저장 폴더를 정한다. --locale/--device가 없으면 screens/, 있으면 init이 만드는 규약 screens/<locale>/<device>/.
 * config가 있으면 그 locales·devices 안의 값만 받고, 빠진 축은 값이 하나뿐일 때 그것으로 채운다.
 * 돌려주는 locale/device는 평면 폴더일 때 null.
 */
export function resolveCaptureDir(cwd, cfg, { locale, device } = {}) {
  if (locale === undefined && device === undefined) return { dir: path.join(cwd, 'screens'), locale: null, device: null };

  const combos = cfg && typeof cfg === 'object' ? listCombos(cfg) : [];
  const options = (key) => [...new Set(combos.map((c) => c[key]).filter((v) => typeof v === 'string'))];
  const pick = (value, key, flag) => {
    if (value !== undefined && typeof value !== 'string') throw new Error(`${flag}에 값을 지정하세요.`);
    const allowed = options(key);
    if (value !== undefined) {
      if (allowed.length && !allowed.includes(value)) {
        throw new Error(`${flag} '${value}'는 ${CONFIG_NAME}에 없습니다 (사용 가능: ${allowed.join(', ')})`);
      }
      return value;
    }
    if (allowed.length === 1) return allowed[0];
    throw new Error(allowed.length
      ? `${flag}를 지정하세요 (${allowed.join(', ')})`
      : `${flag}도 지정하세요 — ${CONFIG_NAME}에서 정할 수 없습니다.`);
  };

  const l = pick(locale, 'locale', '--locale');
  const d = pick(device, 'device', '--device');
  // 둘 다 경로 조각이 된다 — config에서 채운 값도 같이 검사한다
  if (!LOCALE_ID.test(l)) throw new Error(`로케일 '${l}'에 쓸 수 없는 문자가 있습니다. 영문·숫자·-·_만 씁니다.`);
  getDevice(d); // 미지원 id면 후보를 담아 throw
  return { dir: path.join(cwd, 'screens', l, d), locale: l, device: d };
}

/** capture는 깨진 config에서도 돌아야 한다 — 검증 없이 JSON만 읽는다. */
function readConfigLoose(cwd) {
  const file = configPath(cwd);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
