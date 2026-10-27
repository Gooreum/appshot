import fs from 'node:fs';
import path from 'node:path';
import { DEVICES, FEATURE_GRAPHIC, PLATFORMS, PREVIEW_SCALE, canvasLabel } from './devices.js';
import { imageSize } from './quality.js';
import { listCombos, expandConfig } from './expand.js';
import { OVERVIEW_FILE } from './overview.js';
import { configPath } from './config.js';
import { readMarker } from './placeholder-marker.js';

/*
 * 제출 전 점검 — 출력 폴더가 스토어 제출 요건을 채웠는지 읽기만 하고 판정한다.
 *
 * 판정은 두 층이다.
 *   폴더 전체: 로케일마다 필수 슬롯이 채워졌는지, 각 PNG가 규격 해상도인지, 장수가 범위 안인지.
 *   현재 config 대상 조합(listCombos)만: 오래된 파일(stale), config에 없는 장(orphan), 번호 빠짐(gap 에러),
 *     번역 누락 대체(copy-missing 경고). stale이 없으면 지금 config로 펼친 카피가 곧 렌더된 카피라 다시 펼쳐 판정한다.
 *   다른 로케일·기기 폴더는 지금 config와 비교할 근거가 없어 stale을 판정하지 않는다(not-current 정보).
 * 슬롯은 storeSlot 문자열로 묶어 본다 — iPhone은 6.9"와 6.5" 중 하나면 되고, Play 폰 3종은 같은 슬롯이다.
 * Play 피처 그래픽은 기기 폴더가 아니라 {locale}/feature-graphic.png라 scanFeatureGraphics로 따로 읽는다.
 * 자리표시자 표시(.appshot-placeholder.json)가 남은 장은 config 대상 여부와 무관하게 placeholder-render 에러다.
 */

const SHOT_RE = /^(\d{2})\.(png|jpe?g)$/i;
const IGNORED_DIRS = new Set(['_preview']);
const pad2 = (n) => String(n).padStart(2, '0');
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const mtimeOf = (file) => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };

/**
 * {output} 폴더를 { locale: { deviceId: [{ name, index, file, size, mtimeMs, placeholder }] } } 로 읽는다. 폴더가 없으면 null.
 * placeholder: 자리표시자 사유 배열 또는 null
 */
export function scanOutput(outRoot) {
  if (!fs.existsSync(outRoot)) return null;
  const scan = {};
  for (const locale of subdirs(outRoot)) {
    if (IGNORED_DIRS.has(locale)) continue;
    scan[locale] = {};
    for (const device of subdirs(path.join(outRoot, locale))) {
      const dir = path.join(outRoot, locale, device);
      const marker = readMarker(dir);
      scan[locale][device] = fs.readdirSync(dir)
        .filter((name) => name !== OVERVIEW_FILE && !name.startsWith('.'))
        .sort()
        .map((name) => {
          const file = path.join(dir, name);
          const m = name.match(SHOT_RE);
          let size = null;
          if (m) { try { size = imageSize(file); } catch { size = null; } }
          return { name, index: m ? Number(m[1]) : null, file, size, mtimeMs: mtimeOf(file), placeholder: markerReasons(marker, name) };
        });
    }
  }
  return scan;
}

/** 로케일 폴더 바로 아래의 피처 그래픽을 { locale: { name, file, size, mtimeMs, placeholder } | null } 로 읽는다. 폴더가 없으면 null. */
export function scanFeatureGraphics(outRoot) {
  if (!fs.existsSync(outRoot)) return null;
  const out = {};
  for (const locale of subdirs(outRoot)) {
    if (IGNORED_DIRS.has(locale)) continue;
    const file = path.join(outRoot, locale, FEATURE_GRAPHIC.file);
    if (!fs.existsSync(file)) { out[locale] = null; continue; }
    let size = null;
    try { size = imageSize(file); } catch { size = null; }
    out[locale] = {
      name: FEATURE_GRAPHIC.file, file, size, mtimeMs: mtimeOf(file),
      placeholder: markerReasons(readMarker(path.join(outRoot, locale)), FEATURE_GRAPHIC.file),
    };
  }
  return out;
}

/** 표시에서 name의 사유. 깨진 표시('*')는 폴더의 모든 결과물에 해당한다. */
function markerReasons(marker, name) {
  const reasons = marker['*'] ?? marker[name];
  return Array.isArray(reasons) && reasons.length ? reasons : null;
}

