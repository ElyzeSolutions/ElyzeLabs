#!/usr/bin/env node
import fs from 'node:fs';

import YAML from 'yaml';

const configRaw = fs.readFileSync('config/control-plane.yaml', 'utf8');
const config = YAML.parse(configRaw);

const failures = [];
const hasNonEmptyEnv = (...keys) =>
  keys.some((key) => typeof process.env[key] === 'string' && process.env[key].trim().length > 0);
const isSecretRef = (value) => typeof value === 'string' && (value.startsWith('vault://') || value.startsWith('env:'));

if (config?.persistence?.sqlitePath === undefined) {
  failures.push('persistence.sqlitePath must be configured for local-first default mode.');
}

if (
  config?.memory?.embedding?.provider === 'voyage' &&
  !config?.memory?.embedding?.voyageApiKey &&
  !isSecretRef(config?.memory?.embedding?.voyageApiKey) &&
  !hasNonEmptyEnv('OPS_VOYAGE_API_KEY', 'VOYAGE_API_KEY') &&
  !config?.vault?.enabled
) {
  failures.push('Voyage provider cannot be default without an explicit key. Use noop by default.');
}

if (
  config?.channel?.telegram?.enabled === true &&
  !config?.channel?.telegram?.botToken &&
  !isSecretRef(config?.channel?.telegram?.botToken) &&
  !hasNonEmptyEnv('OPS_TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN') &&
  !config?.vault?.enabled
) {
  failures.push('Telegram enabled mode requires a bot token from config, env, or vault.');
}

if (failures.length > 0) {
  console.error('Lightweight guardrails failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Lightweight guardrails passed.');
}
