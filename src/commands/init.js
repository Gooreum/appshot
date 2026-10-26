import path from 'node:path';
import { scaffold, CONFIG_NAME } from '../config.js';
import { canvasLabel } from '../devices.js';
import { LAYOUTS } from '../layouts.js';

export async function run({ opts }) {
  const cwd = process.cwd();

  let result;
  try {
    result = scaffold(cwd, {
      platform: opts.platform,
      device: opts.device,
      devices: parseList(opts.devices, '--devices'),
      locales: parseList(opts.locales, '--locales'),
      force: opts.force,
    });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  if (!result.ok && result.reason === 'exists') {
    console.error(`이미 ${CONFIG_NAME}이 있습니다: ${result.file}`);
    console.error('  덮어쓰려면 --force를 붙이세요.');
    return 1;
  }

  const rel = (p) => path.relative(cwd, p) || '.';
  if (result.combos) return printMulti(result, rel);

  const { config: cfg, device } = result;

  console.log(`
${CONFIG_NAME} 생성 완료

  디바이스   ${device.label} (${cfg.device})
  제출 규격  ${canvasLabel(device)} — ${device.storeSlot}
  출력       ${cfg.output}/${cfg.locale}/${cfg.device}/

  다음 순서로 진행하세요:

    1. 앱 화면 PNG를 ${rel(result.screensDir)}/ 에 넣습니다
       (또는 'appshot capture --platform ${cfg.platform}' 로 자동 캡처)

    2. ${CONFIG_NAME}의 headline / subhead / layout을 고칩니다
       레이아웃: ${Object.keys(LAYOUTS).join(', ')}

    3. 'appshot render --preview' 로 빠르게 확인한 뒤
       'appshot render' 로 제출용 원본을 뽑습니다
`);
  return 0;
}

/** 'a,b' → ['a','b']. 값 없이 쓴 플래그(true)는 빈 배열로 넘겨 resolveTargets가 안내 에러를 내게 한다. */
export function parseList(v, flag) {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') return [];
  return v.split(',').map((x) => x.trim()).filter(Boolean);
}

const MAX_LISTED_DIRS = 8;

function printMulti(result, rel) {
  const { config: cfg, devices, combos, dirs, untranslated } = result;
  const width = Math.max(...devices.map((d) => d.label.length));
  const specs = devices
    .map((d) => `    ${d.label.padEnd(width)}  ${canvasLabel(d)} — ${d.storeSlot}`)
    .join('\n');
  const shown = dirs.slice(0, MAX_LISTED_DIRS).map((d) => `    ${rel(d)}/`);
  if (dirs.length > MAX_LISTED_DIRS) shown.push(`    … 외 ${dirs.length - MAX_LISTED_DIRS}개`);
  const [first] = combos;
  const copyNote = untranslated.length
    ? `\n       ${untranslated.join(', ')}: 번역 필요 — 지금은 en 문구가 들어 있습니다`
    : '';

  console.log(`
${CONFIG_NAME} 생성 완료

  플랫폼     ${cfg.platform}
  조합       ${cfg.locales.length} 로케일 × ${cfg.devices.length} 기기 = ${combos.length}개 조합
  출력       ${cfg.output}/{locale}/{device}/

  제출 규격:
${specs}

  화면 폴더:
${shown.join('\n')}

  다음 순서로 진행하세요:

    1. 각 폴더에 앱 화면 PNG(01.png, 02.png …)를 넣습니다
       (또는 'appshot capture --locale ${first.locale} --device ${first.device}' 로 해당 폴더에 캡처)

    2. ${CONFIG_NAME}의 headline / subhead 로케일 맵을 확인합니다${copyNote}
       레이아웃: ${Object.keys(LAYOUTS).join(', ')}

    3. 'appshot render --all --preview' 로 모든 조합을 빠르게 확인한 뒤
       'appshot render --all' 로 제출용 원본을 뽑습니다
       (--all 없이 render하면 첫 조합 하나만 렌더합니다)
`);
  return 0;
}