/**
 * 판정. { ok, rows, problems } 를 돌려준다.
 * featureGraphics: scanFeatureGraphics 결과. Play면 로케일마다 피처 그래픽을 판정한다(없으면 전부 누락).
 * problems: [{ level: 'error'|'warn'|'info', code, locale, device, file, message }]
 * rows:     [{ locale, device, label, slot, canvas, count, current, errors }] — 표 출력용
 */
export function evaluate(scan, cfg, { cwd = process.cwd(), ipad = false, featureGraphics = null } = {}) {
  const problems = [];
  const rows = [];
  const add = (level, code, where, message) =>
    problems.push({ level, code, locale: null, device: null, file: null, ...where, message });
  const errorCount = () => problems.filter((p) => p.level === 'error').length;

  if (!scan || !Object.values(scan).some((d) => Object.keys(d).length)) {
    add('error', 'no-output', {}, `아직 렌더한 결과가 없습니다: ${cfg.output} → 'appshot render'`);
    return { ok: false, rows, problems };
  }

  const platform = PLATFORMS[cfg.platform];
  const combos = listCombos(cfg);
  // config가 태블릿 기기를 대상으로 삼으면 iPad 앱이다 — 모든 로케일에서 13" 슬롯을 요구한다
  const wantTablet = ipad || combos.some((c) => DEVICES[c.device]?.formFactor === 'tablet');
  const current = new Set(combos.map((c) => `${c.locale}/${c.device}`));
  const allFlag = combos.length > 1 ? ' --all' : '';
  for (const c of combos) {
    if (!scan[c.locale]?.[c.device]) {
      add('error', 'locale-missing', { locale: c.locale, device: c.device }, `config 대상 폴더가 없습니다 → 'appshot render${allFlag}'`);
    }
  }

  const slotsByLocale = {};
  for (const [locale, devs] of Object.entries(scan)) {
    const slots = new Map(); // storeSlot → [{ id, count, formFactor }]
    for (const [id, entries] of Object.entries(devs)) {
      const device = DEVICES[id];
      const where = { locale, device: id };
      if (!device || device.platform !== cfg.platform) {
        add('warn', 'unknown-entry', where, `알 수 없는 기기 폴더입니다 (${cfg.platform} 기기가 아님) — 업로드 전에 치우세요`);
        continue;
      }
      for (const e of entries) {
        if (e.index === null) add('warn', 'unknown-entry', { ...where, file: e.name }, 'NN.png 형식이 아닌 파일입니다 — 업로드 전에 치우세요');
      }
      const shots = entries.filter((e) => e.index !== null).sort((a, b) => a.index - b.index);
      const before = errorCount();

      checkSizes(shots, device, where, add);
      checkPlaceholder(shots, where, add);
      checkCounts(shots.length, device, platform, where, add);

      const isCurrent = current.has(`${locale}/${id}`);
      const indices = new Set(shots.map((e) => e.index));
      let expectN = Math.max(0, ...indices);
      if (isCurrent) {
        const { config, warnings } = expandConfig(cfg, { locale, device: id });
        expectN = config.screens.length;
        checkCurrent(shots, config, where, cwd, add);
        checkCopyFallback(shots, warnings, where, allFlag, add);
      }
      const gaps = range(1, expectN).filter((i) => !indices.has(i));
      if (gaps.length) {
        add(isCurrent ? 'error' : 'warn', 'gap', where,
          `번호가 빠졌습니다: ${gaps.map(pad2).join(', ')}${isCurrent ? " → 'appshot render'" : ''}`);
      }

      const list = slots.get(device.storeSlot) ?? [];
      list.push({ id, count: shots.length, formFactor: device.formFactor });
      slots.set(device.storeSlot, list);
      rows.push({
        locale, device: id, label: device.label, slot: device.storeSlot, canvas: canvasLabel(device),
        count: shots.length, current: isCurrent, errors: errorCount() - before,
      });
    }
    checkRequired(slots, platform, { locale }, wantTablet, add);
    for (const [slot, ids] of slots) {
      if (ids.length > 1) {
        add('warn', 'slot-duplicate', { locale },
          `'${slot}' 슬롯을 쓰는 폴더가 ${ids.length}개입니다 (${ids.map((x) => x.id).join(', ')}) — 하나만 올리면 됩니다`);
      }
    }
    slotsByLocale[locale] = new Set(slots.keys());
  }

  checkLocaleDiff(slotsByLocale, add);
  for (const r of rows) {
    if (!r.current) add('info', 'not-current', { locale: r.locale, device: r.device }, '현재 config 대상이 아니라 오래됐는지는 판정하지 않습니다');
  }
  if (platform?.featureGraphic) {
    const currentLocales = new Set(combos.map((c) => c.locale));
    for (const locale of Object.keys(scan)) {
      const before = errorCount();
      const entry = featureGraphics?.[locale] ?? null;
      const isCurrent = currentLocales.has(locale);
      const expanded = isCurrent ? expandConfig(cfg, combos.find((c) => c.locale === locale)) : null;
      checkFeatureGraphic(entry, expanded?.config ?? null, { locale }, cwd, add);
      if (entry && expanded) {
        const fgWarnings = expanded.warnings.filter((w) => w.field?.startsWith('featureGraphic.'));
        checkCopyFallback([{ ...entry, index: null }], fgWarnings, { locale }, allFlag, add);
      }
      rows.push({
        locale, device: 'feature-graphic', label: FEATURE_GRAPHIC.label, slot: FEATURE_GRAPHIC.label,
        canvas: canvasLabel(FEATURE_GRAPHIC), count: entry ? 1 : 0, current: isCurrent, errors: errorCount() - before,
      });
    }
  }
  return { ok: !problems.some((p) => p.level === 'error'), rows, problems };
}

