#!/usr/bin/env -S node
import { randomBytes } from 'node:crypto';

interface Args {
  bytes: number;
  raw: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const output: Args = {
    bytes: 32,
    raw: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if ((token === '--bytes' || token === '-b') && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed)) {
        output.bytes = Math.floor(parsed);
      }
      index += 1;
      continue;
    }
    if (token === '--raw') {
      output.raw = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      output.help = true;
    }
  }

  return output;
}

function usage(): string {
  return [
    'Usage: pnpm token:generate -- [--bytes 32] [--raw]',
    '',
    'Options:',
    '  --bytes, -b  Number of random bytes before base64url encoding (16-128, default: 32)',
    '  --raw        Print only the token value',
    '  --help, -h   Show this help'
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  if (!Number.isInteger(args.bytes) || args.bytes < 16 || args.bytes > 128) {
    console.error('Invalid --bytes value. Expected an integer between 16 and 128.');
    process.exitCode = 1;
    return;
  }

  const token = randomBytes(args.bytes).toString('base64url');

  if (args.raw) {
    console.log(token);
    return;
  }

  console.log('Generated API token:');
  console.log(token);
  console.log('');
  console.log('Set this in your .env file:');
  console.log(`OPS_API_TOKEN=${token}`);
}

void main();
