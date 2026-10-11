import fs from 'node:fs';
import path from 'node:path';
import { DEVICES, PLATFORMS, getDevice } from './devices.js';
import { LAYOUT_IDS } from './layouts.js';

export const CONFIG_NAME = 'appshot.config.json';

/** theme.fontFile로 받는 폰트 파일 확장자. 브라우저가 data URI로 바로 읽는 형식만. */
export const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2'];

/** theme.fontFile을 [{ path, weight }] 로 정규화한다. 문자열이면 weight 없는 항목 1개. */
export function normalizeFontFiles(fontFile) {
  if (fontFile === undefined || fontFile === null) return [];
  if (typeof fontFile === 'string') return [{ path: fontFile, weight: null }];
  return Array.isArray(fontFile) ? fontFile.map((e) => ({ path: e?.path, weight: e?.weight ?? null })) : [];
}

/** 시스템 폰트만 쓴다 — 렌더가 네트워크에 의존하면 결과가 재현되지 않는다. */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo', 'Segoe UI', Roboto, sans-serif";

/**
 * 플랫폼(과 선택적으로 기기)에 맞는 기본 config.
 *
 * 기기 기본값을 'iphone-17-pro-max'로 **고정하지 않는다.** 그러면
 * `defaultConfig({ platform: 'android' })`가 android + iPhone이라는 짝이 안 맞는
 * config를 만들고, validateConfig가 바로 걸러 내는 값이 된다.
 * 지금까지는 호출자(scaffold)가 먼저 resolvePair를 거쳐서 드러나지 않았을 뿐이다.
 * macOS를 더하면서 e2e가 이걸 잡았다.
 */
export function defaultConfig(opts = {}) {
  const { platform, device } = resolvePair(opts);
  return {
    platform,
    device,
    locale: 'ko',
    output: './store-screenshots',
    theme: {
      background: {
        type: 'gradient',
        from: '#4F46E5',
        to: '#0E7490',   // 더 밝은 시안(#0EA5E9)은 흰 글씨 대비가 2.75:1로 기준 미달
        angle: 160,
        noise: true,      // 그라디언트 밴딩 제거
        panorama: false,  // true면 배경이 여러 장에 걸쳐 이어진다
      },
      headline: { color: '#FFFFFF', size: 0.056, weight: 800 },
      subhead: { color: 'rgba(255,255,255,0.86)', size: 0.029, weight: 500 },
      fontStack: FONT_STACK,
      // Google Play는 폰 스크린샷에 기기 이미지를 피하라고 권장한다 (App Store는 허용).
      // macOS는 노트북 베젤이 아니라 앱 **창**(신호등 있는 macOS 창)으로 감싼다 —
      // 바탕화면이 필요 없고, 창 캡처 비율이 제각각이어도 창이 그 비율을 따라간다.
      deviceFrame: platform !== 'android',
    },
    // Play 추천 영역에 노출되려면 스크린샷이 4장 이상이어야 한다
    // 호출마다 새 객체 — 반환된 config를 고쳐도 다음 기본값에 번지지 않게
    screens: (platform === 'android' ? [...BASE_SCREENS, ANDROID_EXTRA_SCREEN] : BASE_SCREENS)
      .map((s) => ({ ...s })),
  };
}

const BASE_SCREENS = [
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
];