/** 해상도 — 프리뷰 축소 크기와 정확히 같으면 "프리뷰가 원본을 덮었다"고 명시한다. */
function checkSizes(shots, device, where, add) {
  const { canvas } = device;
  const preview = { w: Math.round(canvas.w * PREVIEW_SCALE), h: Math.round(canvas.h * PREVIEW_SCALE) };
  for (const e of shots) {
    const at = { ...where, file: e.name };
    if (!e.size) {
      add('error', 'size-mismatch', at, "해상도를 읽을 수 없습니다 (PNG/JPEG 헤더 손상) → 'appshot render'로 재렌더");
    } else if (e.size.w === preview.w && e.size.h === preview.h) {
      add('error', 'preview-size', at, `${e.size.w}×${e.size.h} — 프리뷰 해상도입니다. 프리뷰가 원본을 덮었습니다 → 'appshot render'로 재렌더`);
    } else if (e.size.w !== canvas.w || e.size.h !== canvas.h) {
      add('error', 'size-mismatch', at, `${e.size.w}×${e.size.h} — 규격 ${canvasLabel(device)}과 다릅니다 → 'appshot render'로 재렌더`);
    }
  }
}

const PLACEHOLDER_REASON = {
  screen: '자리표시자 화면으로 만든 결과물입니다',
  background: '배경 이미지 없이 그라디언트로 렌더했습니다',
  font: '브랜드 폰트 없이 시스템 폰트로 렌더했습니다',
  corrupt: '자리표시자 표시 파일이 깨져 실제 화면으로 만든 결과물인지 알 수 없습니다',
};

/** 자리표시자 — render --placeholder가 대체한 화면·에셋이 남은 장은 제출할 수 없다. */
function checkPlaceholder(shots, where, add) {
  for (const e of shots) {
    if (!e.placeholder) continue;
    const why = e.placeholder.map((r) => PLACEHOLDER_REASON[r] ?? `자리표시자로 렌더했습니다(${r})`).join(', ');
    add('error', 'placeholder-render', { ...where, file: e.name }, `${why} → 실제 화면·에셋을 넣고 'appshot render'로 재렌더`);
  }
}

/** 장수 — 슬롯당 범위, Play 폰 추천 노출 조건 */
function checkCounts(n, device, platform, where, add) {
  const { shots, recommendMin, store } = platform;
  if (n > shots.max) add('error', 'count-max', where, `${n}장 — ${store}는 기기 유형당 최대 ${shots.max}장입니다. 넘치는 장을 지우세요`);
  if (n < shots.min) add('error', 'count-min', where, `${n}장 — 이 슬롯은 최소 ${shots.min}장이 필요합니다 → 'appshot render'`);
  if (recommendMin && device.formFactor === 'phone' && n < recommendMin) {
    add('warn', 'count-recommend', where, `${n}장 — Google Play 추천 영역에 노출되려면 ${recommendMin}장 이상이 필요합니다`);
  }
}

/** 현재 config 대상 폴더만: config에 없는 장, 소스·config보다 오래된 결과물 */
function checkCurrent(shots, config, where, cwd, add) {
  const N = config.screens.length;
  const abs = (p) => (p ? path.resolve(cwd, p) : null);
  const base = Math.max(mtimeOf(configPath(cwd)), mtimeOf(abs(config.theme?.background?.source)));
  for (const e of shots) {
    const at = { ...where, file: e.name };
    if (e.index > N) {
      add('error', 'orphan', at, `config에 없는 장입니다 (screens는 ${N}장) — 지우거나 screens에 추가하세요`);
      continue;
    }
    const s = config.screens[e.index - 1];
    const latest = Math.max(base, mtimeOf(abs(s.source)), mtimeOf(abs(s.source2)));
    if (latest > e.mtimeMs) add('error', 'stale', at, "소스 또는 config가 결과보다 나중에 수정됐습니다 → 'appshot render'로 재렌더");
  }
}

