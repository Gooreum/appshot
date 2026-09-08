import fs from 'node:fs';
import path from 'node:path';
import { DEVICES, PLATFORMS, getDevice } from './devices.js';
import { LAYOUT_IDS } from './layouts.js';

export const CONFIG_NAME = 'appshot.config.json';

/** 시스템 폰트만 쓴다 — 렌더가 네트워크에 의존하면 결과가 재현되지 않는다. */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', 'Segoe UI', Roboto, sans-serif";

export function defaultConfig({ platform = 'ios', device = 'iphone-17-pro-max' } = {}) {
  return {
    platform,
    device,
    locale: 'ko',
    output: './store-screenshots',
    theme: {
      background: {
        type: 'gradient',
        from: '#4F46E5',
        to: '#0EA5E9',
        angle: 160,
        noise: true,      // 그라디언트 밴딩 제거
        panorama: false,  // true면 배경이 여러 장에 걸쳐 이어진다
      },
      headline: { color: '#FFFFFF', size: 0.056, weight: 800 },
      subhead: { color: 'rgba(255,255,255,0.74)', size: 0.029, weight: 500 },
      fontStack: FONT_STACK,
    },
    screens: [
      {
        source: 'screens/01.png',
        layout: 'caption-top',
        headline: '3초 만에 기록',
        subhead: '복잡한 설정 없이 바로 시작하세요',
      },
      {
        source: 'screens/02.png',
        layout: 'caption-bottom',
        headline: '한눈에 보는 흐름',
        subhead: '쌓인 기록이 자동으로 정리됩니다',
      },
      {
        source: 'screens/03.png',
        layout: 'angled',
        headline: '어디서든 이어보기',
        subhead: '모든 기기에서 실시간으로 동기화',
      },
    ],
  };
}

/**
 * config를 검증하고 문제 목록을 반환한다.
 * 던지지 않고 모아서 반환하는 이유: 한 번에 전부 고칠 수 있어야 하기 때문.
 */
export function validateConfig(cfg) {
  const errors = [];
  const push = (m) => errors.push(m);

  if (!cfg || typeof cfg !== 'object') {
    return ['config가 객체가 아닙니다.'];
  }

  if (!Object.hasOwn(PLATFORMS, cfg.platform)) {
    push(`platform이 올바르지 않습니다: '${cfg.platform}' (사용 가능: ${Object.keys(PLATFORMS).join(', ')})`);
  }

  const device = DEVICES[cfg.device];
  if (!device) {
    push(`알 수 없는 device: '${cfg.device}' (사용 가능: ${Object.keys(DEVICES).join(', ')})`);
  } else if (cfg.platform && device.platform !== cfg.platform) {
    push(`device '${cfg.device}'는 ${device.platform} 기기인데 platform은 '${cfg.platform}'입니다.`);
  }

  if (typeof cfg.output !== 'string' || !cfg.output.trim()) {
    push('output이 비어 있습니다. 예: "./store-screenshots"');
  }
  if (typeof cfg.locale !== 'string' || !cfg.locale.trim()) {
    push('locale이 비어 있습니다. 예: "ko"');
  }

  if (!Array.isArray(cfg.screens)) {
    push('screens는 배열이어야 합니다.');
  } else if (cfg.screens.length === 0) {
    push('screens가 비어 있습니다. 최소 1개 이상의 스크린이 필요합니다.');
  } else {
    cfg.screens.forEach((s, i) => {
      const at = `screens[${i}]`;
      if (!s || typeof s !== 'object') {
        push(`${at}가 객체가 아닙니다.`);
        return;
      }
      if (typeof s.source !== 'string' || !s.source.trim()) {
        push(`${at}.source가 비어 있습니다. 앱 화면 PNG 경로를 지정하세요.`);
      }
      if (!LAYOUT_IDS.includes(s.layout)) {
        push(`${at}.layout이 올바르지 않습니다: '${s.layout}' (사용 가능: ${LAYOUT_IDS.join(', ')})`);
      }
      if (s.layout === 'duo' && (typeof s.source2 !== 'string' || !s.source2.trim())) {
        push(`${at}는 duo 레이아웃이므로 source2(두 번째 화면)도 필요합니다.`);
      }
      if (typeof s.headline !== 'string') {
        push(`${at}.headline이 문자열이 아닙니다.`);
      }
    });
  }

  const t = cfg.theme;
  if (!t || typeof t !== 'object') {
    push('theme이 없습니다.');
  } else {
    if (!t.background || typeof t.background !== 'object') push('theme.background가 없습니다.');
    if (!t.headline || typeof t.headline !== 'object') push('theme.headline이 없습니다.');
    if (!t.subhead || typeof t.subhead !== 'object') push('theme.subhead가 없습니다.');
  }

  return errors;
}

export function configPath(cwd = process.cwd()) {
  return path.join(cwd, CONFIG_NAME);
}

/** config를 읽어 파싱한다. 없거나 깨졌으면 다음에 뭘 하면 되는지 알려주는 Error를 던진다. */
export function loadConfig(cwd = process.cwd()) {
  const file = configPath(cwd);
  if (!fs.existsSync(file)) {
    throw new Error(
      `${CONFIG_NAME}을 찾을 수 없습니다: ${file}\n  'appshot init'으로 먼저 생성하세요.`,
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${CONFIG_NAME} 파싱 실패: ${err.message}`);
  }
  const errors = validateConfig(cfg);
  if (errors.length) {
    throw new Error(`${CONFIG_NAME}에 문제가 있습니다:\n  - ${errors.join('\n  - ')}`);
  }
  return cfg;
}

/**
 * 대상 프로젝트에 config와 screens/를 만든다.
 * 여기서 만드는 것은 이 둘뿐이다 — 의존성은 스킬 폴더에 격리되어 있다.
 */
export function scaffold(cwd, { platform, device, force = false } = {}) {
  const resolved = resolvePair({ platform, device });
  const file = configPath(cwd);

  if (fs.existsSync(file) && !force) {
    return { ok: false, reason: 'exists', file };
  }

  const cfg = defaultConfig(resolved);
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');

  const screensDir = path.join(cwd, 'screens');
  fs.mkdirSync(screensDir, { recursive: true });

  return { ok: true, file, screensDir, config: cfg, device: DEVICES[resolved.device] };
}

/**
 * platform/device 인자를 서로 모순 없게 정리한다.
 * device만 주면 platform은 그 기기에서 유도하고, platform만 주면 그 플랫폼의 필수 기기를 고른다.
 */
export function resolvePair({ platform, device }) {
  if (device) {
    const d = getDevice(device); // 미지원 id면 후보를 담아 throw
    if (platform && platform !== d.platform) {
      throw new Error(`device '${device}'는 ${d.platform} 기기인데 --platform ${platform}이 지정되었습니다.`);
    }
    return { platform: d.platform, device };
  }

  const p = platform ?? 'ios';
  if (!Object.hasOwn(PLATFORMS, p)) {
    throw new Error(`알 수 없는 플랫폼: '${p}' (사용 가능: ${Object.keys(PLATFORMS).join(', ')})`);
  }
  const entries = Object.entries(DEVICES).filter(([, d]) => d.platform === p);
  const pick = entries.find(([, d]) => d.required) ?? entries[0];
  return { platform: p, device: pick[0] };
}
