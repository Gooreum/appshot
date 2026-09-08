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
 * frameWidth — 캔버스 폭에 대한 디바이스 프레임 폭의 비율.
 * 이 값이 레이아웃의 인상을 좌우한다. 크면 화면이 잘 보이고,
 * 작으면 카피와 여백이 살아난다.
 */
export const LAYOUTS = {
  'caption-top': {
    label: '상단 카피 + 하단 디바이스',
    desc: '카피를 먼저 읽히고 디바이스는 하단에서 잘린다. 스토어 목록 썸네일에서도 문구가 살아남는 가장 안전한 구성.',
    template: 'layout-caption-top.html',
    frameWidth: 0.80,
    screens: 1,
  },
  'caption-bottom': {
    label: '상단 디바이스 + 하단 카피',
    desc: '화면 상단 UI(헤더·네비게이션)를 보여주고 싶을 때. 디바이스가 위에서 잘린다.',
    template: 'layout-caption-bottom.html',
    frameWidth: 0.80,
    screens: 1,
  },
  angled: {
    label: '기울인 디바이스 + 카피',
    desc: '디바이스를 -8도 기울이고 그림자를 깊게 준다. 역동적이고 프리미엄한 인상. 화면 내용은 상대적으로 덜 보인다.',
    template: 'layout-angled.html',
    frameWidth: 0.70,
    screens: 1,
  },
  fullbleed: {
    label: '풀블리드 + 오버레이 카피',
    desc: '앱 화면을 캔버스 가득 채우고 하단 그라디언트 마스크 위에 카피를 얹는다. 앱 UI 자체가 예쁠 때 가장 강력하다.',
    template: 'layout-fullbleed.html',
    frameWidth: 1.0, // 프레임을 쓰지 않는다
    screens: 1,
  },
  duo: {
    label: '디바이스 2대 겹침',
    desc: '앞뒤로 겹친 디바이스 2대로 두 화면의 흐름을 한 장에 보여준다. source2를 함께 지정해야 한다.',
    template: 'layout-duo.html',
    frameWidth: 0.56,
    screens: 2,
  },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);

/** 레이아웃을 id로 조회한다. 없으면 전체 목록을 담은 Error를 던진다. */
export function getLayout(id) {
  const layout = LAYOUTS[id];
  if (layout) return layout;
  throw new Error(
    `알 수 없는 레이아웃: '${id}'\n  사용 가능: ${LAYOUT_IDS.join(', ')}\n  설명은 'appshot layouts'로 확인하세요.`,
  );
}
