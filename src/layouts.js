import { isLandscape } from './devices.js';

/**
 * 레이아웃 카탈로그.
 *
 * 스토어 상위권 앱들의 스크린샷은 결국 이 5개 구성으로 수렴한다.
 * 사용자는 스크린마다 다른 레이아웃을 고를 수 있다 — 5장을 전부
 * 같은 구성으로 만들면 스크롤할 때 단조롭기 때문이다.
 *
 * 파노라마(배경이 여러 장에 걸쳐 이어지는 구성)는 레이아웃이 아니라
 * 배경 옵션(theme.background.panorama)이다. 그래야 5개 레이아웃
 * 어느 것과도 조합된다.
 */

/**
 * 프레임 크기는 폭이 아니라 **세로**를 기준으로 정한다.
 *
 * 폭 비율을 고정하면 규격마다 결과가 무너진다:
 *   iPhone 6.9"는 캔버스 비율(2.167)과 화면 비율이 같아서 폭 80%면
 *   높이도 딱 80%가 되어 하단이 전혀 잘리지 않고,
 *   Play Store 폰은 캔버스가 16:9인데 화면은 20:9라 같은 폭에서 과하게 잘린다.
 *
 * deviceHeight — 캔버스 높이에 대한 디바이스 프레임 높이의 비율.
 *                1을 넘으면 화면 밖으로 흘러넘쳐 잘린다.
 * minWidth/maxWidth — 그렇게 역산한 폭의 하한·상한(캔버스 폭 대비).
 *                     좌우 여백이 사라지거나 반대로 너무 작아지는 것을 막는다.
 *
 * landscape — 가로 규격(Mac 2880×1800)에서 위 셋을 갈아 끼우는 값.
 *             세로 값을 그대로 쓰면 폭이 상한에 걸려 카피 자리가 사라진다:
 *             caption-top의 0.95면 1800×0.95÷0.625 = 2736px으로 캔버스 폭(2880)에
 *             거의 닿는다. 레이아웃을 두 벌로 나누지 않는 이유는 템플릿과 설명이
 *             같고 치수만 다르기 때문이다.
 */
export const LAYOUTS = {
  'caption-top': {
    label: '상단 카피 + 하단 디바이스',
    desc: '카피를 먼저 읽히고 디바이스는 그 아래에 둔다. 넘치면 render가 캔버스에 맞춰 줄인다(--allow-crop이면 하단에서 잘린다). 스토어 목록 썸네일에서도 문구가 살아남는 가장 안전한 구성.',
    template: 'layout-caption-top.html',
    deviceHeight: 0.95,
    minWidth: 0.60,
    maxWidth: 0.88,
    // 가로 화면에는 글자가 빽빽한 데스크톱 UI가 들어간다. 세로 폰보다 크게 잡아야
    // 스토어 목록에서 화면 내용이 읽힌다. 0.58에서 실물로 보고 올렸다.
    // 창 목업으로 다시 확인: 0.72·0.78은 카피와 기기 사이 간격(12u) 때문에 창 아래가
    // 잘린다. 폰은 잘려도 의도지만 창은 고장으로 보이므로 0.64가 상한이다.
    landscape: { deviceHeight: 0.64, minWidth: 0.50, maxWidth: 0.86 },
    screens: 1,
  },
  'caption-bottom': {
    label: '상단 디바이스 + 하단 카피',
    desc: '디바이스가 캔버스 최상단에 거의 붙어서 화면 상단 UI(헤더·네비게이션)가 그대로 보인다. 앱의 첫인상을 보여줄 때.',
    template: 'layout-caption-bottom.html',
    deviceHeight: 0.80,
    minWidth: 0.55,
    maxWidth: 0.86,
    landscape: { deviceHeight: 0.66, minWidth: 0.50, maxWidth: 0.86 },
    screens: 1,
  },
  angled: {
    label: '기울인 디바이스 + 카피',
    desc: '디바이스를 -8도 기울이고 그림자를 깊게 준다. 역동적이고 프리미엄한 인상. 화면 내용은 상대적으로 덜 보인다.',
    template: 'layout-angled.html',
    rotate: 8, // layout-angled.html의 rotate(-8deg)와 같아야 한다
    deviceHeight: 0.78,
    minWidth: 0.52,
    maxWidth: 0.78,
    // rotate는 오버라이드하지 않는다 — 템플릿의 rotate(-8deg)와 짝이어야 한다.
    //
    // 가로에서 이 레이아웃은 **글자가 빽빽한 화면에 쓰지 않는 편이 낫다.** 회전 때문에
    // 같은 deviceHeight라도 실제 창이 작아지고, 데스크톱 UI의 본문이 뭉개진다.
    // 실물로 확인했다: 삭제 확인 시트를 angled로 넣었더니 시트 글씨를 읽을 수 없었다.
    landscape: { deviceHeight: 0.58, minWidth: 0.42, maxWidth: 0.74 },
    screens: 1,
  },
  fullbleed: {
    label: '풀블리드 + 오버레이 카피',
    desc: '앱 화면을 캔버스 가득 채우고 하단 그라디언트 마스크 위에 카피를 얹는다. 앱 UI 자체가 예쁠 때 가장 강력하다.',
    template: 'layout-fullbleed.html',
    deviceHeight: null, // 프레임을 쓰지 않는다
    minWidth: 1,
    maxWidth: 1,
    screens: 1,
  },
  duo: {
    label: '디바이스 2대 겹침',
    desc: '앞뒤로 겹친 디바이스 2대로 두 화면의 흐름을 한 장에 보여준다. source2를 함께 지정해야 한다.',
    template: 'layout-duo.html',
    deviceHeight: 0.84,
    minWidth: 0.38,
    maxWidth: 0.58,
    landscape: { deviceHeight: 0.42, minWidth: 0.30, maxWidth: 0.52 },
    screens: 2,
  },
};

