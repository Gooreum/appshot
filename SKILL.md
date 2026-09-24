---
name: appshot
description: 앱스토어/플레이스토어 등록용 마케팅 스크린샷을 만든다. 앱 화면 캡처를 디바이스 목업에 넣고 카피와 배경을 얹어 스토어 제출 규격(1290x2796 등)에 정확히 맞는 PNG를 배치 생성한다. 스크린샷, 앱스토어 스크린샷, 플레이스토어 스크린샷, 스토어 이미지, 앱 소개 이미지, 디바이스 목업, 마케팅 이미지, App Store screenshot, Play Store screenshot, device mockup 키워드에 사용.
---

# appshot — 스토어 마케팅 스크린샷 생성기

앱 화면 → 디바이스 목업 + 카피 + 배경 → **스토어 규격에 픽셀 정확히 맞는 PNG**.

어떤 프로젝트에서 실행하든 동작한다. 대상 프로젝트에는 `appshot.config.json`과
출력 폴더만 생기고, 의존성은 이 스킬 폴더 안에 격리되어 있다.

## 실행 방법

CLI는 이 스킬 폴더의 `bin/appshot.mjs`다. **사용자의 현재 디렉토리에서** 실행한다:

```bash
node ~/.claude/skills/appshot/bin/appshot.mjs <command>
```

## 워크플로우

사용자가 스크린샷을 요청하면 아래 5단계를 따른다.
**추측하지 말고 AskUserQuestion으로 물어본다** — 플랫폼·디바이스·레이아웃은
사용자가 골라야 하는 것이지 기본값으로 때울 것이 아니다.

### 1단계 — 환경 점검

```bash
node ~/.claude/skills/appshot/bin/appshot.mjs doctor
```

Chromium이 없다고 나오면 먼저 설치한다:
```bash
cd ~/.claude/skills/appshot && npx playwright install chromium
```

### 2단계 — 플랫폼 선택

AskUserQuestion으로 묻는다: **Apple (App Store)** / **Mac (Mac App Store)** /
**Android (Google Play)** / 여럿.

여럿이면 플랫폼별로 config를 나눠 여러 번 렌더한다 (규격이 다르므로).

**"맥 앱", "맥북 앱"은 `macos`다** — `ios`가 아니다. Mac App Store는 기기 슬롯이 없고
16:10 **가로** 규격(2880×1800)이라 레이아웃 치수가 세로 기기와 따로 잡혀 있다.

```bash
node ~/.claude/skills/appshot/bin/appshot.mjs init --platform macos
```

맥은 **창 목업**이 기본이다 — 신호등 버튼이 있는 macOS 앱 창으로 화면을 감싼다.
창 캡처가 16:10이 아니어도(4:3, 21:9 등) 창이 그 비율을 그대로 따라가므로 잘리지 않는다.
그래서 맥에서는 소스 비율 경고를 띄우지 않는다. 화면만 보여주려면 `theme.deviceFrame: false`.

### 3단계 — 디바이스 선택

```bash
node ~/.claude/skills/appshot/bin/appshot.mjs devices --platform ios
```

출력에서 `[필수]` 표시가 있는 슬롯을 우선 안내하고, AskUserQuestion으로 고르게 한다.

- App Store는 **iPhone 6.9" 또는 6.5" 중 하나**가 필수 — 기본은 6.9"(1290×2796).
  iPad에서 도는 앱이면 **iPad 13"(2064×2752)** 도 필수
- Google Play는 기기 유형 합쳐 최소 2장이지만, **추천 영역에 노출되려면 4장 이상**이 필요하다.
  그래서 Android `init`은 4장짜리 config를 만든다

디바이스 선택이 바꾸는 것은 **목업의 생김새**(Dynamic Island / 노치 / 펀치홀 / 홈버튼)이고,
출력 규격은 그 기기의 스토어 슬롯으로 고정된다. 이 구분을 사용자에게 알려준다.

**Android는 기본으로 기기 프레임 없이 앱 화면만 둥근 카드로 보여준다** (`theme.deviceFrame: false`).
Google Play가 "기기 이미지는 금방 구식이 되고 일부 사용자를 소외시킨다"며 피하라고 권장하기 때문이다.
사용자가 원하면 `true`로 켤 수 있지만 경고가 뜬다는 것을 알려준다. App Store는 프레임이 허용되므로 iOS 기본은 `true`.

**macOS도 기본은 프레임 없음이다** (`theme.deviceFrame: false`). Mac 스크린샷에 넣는 것은
바탕화면이 아니라 앱 **창**이고, 창을 노트북 베젤 안에 넣으면 바탕화면이 없어 어색해진다.
MacBook 목업은 Mac App Store에서 **필수가 아니다** — 앱 창만 올리는 Mac 앱이 많다.

### 4단계 — 앱 화면 확보

두 가지 방법이 있다. 사용자에게 어느 쪽인지 묻는다.

**(a) 사용자가 PNG를 제공** — `screens/` 폴더에 넣게 안내한다.

