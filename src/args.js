/**
 * 최소 인자 파서. 서브커맨드 + 롱플래그만 지원한다.
 *   appshot render --only 1,3 --preview --device iphone-17-pro-max
 *
 * 값이 없는 플래그(--preview, --json)는 boolean true가 된다.
 * --only 는 쉼표 구분 정수 배열로, --scale 은 수로 정규화한다.
 */
const BOOLEAN_FLAGS = new Set(['preview', 'json', 'force', 'help', 'quiet', 'placeholder']);
const NUMBER_LIST_FLAGS = new Set(['only']);

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  const positional = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    // --key=value 형태도 받는다
    let key = token.slice(2);
    let value;
    const eq = key.indexOf('=');
    if (eq !== -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }

    if (value === undefined) {
      if (BOOLEAN_FLAGS.has(key)) {
        value = true;
      } else {
        const next = rest[i + 1];
        if (next === undefined || next.startsWith('--')) {
          value = true; // 값 없는 미지의 플래그도 boolean 취급
        } else {
          value = next;
          i++;
        }
      }
    }

    if (NUMBER_LIST_FLAGS.has(key) && typeof value === 'string') {
      value = value
        .split(',')
        .map((n) => Number.parseInt(n.trim(), 10))
        .filter((n) => Number.isInteger(n));
    }

    opts[camel(key)] = value;
  }

  return { command, opts, positional };
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
