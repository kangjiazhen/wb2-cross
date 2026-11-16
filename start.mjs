#!/usr/bin/env node
/**
 * 跨平台一键自检：接入两端（写配置 / 起 bridge / 装自启动），然后跑 doctor。
 * 额外参数会转发给 install，例如：
 *   node start.mjs --upstream https://api.deepseek.com --api-key sk-xxx
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const extra = process.argv.slice(2);
const run = (args) => spawnSync(process.execPath, [path.join(HERE, 'src', 'cli.mjs'), ...args], { stdio: 'inherit' });

const installed = run(['install', ...extra]);
if (installed.status !== 0) process.exit(installed.status ?? 1);
const r = run(['doctor', ...extra.filter((a) => a.startsWith('--upstream') || a.startsWith('--api-key') || a.startsWith('--port'))]);
process.exit(r.status ?? 0);
