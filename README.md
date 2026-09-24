# appshot

App Store·Google Play·Mac App Store에 올리는 마케팅 스크린샷을 만드는 CLI이자 Claude Code 스킬이다.
앱 화면 캡처를 기기 목업에 넣고 헤드라인과 배경을 얹어, 각 스토어 슬롯의 제출 규격과 픽셀 단위로
같은 PNG를 한 번에 뽑는다.

```
screens/01.png ──┐
screens/02.png ──┼─ appshot render ─→ store-screenshots/ko/iphone-17-pro-max/01.png  (1290×2796)
appshot.config ──┘                                                  …/02.png
```

---

## 왜 만들었나

스토어 스크린샷은 한 번 만들고 끝나는 작업이 아니다. 앱 UI가 바뀔 때마다, 로케일을 추가할 때마다,
기기 슬롯(iPhone 6.9", iPad 13", Play 폰·태블릿, Mac)마다 다시 만들어야 한다. Figma 템플릿이나
온라인 목업 서비스로 하면 매번 같은 수작업을 반복하게 되고, 그 과정에서 같은 문제가 되풀이된다.

| 문제 | 실제로 생기는 일 |
|---|---|
| 해상도가 1px이라도 다르다 | 레티나 환경에서 2배로 저장되거나 리사이즈 과정에서 규격이 틀어져 업로드가 거부된다 |
| 기기마다 비율이 다르다 | 같은 템플릿을 폰과 태블릿에 쓰면 기기가 잘리거나 카피를 덮는다 |
| 스토어 정책 문구 | "무료", "1위", "New", "지금 다운로드" 같은 표현으로 심사에서 반려된다 |
| 썸네일에서 잘리는 카피 | 스토어 목록의 작은 썸네일에서는 긴 헤드라인이 읽히지 않는다 |
| 지저분한 상태바 | 캡처 시각, 알림 아이콘, 낮은 배터리가 그대로 스토어에 올라간다 |
| 재현이 안 된다 | 누가 언제 어떤 도구로 만들었는지에 따라 결과가 달라서, 다음 릴리즈 때 같은 스타일로 다시 만들기 어렵다 |

appshot은 이 작업을 **설정 파일 하나 + 앱 화면 PNG**로 줄이는 것이 목표다. 스타일과 카피는
`appshot.config.json`에 남고, 화면만 바꿔서 다시 렌더하면 같은 결과가 나온다.