**(b) 자동 캡처** — 시뮬레이터/기기가 켜져 있어야 한다:
```bash
node ~/.claude/skills/appshot/bin/appshot.mjs capture --platform ios
```
adb가 없으면 실패가 아니라 "PNG를 직접 넣으세요" 안내가 나온다. 그때는 (a)로 유도한다.

**맥은 창을 클릭해 찍는다:**
```bash
node ~/.claude/skills/appshot/bin/appshot.mjs capture --platform macos
```
실행하면 커서가 카메라로 바뀐다. **사용자가 찍을 앱 창을 클릭해야** 하므로, 실행 전에
"찍을 창을 클릭하세요"라고 사용자에게 알려준다 (esc로 취소). 화면 전체를 찍지 않으므로
다른 창이 들어갈 일이 없다. 화면 기록 권한이 없으면 그 안내가 나온다.

**macOS는 자동 캡처가 없다.** 어느 창을 찍을지는 사람만 안다:
```bash
screencapture -o -l <창 ID> screens/01.png    # -o = 창 그림자 제외
```
⚠️ **화면 전체를 찍지 않는다.** 열려 있던 다른 창의 내용이 그대로 스토어에 올라간다.

캡처할 때 상태바를 스토어 권장 상태로 정리한다 — iOS는 9:41·와이파이·셀룰러·배터리 가득,
Android는 demo mode로 알림을 숨기고 아이콘을 가득 채운다. 끝나면 원래대로 되돌린다.
시뮬레이터에 사용자가 걸어둔 상태바 설정이 있으면 건드리지 않는다.
사용자가 직접 PNG를 줄 때는 상태바에 알림·낮은 배터리가 찍혀 있지 않은지 확인하라고 말한다.

**아직 앱 화면이 없어도 진행할 수 있다.** `--placeholder`로 자리표시자를 써서
카피와 레이아웃을 먼저 확정한 뒤 나중에 실제 화면으로 교체하는 편이 대개 빠르다.

### 5단계 — 레이아웃과 카피

```bash
node ~/.claude/skills/appshot/bin/appshot.mjs init --device <id>
node ~/.claude/skills/appshot/bin/appshot.mjs layouts
```

`layouts`가 5종을 ASCII 미리보기와 함께 출력한다. AskUserQuestion으로 고르게 한다.
**스크린마다 다른 레이아웃을 섞으라고 권한다** — 5장이 전부 같은 구성이면
스토어에서 옆으로 넘길 때 단조롭다.

| 레이아웃 | 언제 |
|---|---|
| `caption-top` | 기본. 카피 가독성이 가장 높다 |
| `caption-bottom` | 화면 상단 UI를 보여주고 싶을 때 |
| `angled` | 프리미엄·역동적 인상 |
| `fullbleed` | 앱 UI 자체가 예쁠 때 |
| `duo` | 두 화면의 흐름을 한 장에 (source2 필요) |

카피는 앱 화면을 **직접 읽고** 제안한다. 사용자가 이미 문구를 줬으면 그대로 쓴다.
작성 원칙은 `references/copywriting.md`를 참고한다. 핵심만:

- 기능이 아니라 **결과**를 쓴다 ("동기화 지원" ✗ → "어디서든 이어보기" ✓)
- 한글 18자 / 영문 32자 이내 — 넘으면 스토어 목록 썸네일에서 잘린다
- **첫 장이 가장 중요하다.** 대부분의 사용자는 첫 장만 본다
- **스토어 금지 표현을 제안하지 않는다** — 가격·할인("무료"), 순위·최상급("최고의", "1위", "Best"),
  그리고 Play에서는 "New"·"신규", "지금 다운로드" 같은 설치 유도, "100만 명" 같은 다운로드 수
- Android는 카피가 이미지의 20%를 넘지 않게 짧게. Android 태블릿은 카피를 비우는 쪽을 권한다

그다음 `appshot.config.json`의 `screens` 배열과 `theme`를 편집한다.
배경이 여러 장에 걸쳐 이어지게 하려면 `theme.background.panorama: true`.

### 배경

기본은 그라디언트다. 사용자가 배경 이미지를 갖고 있으면 이렇게 깐다:

```json
"background": {
  "type": "image",
  "source": "backgrounds/bg.png",
  "fit": "cover",
  "overlay": 0.28,
  "panorama": false
}
```

- 경로는 **대상 프로젝트 기준**이다. 깨진·없는 배경 파일은 앱 화면과 똑같이 렌더 전에 거부된다
- `overlay`는 배경 위 가독성 마스크로 **기본 0.28**이다. 배경 사진은 부분마다 밝기가 달라 대비를
  자동 검사할 수 없어서 기본으로 씌운다. 이미 어두운 배경이면 `0`으로 끄라고 안내한다
- `fit: cover`는 가장자리를 자르고, `contain`은 다 보이는 대신 여백이 남는다.
  비율이 캔버스와 20% 넘게 다르면 `bg-crop` 경고가 뜬다
