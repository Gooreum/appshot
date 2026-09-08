import path from 'node:path';
import { scaffold, CONFIG_NAME } from '../config.js';
import { canvasLabel } from '../devices.js';
import { LAYOUTS } from '../layouts.js';

export async function run({ opts }) {
  const cwd = process.cwd();

  let result;
  try {
    result = scaffold(cwd, { platform: opts.platform, device: opts.device, force: opts.force });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  if (!result.ok && result.reason === 'exists') {
    console.error(`이미 ${CONFIG_NAME}이 있습니다: ${result.file}`);
    console.error('  덮어쓰려면 --force를 붙이세요.');
    return 1;
  }

  const { config: cfg, device } = result;
  const rel = (p) => path.relative(cwd, p) || '.';

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