두 번째 목표는 **AI 에이전트에게 맡겨도 결과를 믿을 수 있게 하는 것**이다. 에이전트는 "규격이 맞는가"는
잘 확인하지만, "보기에 괜찮은가"는 자기 결과를 관대하게 판정하는 경향이 있다. 그래서 판단이 필요한 부분을
가능한 한 측정으로 바꿔 코드에 넣었다(아래 [검사](#검사-경고와-게이트) 참고).

---

## 동작 원리

### 렌더 파이프라인

```
appshot.config.json
      │  config.js      스키마 검증 (잘못된 값은 렌더 전에 거부)
      ▼
screens/*.png
      │  render.js      파일 검증 → data URI로 인라인 (깨진 파일은 전부 모아서 한 번에 에러)
      ▼
HTML 문서
      │  html.js        레이아웃 템플릿 + base.css + 기기 프레임 CSS(frame.js) 조립
      ▼
Headless Chromium (Playwright)
      │  viewport = 스토어 캔버스 크기, deviceScaleFactor = 1
      │  ├ fitDevices       기기가 캔버스를 넘치면 .device-area를 축소
      │  ├ hideBakedNotch   캡처에 이미 Dynamic Island가 있으면 프레임 쪽 섬을 숨김
      │  └ copyAreaRatio    카피 영역 비율 측정 (Play 20% 규정)
      ▼
PNG 버퍼
      │  frame-gate.js  최종 픽셀을 측정 — 실패하면 저장하지 않고 중단
      ▼
store-screenshots/{locale}/{device}/01.png
      │  quality.js     대비·길이·금지 표현 등 경고 출력
```

### 설계 판단

**이미지 라이브러리가 아니라 브라우저로 그린다.** 스크린샷에서 가장 까다로운 부분은 합성이 아니라
타이포그래피다. 한글은 어절 중간에서 끊기면 읽기 나쁘고(`word-break: keep-all`), 두 줄짜리 헤드라인은
줄 길이가 비슷해야 보기 좋다(`text-wrap: balance`). 이런 처리는 브라우저 레이아웃 엔진이 이미 잘 한다.
Pillow나 Sharp로 줄바꿈을 직접 계산하는 것보다 HTML 템플릿에 맡기는 편이 결과가 좋고 코드도 적다.

**규격 정확도는 두 줄로 보장한다.** `viewport = 캔버스 크기`, `deviceScaleFactor = 1`. 이 값을 명시하지 않으면
레티나 환경에서 2배 크기로 저장되고, 이것이 스토어 업로드 거부의 가장 흔한 원인이다.

**재현성을 위해 외부 리소스를 쓰지 않는다.** 폰트는 시스템 폰트 스택만 쓰고, 이미지는 전부 data URI로
인라인한다. Playwright의 `setContent()`에는 baseURL이 없어서 상대 경로 이미지가 깨지는 문제도 이렇게 피한다.
네트워크 폰트를 쓰면 로딩 타이밍에 따라 결과가 달라진다.

**모든 치수는 캔버스 짧은 변의 1%(`--u`) 단위다.** 1290×2796, 1080×1920, 2880×1800이 같은 템플릿에서
같은 비율로 그려진다. 가로 캔버스(Mac)에서 폭을 기준으로 잡으면 헤드라인이 캔버스 높이의 9%까지 커져서,
짧은 변을 기준으로 삼았다.

**기기 크기는 폭이 아니라 높이에서 역산한다.** 폭 비율을 고정하면 규격마다 결과가 달라진다.
iPhone 6.9"는 캔버스와 화면 비율이 같아서 아래가 전혀 잘리지 않지만, Play 폰은 캔버스가 16:9이고
화면이 20:9라서 같은 폭이면 과하게 잘린다. 그래서 레이아웃마다 "캔버스 높이 대비 기기 높이"를 정하고 폭을
거꾸로 구한다. 카피 줄 수에 따라 실제 배치는 또 달라지므로, 넘치면 렌더 단계에서 한 번 더 줄인다(`fitDevices`).

**기기 목업은 이미지 에셋이 아니라 CSS를 만드는 데이터다.** 베젤 두께, 코너 반경, 섬·노치·펀치홀 위치,
버튼 위치를 `src/devices.js`에 프레임 폭 대비 비율로 두고, `src/frame.js`가 CSS로 만든다.
Apple·Samsung 목업 이미지를 쓰지 않은 이유는 세 가지다. 재배포 라이선스 제약이 있고, 목업 PNG의
화면 구멍에 캡처를 픽셀 단위로 맞추는 작업이 번거롭고, 새 기기를 추가할 때마다 에셋을 구해야 한다.
대신 CSS 프레임은 실물 사진만큼 정교하지 않다. 최소한 "기기로 읽히는 수준"을 유지하는 것이 아래
프레임 게이트의 역할이다.

**출력 규격(canvas)과 기기 외형(frame)을 분리했다.** 기기를 고르면 목업 생김새가 바뀌고, 출력 크기는
그 기기가 속한 스토어 슬롯으로 고정된다. 그래서 Pixel 9와 Pixel 9 Pro XL은 출력 규격이 같고 외형만 다르다.

**플랫폼마다 기본값이 다르다.** Google Play는 스크린샷에 기기 이미지를 넣지 말라고 권장해서
("can become obsolete quickly or alienate some users") Android 기본값은 기기 없이 앱 화면만 둥근 카드로
보여준다. Mac은 노트북 베젤이 아니라 신호등 버튼이 있는 앱 창 목업을 쓴다. 창 캡처는 비율이 제각각이라
창이 소스 비율을 그대로 따라가게 했다.

**대상 프로젝트를 오염시키지 않는다.** Playwright를 포함한 의존성과 템플릿은 전부 이 저장소 안에 있다.
대상 프로젝트에는 `appshot.config.json`, `screens/`, 출력 폴더만 생긴다.

---

## 검사: 경고와 게이트

검사는 두 종류로 나눴다. 기준은 **"사람이 보고 받아들일 여지가 있는가"**다.

### 경고 — 렌더는 끝내고 목록으로 알린다

사람이 보고 판단할 수 있는 항목이다. 렌더가 끝난 뒤 한 블록으로 출력된다.

| 분류 | 항목 |
|---|---|
| 가독성 | 카피 대비 (WCAG AA 큰 텍스트 3:1), 헤드라인 길이 (한글 18자 / 영문 32자), 서브카피 2줄 초과 |
| 소스 | 화면 비율이 기기와 ±3% 넘게 다름, 해상도가 렌더 폭보다 작음 |
| 스토어 정책 | 가격·할인·순위·최상급 표현 (양쪽), 신규·설치 유도·다운로드 수 (Play), 장수 부족·초과, 카피 면적 20% 초과 (Play), Android 기기 이미지, Android 태블릿 텍스트 |
| 배경 이미지 | 저해상도, cover 잘림, 모든 장이 fullbleed라 배경이 안 보임 |

### 에러 — 저장하지 않고 중단한다

결과물로 내보내면 안 되는 항목이다.

- **깨진 입력 파일**: 0바이트, 잘린 파일, 이미지가 아닌 파일. 문제 있는 파일을 전부 모아 한 번에 보고한다.
- **프레임 게이트** (`src/frame-gate.js`): `deviceFrame: true`는 "프레임을 그려라"는 스위치일 뿐이라,
  결과가 기기처럼 보이는지는 보장하지 않는다. 실제로 베젤을 금속색으로만 칠해 회색 테두리 카드처럼 보이거나,
  버튼이 배경에 묻히거나, Dynamic Island가 두 겹으로 찍힌 결과가 경고 없이 통과한 적이 있다.
  그래서 저장 직전에 **최종 PNG의 픽셀을** 측정한다.

| 검사 | 측정 방법 | 실패 조건 |
|---|---|---|
| `device-crop` | 기기 bounding box와 캔버스의 교집합 | 1% 넘게 캔버스 밖 |
| `no-glass-bezel` | 금속 밴드와 화면 사이 네 지점 샘플 | 검은 유리가 아님 |
| `frame-blends` | 테두리 픽셀과 바로 바깥 배경의 RGB 거리 | 40 미만 |
| `button-invisible` | 튀어나온 버튼 부분과 그 바깥 배경의 RGB 거리 | 28 미만 |
| `double-island` | 화면 상단 중앙 검은 덩어리의 행별 너비 | 작은 너비에서 평평하다가 다시 커짐 (알약 두 개가 겹친 모양) |

CSS 값이 아니라 픽셀을 재는 이유가 있다. CSS를 읽으면 내가 쓴 값을 내가 다시 확인하는 셈이라,
값은 맞는데 눈에 안 보이는 경우를 잡지 못한다. 기울어진 기기(angled)는 기기 안에 기준점 세 개를 꽂아
브라우저가 계산한 transform을 아핀 변환으로 복원해서 좌표를 구한다. 겹친 기기(duo)에서는
`elementFromPoint`로 다른 기기에 가려진 샘플을 버린다.

게이트에 걸린 장은 파일로 남기지 않고, **이전 렌더에서 남은 같은 이름의 파일도 지운다.** 남겨 두면
이번 렌더가 실패했는데도 예전 파일이 그대로 제출될 수 있다.

기기 하단이 잘린 연출을 일부러 쓰려면 `theme.allowDeviceCrop: true` 또는 `render --allow-crop`으로
명시해야 한다. 이때만 자동 축소를 건너뛰고 잘림 검사를 통과시킨다.

---

## 설치

Node.js 18 이상이 필요하다.

```bash
git clone https://github.com/Gooreum/appshot.git ~/Code/appshot
cd ~/Code/appshot
npm install
npx playwright install chromium

# Claude Code 스킬로 쓰려면
ln -s ~/Code/appshot ~/.claude/skills/appshot
```

## 사용

명령은 **대상 앱 프로젝트 디렉토리에서** 실행한다.

```bash
APPSHOT="node ~/Code/appshot/bin/appshot.mjs"

$APPSHOT doctor                           # Playwright·Chromium·simctl·adb·screencapture 점검
$APPSHOT devices --platform ios           # 기기와 스토어 규격, 필수 슬롯
$APPSHOT init --device iphone-17-pro-max  # appshot.config.json + screens/ 생성
$APPSHOT capture --platform ios           # 부팅된 시뮬레이터에서 상태바 정리 후 캡처
$APPSHOT layouts                          # 레이아웃 5종 설명
$APPSHOT render --preview                 # 1/3 해상도로 빠르게 확인
$APPSHOT render                           # 제출용 원본
```

앱 화면이 아직 없으면 `render --placeholder`로 자리표시자를 넣어 카피와 레이아웃을 먼저 확정할 수 있다.

Claude Code에서는 "앱스토어 스크린샷 만들어줘"라고 요청하면 `SKILL.md`의 절차대로 진행한다.
플랫폼, 기기, 화면 확보 방법, 레이아웃, 카피, 배경, 프리뷰 수정 여부 같은 결정 지점(D1~D10)마다
질문을 평문으로 던지지 않고 선택지(AskUserQuestion)로 묻는다. 선택지에 맞는 답이 없으면 자유 입력칸에
직접 적으면 된다. 카피 세트나 레이아웃처럼 비교가 필요한 선택지는 미리보기에 실제 내용을 보여준다.

### config 예시

```json
{
  "platform": "ios",
  "device": "iphone-17-pro-max",
  "locale": "ko",
  "output": "./store-screenshots",
  "theme": {
    "background": { "type": "gradient", "from": "#4F46E5", "to": "#2563EB", "angle": 160, "noise": true },
    "headline": { "color": "#FFFFFF", "size": 0.056, "weight": 800 },
    "subhead": { "color": "rgba(255,255,255,0.86)", "size": 0.029, "weight": 500 },
    "deviceFrame": true
  },
  "screens": [
    { "source": "screens/01.png", "layout": "caption-top", "headline": "읽고 싶은 영어 글 그대로", "subhead": "문장을 탭하면 단어·문법·해석까지 보여줘요" },
    { "source": "screens/02.png", "layout": "angled", "headline": "내 해석, 바로 채점" },
    { "source": "screens/03.png", "source2": "screens/04.png", "layout": "duo", "headline": "읽고 나면 노트로" }
  ]
}
```

- 로케일이 여럿이면 `locale`을 바꿔 여러 번 렌더한다. 출력은 `{output}/{locale}/{device}/`로 나뉜다
- 기기가 여럿(iPhone + iPad)이면 config를 기기별로 나눠 렌더한다. 규격과 레이아웃 치수가 다르기 때문이다

### 캡처

`capture`는 상태바를 스토어 권장 상태로 정리한 뒤 찍고, 끝나면 원래대로 되돌린다.

- **iOS**: `simctl status_bar`로 9:41, 신호, 배터리 가득. 사용자가 미리 걸어둔 상태바 설정이 있으면 건드리지 않는다
- **Android**: SystemUI demo mode로 알림을 숨기고 아이콘을 채운다. adb가 없으면 실패로 처리하지 않고 PNG를 직접 넣으라고 안내한다
- **Mac**: `screencapture -w -o`로 사용자가 클릭한 창만 찍는다. 화면 전체를 찍지 않아서 다른 창이 섞여 들어가지 않는다

앱을 원하는 화면까지 이동시키는 작업은 하지 않는다. 어떤 화면을 보여줄지는 사람이 정한다.

---

## 지원 기기

| Apple | 슬롯 | 규격 | | Android | 규격 |
|---|---|---|---|---|---|
| iPhone 17 Pro Max | 6.9" | 1290×2796 **필수**¹ | | Pixel 9 Pro XL | 1080×1920 **필수** |
| iPhone 14 Plus | 6.5" | 1284×2778 | | Pixel 9 | 1080×1920 |
| iPhone 8 Plus | 5.5" | 1242×2208 | | Galaxy S25 Ultra | 1080×1920 |
| iPad Pro 13" | 13" | 2064×2752 **필수**² | | Galaxy Tab S10 | 1440×2560 (9:16) |
| iPad Air 11" | 11" | 1668×2388 | | | |
| Mac 16:10 | Mac | 2880×1800 **필수**³ | | | |

¹ 6.9"와 6.5" 중 하나가 필수다. ² iPad에서 동작하는 앱일 때. ³ Mac 앱일 때 (2560×1600·1440×900·1280×800도 허용).
기기 이름은 App Store Connect의 슬롯별 기기 목록을 따른다.

새 기기는 `src/devices.js`에 캔버스·화면 크기와 프레임 수치를 추가하면 된다.

## 레이아웃

| 레이아웃 | 구성 | 쓰는 경우 |
|---|---|---|
| `caption-top` | 위 카피, 아래 기기 | 기본값. 썸네일에서 카피가 가장 잘 읽힌다 |
| `caption-bottom` | 위 기기, 아래 카피 | 화면 상단 UI(헤더, 내비게이션)를 보여주고 싶을 때 |
| `angled` | 8도 기울인 기기 | 역동적인 인상. 화면 글씨는 상대적으로 작아진다 |
| `fullbleed` | 화면을 캔버스 가득 + 하단 카피 | 앱 UI 자체가 보기 좋을 때 |
| `duo` | 겹친 기기 두 대 | 두 화면의 흐름을 한 장에 (`source2` 필요) |

장마다 다른 레이아웃을 쓸 수 있다. 여러 장이 같은 구성이면 스토어에서 넘겨 볼 때 단조롭다.
파노라마(배경이 여러 장에 걸쳐 이어지는 구성)는 레이아웃이 아니라 배경 옵션
(`theme.background.panorama`)이라서 어느 레이아웃과도 조합된다.

## 배경

| 필드 | 값 | 설명 |
|---|---|---|
| `type` | `"gradient"` · `"solid"` · `"image"` | 기본 `gradient` |
| `from` / `to` / `angle` | 색·각도 | gradient용. solid는 `from`만 쓴다 |
| `source` | `"backgrounds/bg.png"` | image용. 대상 프로젝트 기준 상대 경로 |
| `fit` | `"cover"`(기본) · `"contain"` | cover는 가장자리를 자르고, contain은 다 보이는 대신 여백이 남는다 |
| `overlay` | `0`~`1`, 기본 `0.28` | 가독성 마스크. 사진 배경은 부분마다 밝기가 달라 대비를 자동 검사할 수 없어서 기본으로 씌운다 |
| `noise` | `true`(기본) | 그라디언트 밴딩을 없애는 2% 노이즈 |
| `panorama` | `false`(기본) | 배경을 여러 장에 걸쳐 잇는다 |

배경 이미지는 만들어 주지 않는다. 준비된 파일을 규격에 맞게 깔고 검사만 한다.

---

## 한계

- **목업은 CSS 근사치다.** 실물 사진 기반 목업(Apple Design Resources 등)만큼 정교하지 않다. 게이트는
  "기기로 읽히는가"의 최저선을 지킬 뿐, 고급 목업을 대신하지 않는다.
- **섬 감지는 휴리스틱이다.** 화면 상단 중앙이 대부분 검으면 섬이 박혀 있다고 본다. Xcode 26 시뮬레이터
  캡처(iPhone 17 Pro Max)에서 확인했고, 다른 기기나 해상도에서는 빗나갈 수 있다. 빗나가면 `double-island`
  게이트에 걸린다.
- **배경 이미지 위 카피 대비는 측정하지 않는다.** 기본 오버레이로 완화할 뿐이라 사람이 확인해야 한다.
- **사람이 확인해야 하는 스토어 정책이 남아 있다.** 실제 앱에 있는 화면인지, 다른 플랫폼 UI가
  섞였는지 같은 항목이다. 목록은 `references/store-specs.md`에 있다.
- **자동화된 테스트가 없다.** 지금은 기기 10종 × 프레임 켬/끔 × 레이아웃 조합을 자리표시자로 렌더하는
  스크립트로 확인하고 있다. `html.js`를 순수 함수로 둔 것은 브라우저 없이 단위 테스트를 붙이기 위해서다.

---

## 구조

```
bin/appshot.mjs          CLI 진입점, 서브커맨드 라우팅
src/
  args.js                최소 인자 파서
  config.js              기본 config 생성과 스키마 검증
  devices.js             기기 카탈로그 — 캔버스·화면 크기, 프레임 수치
  layouts.js             레이아웃 카탈로그 — 기기 크기 역산
  frame.js               기기·카드·창 목업 CSS/HTML 생성
  html.js                템플릿 + CSS 조립 (순수 함수)
  render.js              Playwright 렌더 루프, 자동 축소, 섬 감지
  frame-gate.js          프레임 게이트 — 최종 PNG 픽셀 검사
  quality.js             경고 규칙 (가독성·스토어 정책·소스·배경)
  capture.js             simctl / adb / screencapture 래퍼
  commands/              doctor · devices · init · layouts · capture · render
templates/
  base.css               공통 타이포·여백 (--u 단위)
  layout-*.html          레이아웃 5종
references/
  store-specs.md         스토어 공식 규정 요약과 원문 링크, 실제 반려 사유
  copywriting.md         헤드라인 작성 원칙
SKILL.md                 Claude Code가 따르는 작업 절차
```