const ANDROID_EXTRA_SCREEN = {
  source: 'screens/04.png',
  layout: 'fullbleed',
  headline: '오늘부터 가볍게',
  subhead: '기록은 짧게, 정리는 자동으로',
};

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

  // devices 배열이 있으면 device는 선택 항목이 되고(있으면 배열 안에 있어야 한다), 각 id를 검사한다
  const devices = cfg.devices === undefined ? null : checkIdList(cfg.devices, 'devices', push);
  if (devices) {
    for (const id of devices) {
      const d = DEVICES[id];
      if (!d) push(`devices에 알 수 없는 기기가 있습니다: '${id}' (사용 가능: ${Object.keys(DEVICES).join(', ')})`);
      else if (cfg.platform && d.platform !== cfg.platform) push(`devices의 '${id}'는 ${d.platform} 기기인데 platform은 '${cfg.platform}'입니다.`);
    }
    if (cfg.device !== undefined && !devices.includes(cfg.device)) push(`device '${cfg.device}'가 devices 배열에 없습니다.`);
  } else {
    const device = DEVICES[cfg.device];
    if (!device) {
      push(`알 수 없는 device: '${cfg.device}' (사용 가능: ${Object.keys(DEVICES).join(', ')})`);
    } else if (cfg.platform && device.platform !== cfg.platform) {
      push(`device '${cfg.device}'는 ${device.platform} 기기인데 platform은 '${cfg.platform}'입니다.`);
    }
  }

  if (typeof cfg.output !== 'string' || !cfg.output.trim()) {
    push('output이 비어 있습니다. 예: "./store-screenshots"');
  }
  const locales = cfg.locales === undefined ? null : checkIdList(cfg.locales, 'locales', push);
  if (locales) {
    if (cfg.locale !== undefined && !locales.includes(cfg.locale)) push(`locale '${cfg.locale}'이 locales 배열에 없습니다.`);
  } else if (typeof cfg.locale !== 'string' || !cfg.locale.trim()) {
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
      if (!isCopy(s.headline)) {
        push(`${at}.headline은 문자열이거나 로케일별 맵({ "ko": "...", "en": "..." })이어야 합니다.`);
      }
      if (s.subhead !== undefined && !isCopy(s.subhead)) {
        push(`${at}.subhead는 문자열이거나 로케일별 맵이어야 합니다.`);
      }
    });
  }

  const t = cfg.theme;
  if (!t || typeof t !== 'object') {
    push('theme이 없습니다.');
  } else {
    if (!t.background || typeof t.background !== 'object') push('theme.background가 없습니다.');
    else if (t.background.type === 'image') {
      if (typeof t.background.source !== 'string' || !t.background.source.trim()) {
        push('theme.background.type이 image면 source(배경 이미지 경로)가 필요합니다.');
      }
      if (t.background.fit !== undefined && !['cover', 'contain'].includes(t.background.fit)) {
        push("theme.background.fit은 'cover' 또는 'contain'이어야 합니다.");
      }
      const o = t.background.overlay;
      if (o !== undefined && (typeof o !== 'number' || Number.isNaN(o) || o < 0 || o > 1)) {
        push('theme.background.overlay는 0~1 사이 숫자여야 합니다.');
      }
    }
    if (!t.headline || typeof t.headline !== 'object') push('theme.headline이 없습니다.');
    if (!t.subhead || typeof t.subhead !== 'object') push('theme.subhead가 없습니다.');
    if (t.allowDeviceCrop !== undefined && typeof t.allowDeviceCrop !== 'boolean') {
      push('theme.allowDeviceCrop은 true/false여야 합니다.');
    }
    if (t.deviceFrame !== undefined && typeof t.deviceFrame !== 'boolean') {
      push('theme.deviceFrame은 true/false여야 합니다.');
    }
    if (t.fontFile !== undefined) validateFontFile(t.fontFile, push);
  }

  return errors;
}

/** 비어 있지 않은 문자열 배열, 중복 없음. 통과하면 배열을, 아니면 에러를 남기고 null을 돌려준다. */
function checkIdList(v, name, push) {
  if (!Array.isArray(v)) { push(`${name}는 문자열 배열이어야 합니다.`); return null; }
  if (v.length === 0) { push(`${name}가 빈 배열입니다. 배열을 지우거나 값을 넣으세요.`); return null; }
  if (v.some((x) => typeof x !== 'string' || !x.trim())) { push(`${name}에 빈 값이 있습니다.`); return null; }
  if (new Set(v).size !== v.length) { push(`${name}에 중복 값이 있습니다: ${v.join(', ')}`); return null; }
  return v;
}

/** 카피 값: 문자열, 또는 값이 전부 문자열인 로케일 맵 */
const isCopy = (v) =>
  typeof v === 'string' ||
  (Boolean(v) && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).length > 0 && Object.values(v).every((x) => typeof x === 'string'));

/**
 * theme.fontFile 형태 검사 — 문자열(경로) 또는 { path, weight }[].
 * 파일 존재 여부는 여기서 보지 않는다. validateConfig는 cwd 없이 도는 순수 함수이고,
 * 이미지와 마찬가지로 파일 확인은 render.js가 맡는다.
 */
function validateFontFile(v, push) {
  const at = 'theme.fontFile';
  if (typeof v === 'string') {
    if (!v.trim()) return push(`${at}이 비어 있습니다. 폰트 파일 경로를 지정하세요.`);
    return checkFontExt(v, at, push);
  }
  if (!Array.isArray(v)) return push(`${at}은 문자열(경로) 또는 { path, weight } 배열이어야 합니다.`);
  if (v.length === 0) return push(`${at}이 빈 배열입니다.`);
  const seen = new Set();
  v.forEach((e, i) => {
    const ei = `${at}[${i}]`;
    if (!e || typeof e !== 'object') return push(`${ei}가 객체가 아닙니다. 예: { "path": "fonts/Brand.ttf", "weight": 700 }`);
    if (typeof e.path !== 'string' || !e.path.trim()) push(`${ei}.path가 비어 있습니다.`);
    else checkFontExt(e.path, `${ei}.path`, push);
    if (!Number.isInteger(e.weight) || e.weight < 1 || e.weight > 1000) push(`${ei}.weight는 1~1000 사이 정수여야 합니다.`);
    else if (seen.has(e.weight)) push(`${at}에 weight ${e.weight}이 중복됩니다.`);
    else seen.add(e.weight);
  });
}

function checkFontExt(p, at, push) {
  const ext = path.extname(p).toLowerCase();
  if (!FONT_EXTS.includes(ext)) push(`${at} 확장자가 지원되지 않습니다: '${p}' (사용 가능: ${FONT_EXTS.join(', ')})`);
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
