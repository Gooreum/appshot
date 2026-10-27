import path from 'node:path';
import { DEVICES } from './devices.js';
import { UPLOAD_DIR } from './status.js';

/*
 * 업로드용 내보내기 계획 — status 판정(evaluate) 결과를 받아 무엇을 어디로 복사할지만 정한다. fs 쓰기는 없다.
 *
 * 복사 대상은 result.rows에 오른 기기 폴더의 NN.png뿐이다. unknown-entry 폴더는 rows에 없고,
 * NN 형식이 아닌 파일(index === null)도 빠진다. overview.png·_preview·_upload는 스캔 단계에서 이미 걸러진다.
 *
 * 경로:
 *   기본            {output}/_upload/{locale}/{device}/NN.png, 피처 그래픽은 {output}/_upload/{locale}/feature-graphic.png
 *   --fastlane iOS  {cwd}/fastlane/screenshots/{ascLocale}/{device}-NN.png  (deliver는 해상도로 기기를 가리고 이름순 정렬)
 *   --fastlane Play {cwd}/fastlane/metadata/android/{playLocale}/images/{phone|tenInch}Screenshots/NN.png, images/featureGraphic.png
 */

/** appshot 로케일 → 스토어 로케일 코드. 표에 없으면 그대로 쓰고 locale-unmapped 경고. */
export const STORE_LOCALES = {
  ko: { asc: 'ko', play: 'ko-KR' },
  en: { asc: 'en-US', play: 'en-US' },
  ja: { asc: 'ja', play: 'ja-JP' },
  zh: { asc: 'zh-Hans', play: 'zh-CN' },
};

const REGIONAL_RE = /^[a-z]{2,3}-[A-Za-z0-9]{2,4}$/; // en-US, zh-Hans 처럼 이미 스토어 형태
const PLAY_DIRS = { phone: 'phoneScreenshots', tablet: 'tenInchScreenshots' };

/** { code, mapped } — mapped가 false면 표에 없어 그대로 쓴 것 */
export function storeLocale(locale, store) {
  if (REGIONAL_RE.test(locale)) return { code: locale, mapped: true };
  const hit = STORE_LOCALES[locale]?.[store];
  return hit ? { code: hit, mapped: true } : { code: locale, mapped: false };
}

/**
 * { root, copies: [{ from, to, locale, device, current }], targets: [{ dir, base }], problems }
 * targets: 복사 전에 비어 있어야 하는 fastlane 이미지 자리. base가 있으면 그 이름(확장자 제외)의 파일만 본다.
 * problems: status와 같은 모양 — 에러가 있으면 복사하지 않는다.
 */
export function planExport({ scan, featureGraphics, result, platform, fastlane = false, outRoot, cwd = process.cwd() }) {
  const copies = [];
  const targets = new Map(); // `${dir}|${base}` → target
  const problems = [];
  const add = (level, code, where, message) =>
    problems.push({ level, code, locale: null, device: null, file: null, ...where, message });
  const target = (dir, base = null) => targets.set(`${dir}|${base}`, { dir, base });

  const store = platform === 'android' ? 'play' : 'asc';
  const root = fastlane
    ? path.join(cwd, 'fastlane', platform === 'android' ? path.join('metadata', 'android') : 'screenshots')
    : path.join(outRoot, UPLOAD_DIR);

  // 로케일 코드 — fastlane만 스토어 코드로 바꾼다. 둘이 같은 코드로 모이면 섞이므로 에러.
  const codeOf = new Map();
  if (fastlane) {
    const byCode = new Map();
    for (const locale of new Set(result.rows.map((r) => r.locale))) {
      const { code, mapped } = storeLocale(locale, store);
      if (!mapped) add('warn', 'locale-unmapped', { locale }, `스토어 로케일 표에 없어 '${code}' 그대로 씁니다 — 스토어 코드와 다르면 폴더 이름을 바꾸세요`);
      codeOf.set(locale, code);
      byCode.set(code, [...(byCode.get(code) ?? []), locale]);
    }
    for (const [code, locales] of byCode) {
      if (locales.length > 1) add('error', 'locale-collision', {}, `${locales.join(', ')}가 모두 '${code}'로 내보내집니다 — 하나만 남기세요`);
    }
  }

  const playDirOwner = new Map(); // fastlane Play: 이미지 폴더 → 기기 id (폴더 하나에 기기 하나)
  for (const row of result.rows) {
    const { locale, device: id, current } = row;
    const code = codeOf.get(locale) ?? locale;

    if (id === 'feature-graphic') { // evaluate가 피처 그래픽에 붙이는 행 id
      const fg = featureGraphics?.[locale];
      if (!fg) continue;
      const ext = path.extname(fg.name);
      const images = path.join(root, code, 'images');
      const to = fastlane ? path.join(images, `featureGraphic${ext}`) : path.join(root, locale, fg.name);
      if (fastlane) target(images, 'featureGraphic');
      copies.push({ from: fg.file, to, locale, device: id, current });
      continue;
    }

    let dir;
    let name = (e) => e.name;
    if (!fastlane) {
      dir = path.join(root, locale, id);
    } else if (platform === 'android') {
      dir = path.join(root, code, 'images', PLAY_DIRS[DEVICES[id].formFactor] ?? PLAY_DIRS.phone);
      const owner = playDirOwner.get(dir);
      if (owner && owner !== id) {
        add('error', 'slot-duplicate', { locale },
          `${owner}와 ${id}가 같은 fastlane 폴더(${path.basename(dir)})로 갑니다 — 현재 config 대상 기기만 남기거나 다른 폴더를 치우세요`);
        continue;
      }
      playDirOwner.set(dir, id);
    } else {
      dir = path.join(root, code);
      name = (e) => `${id}-${e.name}`;
    }
    if (fastlane) target(dir);
    const shots = (scan[locale]?.[id] ?? []).filter((e) => e.index !== null).sort((a, b) => a.index - b.index);
    for (const e of shots) copies.push({ from: e.file, to: path.join(dir, name(e)), locale, device: id, current });
  }

  return { root, copies, targets: [...targets.values()], problems };
}
