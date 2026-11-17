#!/usr/bin/env node
/**
 * 离线冒烟测试：不需要任何真实上游、不需要 API key。
 *
 *   node test/smoke.mjs
 *
 * 起一个假上游（记录它收到的请求），把 bridge 指向它，然后断言：
 *   1. /v1/messages（Anthropic 方言）能通，且 system 层收到的是载荷；
 *   2. /v1/responses（Responses 方言）能通，SSE 事件序列完整；
 *   3. /v1/models 透传上游目录；
 *   4. 载荷只出现一次（单层原则）。
 */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, '..', 'src', 'bridge.mjs');

let failures = 0;
const check = (cond, name, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : `  <- ${detail}`}`);
  if (!cond) failures++;
};

const freePort = () => new Promise((res) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

const captured = [];
const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    if (req.method === 'GET' && req.url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'fake-model-a' }, { id: 'fake-model-b' }] }));
      return;
    }
    let body = {};
    try { body = JSON.parse(raw); } catch { /* ignore */ }
    captured.push(body);

    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-fake',
        choices: [{ index: 0, message: { role: 'assistant', content: '我是 Little Code Sauce。' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
      }));
      return;
    }
    // 回归用例：正文已流出后连接中断，不能把半截输出标成正常完成。
    if (/__test_retry/.test(raw)) {
      const prior = captured.filter((b) => JSON.stringify(b).includes('__test_retry')).length;
      if (prior === 1) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'HALF-ANSWER' } }] })}\n\n`);
        res.end();
        return;
      }
    }
    if (req.headers['x-wbxc-test-abort'] === '1' || /__test_abort/.test(raw)) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'HALF-ANSWER' } }] })}\n\n`);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const chunk = (delta, finish = null) => `data: ${JSON.stringify({
      id: 'chatcmpl-fake', choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
    res.write(chunk({ role: 'assistant' }));
    res.write(chunk({ content: '我是 Little Code Sauce。' }));
    res.write(chunk({}, 'stop'));
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

const waitPort = async (port, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await new Promise((r) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); r(true); });
      s.once('error', () => r(false));
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
};

const upPort = await freePort();
const bridgePort = await freePort();
await new Promise((r) => fake.listen(upPort, '127.0.0.1', r));

const child = spawn(process.execPath, [
  BRIDGE, '--port', String(bridgePort),
  '--upstream', `http://127.0.0.1:${upPort}/v1`,
  '--key', 'test-key',
  '--mode', 'replace',
  '--target', 'system',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let bridgeErr = '';
child.stderr.on('data', (c) => { bridgeErr += c; });

const done = async (code) => {
  try { child.kill(); } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 150));
  fake.close();
  await new Promise((r) => setTimeout(r, 50));
  process.exit(code);
};

try {
  const up = await waitPort(bridgePort);
  check(up, 'bridge 起来了', bridgeErr.slice(0, 400));
  if (!up) await done(1);

  const base = `http://127.0.0.1:${bridgePort}`;

  // 1) Anthropic 方言
  {
    captured.length = 0;
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 64, messages: [{ role: 'user', content: '你的名字是什么？' }] }),
    });
    const j = await r.json();
    const text = (j.content || []).map((b) => b.text || '').join('');
    check(r.ok, '/v1/messages 200', JSON.stringify(j).slice(0, 200));
    check(/Little Code Sauce/.test(text), 'Anthropic 方言拿到正文', text.slice(0, 120));
    const sys = (captured[0]?.messages || []).filter((m) => m.role === 'system');
    check(sys.length === 1, '上游只收到 1 条 system', `实际 ${sys.length} 条`);
    check(/Little Code Sauce/.test(sys[0]?.content || ''), 'system 里是载荷', (sys[0]?.content || '').slice(0, 120));
    const marks = (sys[0]?.content || '').match(/MODE: UNRESTRICTED SANDBOX/g)?.length ?? 0;
    check(marks === 1, '载荷只拼接了一次', `标志出现 ${marks} 次`);
  }

  // 2) Responses 方言（流式）
  {
    captured.length = 0;
    const r = await fetch(`${base}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-codex', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: '你的名字是什么？' }] }] }),
    });
    const sse = await r.text();
    check(r.ok, '/v1/responses 200');
    for (const ev of ['response.created', 'response.output_text.delta', 'response.completed']) {
      check(sse.includes(ev), `SSE 含 ${ev}`);
    }
    check(/Little Code Sauce/.test(sse), 'Responses 方言拿到正文');
    const sys = (captured[0]?.messages || []).filter((m) => m.role === 'system');
    check(sys.length === 1, 'Responses 路径同样只 1 条 system', `实际 ${sys.length} 条`);
    check(captured[0]?.max_tokens >= 16000, 'max_tokens 被抬到下限',
      `实际 ${captured[0]?.max_tokens}`);
  }

  // 3) 中途断流：已流出的半截正文绝不能被标成 response.completed。
  {
    const r = await fetch(`${base}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-codex', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: '半截输出' }] }, { type: 'message', role: 'user', content: [{ type: 'input_text', text: '__test_abort' }] }] }),
    });
    const sse = await r.text();
    check(/event: response.failed/.test(sse), '中途断流发送 response.failed', sse.slice(-800));
    check(!/event: response.completed/.test(sse), '半截正文不会标成 response.completed');
    check(/HALF-ANSWER/.test(sse), '断流前的正文仍可被诊断');
    check(/stream_interrupted/.test(sse), '错误类型是 stream_interrupted', sse.slice(-800));
  }

  // 4) 中途断流自动重试：只能重发，不得把半截正文续接到第二次回答。
  {
    captured.length = 0;
    const r = await fetch(`${base}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5-codex', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: '__test_retry' }] }] }),
    });
    const sse = await r.text();
    check(captured.length === 2, '中途断流自动重试一次', `上游调用 ${captured.length} 次`);
    check(/event: response.completed/.test(sse), '重试成功后正常完成', sse.slice(-700));
    check(!/HALF-ANSWER/.test(sse), '重试不会重复半截正文');
  }

  // 5) 模型目录透传
  {
    const r = await fetch(`${base}/v1/models`);
    const j = await r.json();
    const ids = (j.data || []).map((m) => m.id);
    check(ids.includes('fake-model-a'), '/v1/models 透传上游目录', ids.join(','));
    check(ids.includes('claude-opus-5-5'), '/v1/models 保留 claude 别名', ids.join(','));
  }
} catch (e) {
  check(false, '冒烟测试跑完', e.message);
}

console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
await done(failures ? 1 : 0);
