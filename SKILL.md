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

AskUserQuestion으로 묻는다: **Apple (App Store)** / **Android (Google Play)** / 둘 다.

둘 다면 플랫폼별로 config를 나눠 두 번 렌더한다 (규격이 다르므로).

### 3단계 — 디바이스 선택

```bash
node ~/.claude/skills/appshot/bin/appshot.mjs devices --platform ios
```

출력에서 `[필수]` 표시가 있는 슬롯을 우선 안내하고, AskUserQuestion으로 고르게 한다.

- App Store는 **iPhone 6.9"(1290×2796)** 가 필수. iPad 앱이면 **iPad 13"(2064×2752)** 도 필수
- Play Store는 **폰 스크린샷 최소 2장**이 필수

디바이스 선택이 바꾸는 것은 **목업의 생김새**(Dynamic Island / 펀치홀 / 홈버튼)이고,
출력 규격은 그 기기의 스토어 슬롯으로 고정된다. 이 구분을 사용자에게 알려준다.

### 4단계 — 앱 화면 확보

두 가지 방법이 있다. 사용자에게 어느 쪽인지 묻는다.

**(a) 사용자가 PNG를 제공** — `screens/` 폴더에 넣게 안내한다.

**(b) 자동 캡처** — 시뮬레이터/기기가 켜져 있어야 한다:
```bash
node ~/.claude/skills/appshot/bin/appshot.mjs capture --platform ios
```
adb가 없으면 실패가 아니라 "PNG를 직접 넣으세요" 안내가 나온다. 그때는 (a)로 유도한다.

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

그다음 `appshot.config.json`의 `screens` 배열과 `theme`를 편집한다.
배경이 여러 장에 걸쳐 이어지게 하려면 `theme.background.panorama: true`.

### 6단계 — 렌더

```bash
# 저해상도로 빠르게 확인
node ~/.claude/skills/appshot/bin/appshot.mjs render --preview
# 제출용 원본
node ~/.claude/skills/appshot/bin/appshot.mjs render
```

**결과물을 Read 도구로 직접 열어 눈으로 확인한다.** 규격이 맞는 것과
보기 좋은 것은 다른 문제다. 큰 PNG는 `sips -Z 900`으로 축소본을 만들어 본다.

렌더 시 품질 경고가 뜨면(대비 부족, 카피 길이, 소스 비율 불일치) 사용자에게 전달하고
고칠지 묻는다. 경고는 렌더를 막지 않는다.

## 커맨드 요약

```
doctor     환경 점검 (playwright / chromium / simctl / adb)
init       appshot.config.json + screens/ 생성   [--platform] [--device] [--force]
devices    디바이스와 스토어 규격 목록            [--platform] [--json]
layouts    레이아웃 5종 설명                     [--json]
capture    시뮬레이터/기기에서 화면 캡처          --platform ios|android [--name]
render     스토어 스크린샷 생성                  [--only 1,3] [--preview] [--placeholder]
```

## 참고 문서

- `references/store-specs.md` — 스토어별 필수 규격과 실제 리젝 사유
- `references/copywriting.md` — 헤드라인 작성 원칙

## 주의

- 출력은 `{output}/{locale}/{device}/01.png` 형식으로 쌓인다. 로케일이 여럿이면
  `locale`을 바꿔가며 여러 번 렌더한다
- `deviceScaleFactor: 1`로 고정되어 있어 출력 크기가 항상 규격과 1:1이다.
  이 값을 건드리면 2배 크기로 나와 스토어가 리젝한다
- 폰트는 시스템 스택만 쓴다. 네트워크 폰트를 넣으면 렌더 결과가 재현되지 않는다
