# appshot

앱스토어/플레이스토어 등록용 마케팅 스크린샷 생성기.
앱 화면을 디바이스 목업(Android는 기본으로 기기 없는 화면 카드)에 넣고 카피와 배경을 얹어
**스토어 제출 규격에 픽셀 정확히 맞는 PNG**를 배치 생성한다.
스토어 공식 규정(해상도·금지 표현·카피 면적·상태바)을 `references/store-specs.md`에 원문 링크와 함께 정리해 두었다.

Claude Code 스킬(`~/.claude/skills/appshot`)로 쓰거나 CLI로 직접 쓴다.

## 설치

```bash
git clone <이 저장소> ~/Code/ScreenShotSkill
cd ~/Code/ScreenShotSkill
npm install
npx playwright install chromium
ln -s ~/Code/ScreenShotSkill ~/.claude/skills/appshot
```

## 사용

```bash
cd ~/내-앱-프로젝트

appshot doctor                                  # 환경 점검
appshot devices --platform ios                  # 지원 기기와 규격
appshot init --device iphone-17-pro-max         # config + screens/ 생성
appshot capture --platform ios                  # 시뮬레이터에서 화면 캡처
appshot layouts                                 # 레이아웃 5종 미리보기
appshot render --preview                        # 저해상도로 빠르게 확인
appshot render                                  # 제출용 원본
```

앱 화면이 아직 없어도 `appshot render --placeholder`로 카피와 레이아웃을 먼저
확정할 수 있다.

## 설계

**`canvas` ≠ `frame`.** 디바이스를 고르면 목업의 생김새(Dynamic Island / 노치 / 펀치홀 /
홈버튼)가 바뀌고, 출력 규격은 그 기기의 스토어 슬롯으로 고정된다. 그래서
Pixel 9와 Pixel 9 Pro XL은 규격이 같고 외형만 다르다.

**Android는 기본으로 기기를 그리지 않는다.** Google Play가 스크린샷에 기기 이미지를 피하라고
권장해서 `theme.deviceFrame`의 Android 기본값은 `false`다 — 앱 화면만 둥근 카드로 보여준다.
`true`로 켜면 기기 프레임이 돌아오고 경고가 뜬다. iOS 기본값은 `true`.

**기기는 카피를 덮지 않는다.** 기울인 레이아웃은 회전 후 bounding box로 크기를 역산하고,
카피가 아래에 있는 레이아웃은 남은 높이를 CSS container 단위로 재서 넘칠 때만 기기를 줄인다.
카피 크기가 캔버스 폭에 비례하므로 폭이 넓은 태블릿일수록 이 처리가 필요하다.

**프레임 크기는 세로 기준으로 역산한다.** 폭 비율을 고정하면 규격마다 결과가
무너진다 — iPhone 6.9"는 캔버스와 화면 비율이 같아 하단이 전혀 잘리지 않고,
Play Store 폰은 캔버스 16:9 / 화면 20:9라 반대로 과하게 잘린다.

**디바이스 목업은 이미지가 아니라 CSS 데이터다.** 베젤 두께·코너 반경·노치 형태를
`src/devices.js`에 수치로 두고 CSS로 생성한다. 라이선스 문제가 없고 새 기기 추가가
데이터 한 덩어리로 끝난다.

**하네스로 격리되어 있다.** 의존성·템플릿은 전부 이 폴더 안에 있고, 대상 프로젝트에는
`appshot.config.json`과 출력 폴더만 생긴다.

## 지원 기기

| Apple | 슬롯 | 규격 | | Android | 규격 |
|---|---|---|---|---|---|
| iPhone 17 Pro Max | 6.9" | 1290×2796 **필수**¹ | | Pixel 9 Pro XL | 1080×1920 **필수** |
| iPhone 14 Plus | 6.5" | 1284×2778 | | Pixel 9 | 1080×1920 |
| iPhone 8 Plus | 5.5" | 1242×2208 | | Galaxy S25 Ultra | 1080×1920 |
| iPad Pro 13" | 13" | 2064×2752 **필수**² | | Galaxy Tab S10 | 1440×2560 (9:16) |
| iPad Air 11" | 11" | 1668×2388 | | | |

¹ 6.9"와 6.5" 중 하나가 필수다. ² iPad에서 도는 앱일 때. 기기 이름은 App Store Connect 슬롯별 기기 목록을 따른다.

## 레이아웃

`caption-top` · `caption-bottom` · `angled` · `fullbleed` · `duo`

스크린마다 다르게 고를 수 있다. 파노라마(배경이 여러 장에 걸쳐 이어지는 구성)는
레이아웃이 아니라 배경 옵션(`theme.background.panorama`)이라 어느 레이아웃과도
조합된다.

## 품질 게이트

경고는 렌더가 끝난 뒤 한 블록으로 출력되고, 렌더를 막지는 않는다.

가독성
- 대비 (WCAG AA 큰 텍스트 기준 3:1)
- 헤드라인 길이 (한글 18자 / 영문 32자)
- 서브카피 줄 수 (2줄)
- 소스 이미지 비율 (기기 화면과 ±3%)
- 소스 해상도 (렌더 폭 이상)

스토어 정책
- 금지 표현 — 가격·할인, 순위·최상급 (양쪽) / 신규·설치 유도·다운로드 수 (Play)
- 장수 — Play 추천 노출 4장 미만, 최대 iOS 10 / Android 8 초과
- 카피 면적 — 이미지의 20% 초과 (Play, 렌더 중 측정)
- 기기 이미지 — Android에서 `deviceFrame`을 켰을 때 (Play 권장)
- 태블릿 텍스트 — Android 태블릿에 카피가 있을 때 (Play 대형 화면 권장)

깨진 소스 이미지(0바이트·잘린 파일·이미지가 아닌 파일)는 경고가 아니라 에러로 중단한다.

## 캡처

`appshot capture`는 상태바를 스토어 권장 상태로 정리해서 찍는다 — iOS는 `simctl status_bar`로
9:41·신호·배터리 가득, Android는 SystemUI demo mode로 알림 숨김·아이콘 가득. 찍고 나면 원래대로
되돌리고, 시뮬레이터에 사용자가 걸어둔 상태바 설정이 있으면 건드리지 않는다.

## 문서

- `references/store-specs.md` — 스토어 공식 규정 요약(원문 링크), appshot 처리 범위, 실제 리젝 사유
- `references/copywriting.md` — 헤드라인 작성 원칙
