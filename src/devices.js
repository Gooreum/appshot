/**
 * 디바이스 카탈로그.
 *
 * 이 파일의 요점은 두 개념을 분리하는 것이다:
 *
 *   canvas — 스토어에 제출하는 이미지 규격. 1px이라도 틀리면 리젝된다.
 *   screen — 프레임 안에 들어갈 앱 화면의 기대 해상도. 소스 비율 검증에만 쓴다.
 *
 * 그래서 "Pixel 9"과 "Pixel 9 Pro XL"은 canvas가 같고(둘 다 Play Store 1080x1920)
 * frame 생김새만 다르다. 사용자가 고르는 것은 목업의 외형이지 제출 규격이 아니다.
 *
 * frame 수치는 전부 프레임 폭에 대한 비율이다. 어떤 canvas에서 렌더하든
 * 같은 비율로 그려지므로 규격이 바뀌어도 생김새가 유지된다.
 */

export const PLATFORMS = {
  ios: { label: 'Apple', store: 'App Store' },
  macos: { label: 'Mac', store: 'Mac App Store' },
  android: { label: 'Android', store: 'Google Play' },
};

export const DEVICES = {
  // ─── iOS ────────────────────────────────────────────────────────────────
  'iphone-17-pro-max': {
    label: 'iPhone 17 Pro Max',
    platform: 'ios',
    formFactor: 'phone',
    storeSlot: 'iPhone 6.9" 디스플레이',
    required: true, // App Store 제출 필수 슬롯
    canvas: { w: 1290, h: 2796 },
    screen: { w: 1290, h: 2796 },
    frame: {
      bezel: 0.021,
      radius: 0.115,
      innerRadius: 0.104,
      material: 'titanium',
      notch: { type: 'dynamic-island', w: 0.093, h: 0.028, top: 0.021 },
      buttons: ['action-left', 'volume-left', 'power-right'],
    },
  },

  // 기기 이름은 App Store Connect 규격 문서의 슬롯별 기기 목록을 따른다.
  // 6.5" 슬롯은 14 Plus·13 Pro Max 등 노치 세대이고, 16 Plus는 6.9" 슬롯이다.
  'iphone-14-plus': {
    label: 'iPhone 14 Plus',
    platform: 'ios',
    formFactor: 'phone',
    storeSlot: 'iPhone 6.5" 디스플레이',
    required: false,
    canvas: { w: 1284, h: 2778 },
    screen: { w: 1284, h: 2778 },
    frame: {
      bezel: 0.024,
      radius: 0.112,
      innerRadius: 0.100,
      material: 'aluminum',
      notch: { type: 'notch', w: 0.36, h: 0.072 },
      buttons: ['volume-left', 'power-right'],
    },
  },

  // 5.5" 슬롯은 8 Plus 세대다 (SE 3세대는 4.7" 슬롯)
  'iphone-8-plus': {
    label: 'iPhone 8 Plus',
    platform: 'ios',
    formFactor: 'phone',
    storeSlot: 'iPhone 5.5" 디스플레이',
    required: false,
    canvas: { w: 1242, h: 2208 },
    screen: { w: 1242, h: 2208 },
    frame: {
      bezel: 0.030,
      radius: 0.075,
      innerRadius: 0.006,
      material: 'aluminum',
      notch: { type: 'none' },
      // 홈버튼 세대: 위아래로 큰 베젤(chin)이 있고 하단에 홈버튼이 있다
      chin: { top: 0.145, bottom: 0.175, home: true, homeSize: 0.115 },
      buttons: ['volume-left', 'power-right'],
    },
  },

  'ipad-pro-13': {
    label: 'iPad Pro 13"',
    platform: 'ios',
    formFactor: 'tablet',
    storeSlot: 'iPad 13" 디스플레이',
    required: true, // iPad 앱이라면 필수 슬롯
    canvas: { w: 2064, h: 2752 },
    screen: { w: 2064, h: 2752 },
    frame: {
      bezel: 0.028,
      radius: 0.052,
      innerRadius: 0.030,
      material: 'aluminum',
      notch: { type: 'none' },
      buttons: ['power-top', 'volume-top'],
    },
  },

  'ipad-air-11': {
    label: 'iPad Air 11"',
    platform: 'ios',
    formFactor: 'tablet',
    storeSlot: 'iPad 11" 디스플레이',
    required: false,
    canvas: { w: 1668, h: 2388 },
    screen: { w: 1668, h: 2388 },
    frame: {
      bezel: 0.036,
      radius: 0.058,
      innerRadius: 0.030,
      material: 'aluminum',
      notch: { type: 'none' },
      buttons: ['power-top', 'volume-top'],
    },
  },

  // ─── macOS ──────────────────────────────────────────────────────────────
  // Mac App Store는 기기 슬롯이 아니라 **해상도**로 받는다
  // (1280×800 · 1440×900 · 2560×1600 · 2880×1800 — 전부 16:10).
  // 가장 큰 것만 올리면 나머지는 애플이 축소해서 쓰므로 기기 하나로 충분하다.
  //
  // 이 기기는 이 카탈로그에서 **유일한 가로 규격**이다. layouts.js가 isLandscape로
  // 갈라져 다른 치수를 쓴다 — 세로 값을 그대로 쓰면 폭이 상한에 걸려 카피 자리가 사라진다.
  //
  // frame을 채워 두긴 하지만 기본값은 프레임 없음이다(config.js의 deviceFrame).
  // Mac 스크린샷에 넣는 것은 바탕화면이 아니라 앱 **창**이고,
  // 창을 노트북 베젤 안에 넣으면 바탕화면이 없어 어색해진다.
  'mac-16-10': {
    label: 'Mac 16:10',
    platform: 'macos',
    formFactor: 'desktop',
    storeSlot: 'Mac 디스플레이 (2880×1800)',
    required: true, // Mac 앱이면 이 규격 하나는 반드시 올려야 한다
    canvas: { w: 2880, h: 1800 },
    screen: { w: 2880, h: 1800 },
    frame: {
      // 노트북 베젤이 아니라 macOS 앱 창으로 감싼다 (frame.js의 windowCSS)
      chrome: 'window',
      bezel: 0.011,
      radius: 0.016,
      innerRadius: 0.008,
      // 프레임 없이(deviceFrame:false) 창만 얹을 때의 모서리.
      // 기본값 0.05는 폰 카드용이라 1843px 렌더에서 92px이 되어
      // 실제 macOS 창(이 배율에서 약 17px)보다 5배 둥글었다.
      // 소스 캡처의 모서리 바깥이 투명이므로 그보다는 커야 검은 모서리가 안 보인다.
      plainRadius: 0.011,
      material: 'aluminum',
      notch: { type: 'none' },
      buttons: [],
    },
  },

  // ─── Android ────────────────────────────────────────────────────────────
  'pixel-9-pro-xl': {
    label: 'Pixel 9 Pro XL',
    platform: 'android',
    formFactor: 'phone',
    storeSlot: '휴대전화 스크린샷',
    required: true, // Play Store는 폰 스크린샷 최소 2장 필수
    canvas: { w: 1080, h: 1920 },
    screen: { w: 1008, h: 2244 },
    frame: {
      bezel: 0.019,
      radius: 0.098,
      innerRadius: 0.090,
      material: 'matte-black',
      notch: { type: 'punch-hole', d: 0.056, top: 0.017, x: 0.5 },
      buttons: ['power-right', 'volume-right'],
    },
  },

  'pixel-9': {
    label: 'Pixel 9',
    platform: 'android',
    formFactor: 'phone',
    storeSlot: '휴대전화 스크린샷',
    required: false,
    canvas: { w: 1080, h: 1920 },
    screen: { w: 1080, h: 2424 },
    frame: {
      bezel: 0.022,
      radius: 0.085,
      innerRadius: 0.076,
      material: 'matte-black',
      notch: { type: 'punch-hole', d: 0.060, top: 0.019, x: 0.5 },
      buttons: ['power-right', 'volume-right'],
    },
  },

  'galaxy-s25-ultra': {
    label: 'Galaxy S25 Ultra',
    platform: 'android',
    formFactor: 'phone',
    storeSlot: '휴대전화 스크린샷',
    required: false,
    canvas: { w: 1080, h: 1920 },
    screen: { w: 1440, h: 3120 },
    frame: {
      // Ultra는 코너가 각지고 베젤이 얇다 — 이 두 수치가 실루엣을 결정한다
      bezel: 0.014,
      radius: 0.038,
      innerRadius: 0.032,
      material: 'titanium',
      notch: { type: 'punch-hole', d: 0.048, top: 0.014, x: 0.5 },
      buttons: ['power-right', 'volume-right'],
    },
  },

  'galaxy-tab-s10': {
    label: 'Galaxy Tab S10',
    platform: 'android',
    formFactor: 'tablet',
    storeSlot: '10인치 태블릿 스크린샷',
    required: false,
    canvas: { w: 1440, h: 2560 }, // Play 대형 화면 가이드: 세로는 9:16, 1080~7680px
    screen: { w: 1848, h: 2960 },
    frame: {
      bezel: 0.033,
      radius: 0.045,
      innerRadius: 0.028,
      material: 'matte-black',
      notch: { type: 'none' },
      buttons: ['power-top', 'volume-top'],
    },
  },
};

