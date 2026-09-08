#!/usr/bin/env node
import { parseArgs } from '../src/args.js';

const COMMANDS = {
  doctor:  { desc: '실행 환경 점검 (playwright / chromium / simctl / adb)', usage: 'appshot doctor' },
  init:    { desc: 'appshot.config.json + screens/ 스캐폴딩',              usage: 'appshot init [--platform ios|android] [--device <id>]' },
  devices: { desc: '지원 디바이스와 스토어 제출 규격 목록',                  usage: 'appshot devices [--platform ios|android] [--json]' },
  layouts: { desc: '레이아웃 5종 설명',                                     usage: 'appshot layouts [--json]' },
  capture: { desc: '시뮬레이터/기기에서 앱 화면 캡처 → screens/',            usage: 'appshot capture --platform ios|android [--name <파일명>]' },
  render:  { desc: 'config를 읽어 스토어 스크린샷 생성',                     usage: 'appshot render [--only 1,3] [--preview] [--placeholder]' },
};

function printUsage() {
  console.log(`
appshot — App Store / Play Store 마케팅 스크린샷 생성기

  사용법: appshot <command> [options]

  커맨드:`);
  for (const [name, { desc }] of Object.entries(COMMANDS)) {
    console.log(`    ${name.padEnd(10)}${desc}`);
  }
  console.log(`
  예시:
    appshot doctor
    appshot init --platform ios --device iphone-17-pro-max
    appshot devices --platform android
    appshot render --preview
`);
}

async function main() {
  const { command, opts, positional } = parseArgs(process.argv.slice(2));

  if (!command || opts.help) {
    printUsage();
    return 0;
  }

  if (!Object.hasOwn(COMMANDS, command)) {
    console.error(`Unknown command: ${command}\n`);
    printUsage();
    return 1;
  }

  let mod;
  try {
    mod = await import(`../src/commands/${command}.js`);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(`'${command}'는 아직 구현되지 않았습니다.`);
      console.error(`  ${COMMANDS[command].usage}`);
      return 1;
    }
    throw err;
  }

  return (await mod.run({ opts, positional })) ?? 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\nappshot: ${err.message}\n`);
    if (process.env.APPSHOT_DEBUG) console.error(err.stack);
    process.exit(1);
  });
