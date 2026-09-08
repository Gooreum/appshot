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
 */
export const LAYOUTS = {
  'caption-top': {
    label: '상단 카피 + 하단 디바이스',
    desc: '카피를 먼저 읽히고 디바이스는 하단에서 잘린다. 스토어 목록 썸네일에서도 문구가 살아남는 가장 안전한 구성.',
    template: 'layout-caption-top.html',
    deviceHeight: 0.95,
    minWidth: 0.60,
    maxWidth: 0.88,
    screens: 1,
  },
  'caption-bottom': {
    label: '상단 디바이스 + 하단 카피',
    desc: '디바이스가 캔버스 최상단에 거의 붙어서 화면 상단 UI(헤더·네비게이션)가 그대로 보인다. 앱의 첫인상을 보여줄 때.',
    template: 'layout-caption-bottom.html',
    deviceHeight: 0.80,
    minWidth: 0.55,
    maxWidth: 0.86,
    screens: 1,
  },
  angled: {
    label: '기울인 디바이스 + 카피',
    desc: '디바이스를 -8도 기울이고 그림자를 깊게 준다. 역동적이고 프리미엄한 인상. 화면 내용은 상대적으로 덜 보인다.',
    template: 'layout-angled.html',
    deviceHeight: 0.78,
    minWidth: 0.52,
    maxWidth: 0.78,
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
    screens: 2,
  },
};

/**
 * 레이아웃과 디바이스로부터 프레임 폭(px)을 역산한다.
 *
 *   프레임 높이 = 폭 x (화면 세로비 + 위아래 베젤 비율)
 * 이므로 원하는 높이에서 폭을 거꾸로 구한 뒤 상·하한으로 자른다.
 */
export function frameWidthFor(device, layout, canvas) {
  if (!layout.deviceHeight) return canvas.w;

  const f = device.frame;
  const screenRatio = device.screen.h / device.screen.w;
  // 홈버튼 세대는 위아래 베젤(chin)이 좌우와 다르다
  const vPad = f.chin ? f.chin.top + f.chin.bottom : f.bezel * 2;

  const width = (canvas.h * layout.deviceHeight) / (screenRatio + vPad);

  return Math.round(
    Math.min(Math.max(width, canvas.w * layout.minWidth), canvas.w * layout.maxWidth),
  );
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