- **appshot은 배경 이미지를 만들어 주지 않는다.** 사용자가 파일을 주지 않으면 그라디언트를 쓰거나,
  이미지를 따로 만들어 `backgrounds/`에 넣도록 안내한다

### 6단계 — 렌더

```bash
# 저해상도로 빠르게 확인
node ~/.claude/skills/appshot/bin/appshot.mjs render --preview
# 제출용 원본
node ~/.claude/skills/appshot/bin/appshot.mjs render
```

**결과물을 Read 도구로 직접 열어 눈으로 확인한다.** 규격이 맞는 것과
보기 좋은 것은 다른 문제다. 큰 PNG는 `sips -Z 900`으로 축소본을 만들어 본다.

### 프레임 게이트 (렌더를 막는 검사)

`deviceFrame: true`는 "프레임을 그려라"는 스위치일 뿐이라, 예전에는 결과가 기기처럼 안 보여도
그대로 통과했다. 이제 render가 PNG를 저장하기 **전에** 픽셀을 측정해서, 하나라도 실패하면
그 장을 저장하지 않고(이전 렌더의 같은 이름 파일도 지운다) 에러로 중단한다.

| 검사 | 실패 조건 |
|---|---|
| `device-crop` | 기기·창·카드가 캔버스 밖으로 1% 넘게 잘림 |
| `no-glass-bezel` | 화면 둘레에 검은 유리 베젤이 없음 (금속 테두리만 있는 카드) |
| `frame-blends` | 기기 테두리와 배경의 색 차이가 너무 작음 |
| `button-invisible` | 측면 버튼이 배경에 묻힘 |
| `double-island` | Dynamic Island가 두 겹 (캡처에 박힌 섬 + 프레임이 그린 섬) |

- 기기는 기본적으로 **캔버스 안에 자동으로 맞춰진다** — 넘치면 render가 줄인다. 그래서 caption-top도 기기 전체가 보인다
- 하단이 잘린 연출을 원하면 `theme.allowDeviceCrop: true` 또는 `render --allow-crop`. 이때만 잘림이 허용된다
- 시뮬레이터 캡처에 박힌 섬은 render가 감지해서 프레임 쪽 섬을 숨긴다
- 게이트 실패 메시지는 **사용자에게 그대로 전달**하고, 원인(배경색·소재·레이아웃)을 고쳐 다시 렌더한다. 게이트를 우회하려고 `deviceFrame: false`로 바꾸지 않는다

렌더가 끝나면 품질 경고가 한 블록으로 출력된다. 사용자에게 전달하고 고칠지 묻는다.
경고는 렌더를 막지 않는다.

| 경고 | 근거 |
|---|---|
| 대비 부족, 헤드라인 길이, 서브카피 줄 수 | 가독성 (WCAG AA 큰 텍스트 3:1, 썸네일 잘림) |
| 소스 비율·해상도 | 화면이 늘어나거나 흐려짐 |
| 금지 표현 (`restricted-*`) | App Store 2.3.7 / Google Play 콘텐츠 가이드라인 |
| 장수 부족·초과 (`count-*`) | Play 추천 노출 4장, 최대 iOS 10 / Android 8 |
| 카피 면적 20% 초과 (`copy-area`) | Google Play — Android만 |
| 기기 이미지 (`device-imagery`) | Google Play — Android에서 프레임을 켰을 때 |
| 태블릿 텍스트 (`tablet-text`) | Google Play 대형 화면 — Android 태블릿 |

깨진 소스 이미지(0바이트·잘린 파일·이미지가 아닌 파일)는 경고가 아니라 **에러로 중단**된다.
`--placeholder`여도 자리표시자로 덮지 않는다.

## 커맨드 요약

```
doctor     환경 점검 (playwright / chromium / simctl / screencapture / adb)
init       appshot.config.json + screens/ 생성   [--platform] [--device] [--force]
devices    디바이스와 스토어 규격 목록            [--platform] [--json]
layouts    레이아웃 5종 설명                     [--json]
capture    시뮬레이터/기기/맥 창에서 화면 캡처     --platform ios|macos|android [--name]
render     스토어 스크린샷 생성                  [--only 1,3] [--preview] [--placeholder] [--allow-crop]
```

## 참고 문서

- `references/store-specs.md` — 스토어 공식 규정 원문 요약(링크 포함), appshot이 자동 처리·경고·사람 확인할 것
- `references/copywriting.md` — 헤드라인 작성 원칙

## 주의

- 출력은 `{output}/{locale}/{device}/01.png` 형식으로 쌓인다. 로케일이 여럿이면
  `locale`을 바꿔가며 여러 번 렌더한다
- `deviceScaleFactor: 1`로 고정되어 있어 출력 크기가 항상 규격과 1:1이다.
  이 값을 건드리면 2배 크기로 나와 스토어가 리젝한다
- 폰트는 시스템 스택만 쓴다. 네트워크 폰트를 넣으면 렌더 결과가 재현되지 않는다
