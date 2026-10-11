/**
 * 다중 config → 단일 config 펼치기.
 *
 * config 하나에 devices[]·locales[]·로케일별 카피 맵을 적으면, 조합마다 기존 renderAll이 받는
 * 단일 config로 펼친다. 펼친 결과는 validateConfig / renderAll / html.js가 그대로 받는 모양이라
 * 렌더 쪽 코드는 손대지 않는다. 원본 config는 바꾸지 않고 새 객체를 돌려준다.
 */

/** 로케일 × 기기 조합. 배열이 없으면 스칼라 값 1개. 순서는 locales 바깥, devices 안쪽. */
export function listCombos(cfg) {
  const locales = Array.isArray(cfg.locales) && cfg.locales.length ? cfg.locales : [cfg.locale];
  const devices = Array.isArray(cfg.devices) && cfg.devices.length ? cfg.devices : [cfg.device];
  return locales.flatMap((locale) => devices.map((device) => ({ locale, device })));
}

/** --all 없이 렌더할 조합: 스칼라 device/locale이 있으면 그것, 없으면 각 배열의 첫 번째. */
export function defaultCombo(cfg) {
  const [first] = listCombos(cfg);
  return { locale: cfg.locale ?? first.locale, device: cfg.device ?? first.device };
}

/**
 * 한 조합의 단일 config와 펼치기 경고를 돌려준다.
 * - 카피 맵은 해당 로케일 문자열로 확정한다. 번역이 없으면 locales 순서 → 첫 키 순으로 대체하고
 *   copy-missing 경고를 남긴다 (품질 점검은 렌더를 막지 않는다는 원칙).
 * - source / source2 / theme.background.source의 {locale}·{device} 토큰을 치환한다.
 */
export function expandConfig(cfg, { locale, device }) {
  const warnings = [];
  const locales = Array.isArray(cfg.locales) ? cfg.locales : null;
  const sub = (s) => (typeof s === 'string' ? s.replaceAll('{locale}', locale).replaceAll('{device}', device) : s);
  const warn = (i, code, message) => warnings.push({ level: 'warn', screen: i + 1, code, message });

  const pick = (value, field, i) => {
    if (typeof value !== 'object' || value === null) return value;
    if (locales) {
      for (const k of Object.keys(value)) {
        if (!locales.includes(k)) warn(i, 'copy-unknown-locale', `${field}의 '${k}'는 locales에 없는 로케일입니다. 오타가 아닌지 확인하세요.`);
      }
    }
    if (typeof value[locale] === 'string') return value[locale];
    const fallback = (locales ?? []).find((l) => typeof value[l] === 'string')
      ?? Object.keys(value).find((k) => typeof value[k] === 'string');
    if (fallback === undefined) return '';
    warn(i, 'copy-missing', `${field}에 '${locale}' 번역이 없어 '${fallback}' 문구로 렌더했습니다.`);
    return value[fallback];
  };

  const screens = cfg.screens.map((s, i) => {
    const out = { ...s, source: sub(s.source), headline: pick(s.headline, 'headline', i) };
    if (s.source2 !== undefined) out.source2 = sub(s.source2);
    if (s.subhead !== undefined) out.subhead = pick(s.subhead, 'subhead', i);
    return out;
  });

  const bg = cfg.theme?.background;
  const theme = bg?.source ? { ...cfg.theme, background: { ...bg, source: sub(bg.source) } } : cfg.theme;
  const { devices: _devices, locales: _locales, ...rest } = cfg;
  return { config: { ...rest, locale, device, theme, screens }, warnings };
}