/**
 * 현재 config 대상만: 번역이 없어 다른 로케일 문구로 렌더된 장. 파일이 있는 장에만 단다(없는 장은 gap이 잡는다).
 * expandWarnings: expandConfig의 경고. screen이 shot.index와 같은 copy-missing을 그 파일에 붙인다.
 */
function checkCopyFallback(shots, expandWarnings, where, allFlag, add) {
  for (const w of expandWarnings) {
    if (w.code !== 'copy-missing') continue;
    const e = shots.find((s) => s.index === w.screen);
    if (e) add('warn', 'copy-missing', { ...where, file: e.name }, `${w.message.replace(/\.$/, '')} → config에 번역을 채우고 'appshot render${allFlag}'`);
  }
}

/**
 * Play 피처 그래픽 — 누락·규격·프리뷰 덮어쓰기, 현재 config 로케일이면 stale까지.
 * config는 그 로케일로 펼친 단일 config(현재 대상이 아니면 null).
 */
function checkFeatureGraphic(entry, config, where, cwd, add) {
  const { canvas, file } = FEATURE_GRAPHIC;
  const at = { ...where, file };
  if (!entry) {
    const hint = config && !config.featureGraphic ? ' — config에 featureGraphic을 추가하고' : ' →';
    add('error', 'missing-feature-graphic', at, `Google Play 필수 자산인 피처 그래픽(${canvas.w}×${canvas.h})이 없습니다${hint} 'appshot render'`);
    return;
  }
  checkSizes([entry], FEATURE_GRAPHIC, where, add); // canvas만 보므로 기기 대신 규격을 넘긴다
  checkPlaceholder([entry], where, add);
  if (!config) return;
  const abs = (p) => (p ? path.resolve(cwd, p) : null);
  const latest = Math.max(
    mtimeOf(configPath(cwd)), mtimeOf(abs(config.theme?.background?.source)), mtimeOf(abs(config.featureGraphic?.source)),
  );
  if (latest > entry.mtimeMs) add('error', 'stale', at, "소스 또는 config가 결과보다 나중에 수정됐습니다 → 'appshot render'로 재렌더");
}

/** 로케일마다 필수 슬롯 — OR 묶음, 조건부 iPad, Play 합계 */
function checkRequired(slots, platform, where, ipad, add) {
  const filled = (slot) => (slots.get(slot) ?? []).some((x) => x.count > 0);
  for (const group of platform.requiredSlots ?? []) {
    if (!group.some(filled)) add('error', 'missing-required', where, `${group.join(' 또는 ')} 슬롯이 비었습니다 → 해당 기기로 'appshot render'`);
  }
  if (platform.tabletSlot) {
    const hasTablet = [...slots.values()].flat().some((x) => x.formFactor === 'tablet');
    if ((hasTablet || ipad) && !filled(platform.tabletSlot)) {
      add('error', 'missing-required', where, `${platform.tabletSlot} 슬롯이 비었습니다 (iPad 앱이면 필수) → 'ipad-pro-13'으로 'appshot render'`);
    }
  }
  if (platform.totalMin) {
    const total = [...slots.values()].flat().reduce((s, x) => s + x.count, 0);
    if (total < platform.totalMin) add('error', 'missing-required', where, `${platform.store}는 기기 유형을 합쳐 최소 ${platform.totalMin}장이 필요합니다 — 지금 ${total}장`);
  }
}

/** 어떤 슬롯이 일부 로케일에만 있으면 알린다 (App Store는 기본 언어로 대체하므로 경고) */
function checkLocaleDiff(slotsByLocale, add) {
  const locales = Object.keys(slotsByLocale);
  if (locales.length < 2) return;
  const union = new Set(locales.flatMap((l) => [...slotsByLocale[l]]));
  for (const slot of union) {
    const have = locales.filter((l) => slotsByLocale[l].has(slot));
    if (have.length < locales.length) {
      add('warn', 'locale-diff', {}, `'${slot}' 슬롯이 ${have.join(', ')}에만 있습니다 (${locales.filter((l) => !have.includes(l)).join(', ')} 없음 — App Store는 기본 언어로 대체)`);
    }
  }
}