/**
 * 레이아웃과 디바이스로부터 프레임 폭(px)을 역산한다.
 *
 *   프레임 높이 = 폭 x (화면 세로비 + 위아래 베젤 비율)
 * 이므로 원하는 높이에서 폭을 거꾸로 구한 뒤 상·하한으로 자른다.
 * 프레임 없이 화면 카드만 그릴 때(framed: false)는 베젤이 없다.
 *
 * 기울인 레이아웃은 회전 후 bounding box 높이(h·cos t + w·sin t)가 deviceHeight가
 * 되도록 역산한다. 회전 전 높이로 맞추면 w·sin t만큼 튀어나와 카피를 덮는다 —
 * 폭이 넓은 태블릿일수록 심해서 iPad 13"에서 100px 넘게 겹쳤다.
 */
/**
 * 이 기기에 적용할 레이아웃 치수.
 *
 * 가로 규격이면 `landscape` 블록을 얹는다. 세로 기기는 손대지 않은 원본을 그대로 받는다 —
 * 이 함수가 세로에서 아무것도 하지 않는다는 것이 가로 지원의 안전성 근거다.
 */
export function metricsFor(device, layout) {
  return isLandscape(device) && layout.landscape ? { ...layout, ...layout.landscape } : layout;
}

export function frameWidthFor(device, layout, canvas, { framed = true, aspect = null } = {}) {
  const m = metricsFor(device, layout);
  if (!m.deviceHeight) return canvas.w;

  const width = (canvas.h * m.deviceHeight) / heightPerWidth(device, layout, { framed, aspect });

  // minWidth 하한은 "기기가 너무 작아지는 것"을 막는 값이고, 하한에 걸리면 기기는 캔버스를
  // 넘어 잘린다 — 폰은 하단이 잘리는 것이 caption-top의 의도된 모습이다.
  // 창 목업(aspect 지정)에는 하한을 적용하지 않는다: 잘린 앱 창은 의도가 아니라 고장으로 보이고,
  // 세로로 긴 창(3:4)은 하한 때문에 높이가 캔버스의 109%가 됐다.
  const floor = aspect === null ? canvas.w * m.minWidth : 0;
  return Math.round(Math.min(Math.max(width, floor), canvas.w * m.maxWidth));
}

/**
 * 기기 폭 1px당 화면에 차지하는 높이 (회전 후 bounding box 기준).
 * 템플릿은 이 값으로 "남은 공간에 들어가는 최대 폭"을 CSS에서 계산한다.
 */
export function heightPerWidth(device, layout, { framed = true, aspect = null } = {}) {
  const f = device.frame;
  // aspect가 오면 그 값이 이미 기기 박스 전체의 높이/폭이다
  // (창 목업은 소스 비율 + 타이틀바). 창 캡처는 기기 화면 비율과 무관하므로 그쪽을 쓴다.
  const screenRatio = aspect ?? device.screen.h / device.screen.w;
  // 홈버튼 세대는 위아래 베젤(chin)이 좌우와 다르다
  const vPad = aspect !== null || !framed ? 0 : f.chin ? f.chin.top + f.chin.bottom : f.bezel * 2;
  const t = ((layout.rotate ?? 0) * Math.PI) / 180;
  return (screenRatio + vPad) * Math.cos(t) + Math.sin(t);
}

export const LAYOUT_IDS = Object.keys(LAYOUTS);

/** 레이아웃을 id로 조회한다. 없으면 전체 목록을 담은 Error를 던진다. */
export function getLayout(id) {
  const layout = LAYOUTS[id];
  if (layout) return layout;
  throw new Error(
    `알 수 없는 레이아웃: '${id}'\n  사용 가능: ${LAYOUT_IDS.join(', ')}\n  설명은 'appshot layouts'로 확인하세요.`,
  );
}