/** 해당 플랫폼의 디바이스를 [id, device] 쌍 배열로 반환한다. */
export function listByPlatform(platform) {
  return Object.entries(DEVICES).filter(([, d]) => d.platform === platform);
}

/** 디바이스를 id로 조회한다. 없으면 후보를 담은 Error를 던진다. */
export function getDevice(id) {
  const device = DEVICES[id];
  if (device) return device;

  const ids = Object.keys(DEVICES);
  const near = ids.filter((k) => id && (k.includes(id) || id.includes(k.split('-')[0])));
  const suggestions = (near.length ? near : ids).join(', ');
  throw new Error(
    `알 수 없는 디바이스: '${id}'\n  사용 가능: ${suggestions}\n  전체 목록은 'appshot devices'로 확인하세요.`,
  );
}

/** 캔버스 규격을 사람이 읽는 문자열로. */
export const canvasLabel = (d) => `${d.canvas.w}×${d.canvas.h}`;

/**
 * 가로 규격인가.
 *
 * 새 필드를 두지 않고 캔버스에서 유도한다 — 기기를 추가할 때 손댈 곳이 하나 줄고,
 * 선언한 방향과 실제 캔버스가 어긋날 일이 없다. 폰·태블릿 9종은 전부 w < h다.
 */
export const isLandscape = (d) => d.canvas.w > d.canvas.h;

/** 세로/가로 비율 (h/w). 소스 이미지 비율 검증에 쓴다. */
export const screenRatio = (d) => d.screen.h / d.screen.w;
