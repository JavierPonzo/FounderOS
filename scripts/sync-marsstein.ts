/**
 * Pull the operator's open tasks from the connections eldunari already has,
 * and write them into agent_tasks. No new credentials:
 *  - Lark: eldunari's own MCP server, called directly over stdio (no model).
 *  - Linear: a trimmed `claude -p` on Haiku with only the read tool, reusing
 *    the Linear login Claude Code holds (about $0.003 a run).
 *  - Book: the eldunari book file, read directly.
 * A source that fails keeps its previous rows, so a bad run never empties the board.
 *
 *   SYNC_SOURCES=lark,book,linear npx tsx scripts/sync-marsstein.ts [--dry-run]   (default lark,book)
 */
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { openDb } from '../lib/db';
import { dataPath } from '../lib/paths';
import { BookEntry, LarkTask, fromBook, fromLark, fromLinear, type SyncSource, type SyncedTask } from '../lib/sync/tasks';
import { issuesFromStream } from '../lib/sync/linear-stream';

const ELDUNARI = process.env.ELDUNARI_DIR ?? path.join(os.homedir(), 'code/eldunari');
const DRY = process.argv.includes('--dry-run');

/** One tools/call against a stdio MCP server; the server is started and stopped per call. */
function mcpCall(command: string, args: string[], tool: string, toolArgs: object, timeoutMs = 60_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${tool}: timed out`)); }, timeoutMs);
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      for (const line of buffer.split('\n').slice(0, -1)) {
        const msg = JSON.parse(line);
        if (msg.id !== 2) continue;
        clearTimeout(timer);
        child.kill();
        if (msg.error) return reject(new Error(`${tool}: ${msg.error.message}`));
        return resolve(JSON.parse(msg.result.content[0].text));
      }
      buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    const send = (m: object) => child.stdin.write(`${JSON.stringify(m)}\n`);
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'founderos-sync', version: '1' } } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: toolArgs } });
  });
}

async function lark(): Promise<SyncedTask[]> {
  const reply = z.object({ tasks: z.array(LarkTask) }).parse(
    await mcpCall('node', [path.join(ELDUNARI, 'lark/server.js')], 'my_tasks', { limit: 100 }),
  );
  return reply.tasks.map(fromLark);
}

const LINEAR_PROMPT =
  'Call mcp__linear__list_issues with assignee "me", state "started", limit 100, fields ["title","status","priority","dueDate","url"]. ' +
  'Then call it again with state "unstarted" and the same other arguments. Then reply with the single word done.';

async function linear(): Promise<SyncedTask[]> {
  const args = ['-p', LINEAR_PROMPT, '--output-format', 'stream-json', '--verbose', '--model', 'haiku', '--max-turns', '6',
    '--allowedTools', 'mcp__linear__list_issues', '--setting-sources', '', '--strict-mcp-config',
    '--mcp-config', JSON.stringify({ mcpServers: { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } } })];
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile('claude', args, { timeout: 240_000, maxBuffer: 32 * 1024 * 1024, cwd: os.tmpdir() }, (err, out, stderr) =>
      err ? reject(new Error((stderr?.trim() || err.message).slice(0, 300))) : resolve(out));
    child.stdin?.end(); // claude -p otherwise waits for piped input
  });
  const issues = issuesFromStream(stdout);
  if (issues.length === 0) throw new Error('linear: no tool result in the stream');
  return [...new Map(issues.map((i) => [i.id, fromLinear(i)])).values()];
}

async function book(): Promise<SyncedTask[]> {
  const file = path.join(os.homedir(), '.local/state/herdr/plugins/shepherd/book.json');
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return z.array(BookEntry).parse(raw.entries ?? []).map(fromBook);
}

function replaceSource(db: ReturnType<typeof openDb>, source: SyncSource, tasks: SyncedTask[]): void {
  const now = new Date().toISOString();
  for (const old of db.agentTasks.all().filter((t) => t.id.startsWith(`${source}:`))) db.agentTasks.remove(old.id);
  for (const t of tasks) {
    db.agentTasks.insert({ ...t, agentId: null, ownerKind: 'me', createdAt: now, updatedAt: now, horizon: null, runId: null });
  }
}

async function main(): Promise<void> {
  const wanted = (process.env.SYNC_SOURCES ?? 'lark,book').split(',').map((x) => x.trim());
  const all: [SyncSource, () => Promise<SyncedTask[]>][] = [['lark', lark], ['linear', linear], ['book', book]];
  const sources = all.filter(([name]) => wanted.includes(name));
  const results = await Promise.allSettled(sources.map(([, fetch]) => fetch()));
  const db = DRY ? null : openDb(dataPath('glados.db'));
  results.forEach((r, i) => {
    const source = sources[i][0];
    if (r.status === 'rejected') return console.log(`${source}: kept previous rows (${String(r.reason).slice(0, 160)})`);
    if (db) replaceSource(db, source, r.value);
    console.log(`${source}: ${r.value.length} tasks${DRY ? ' (dry run, nothing written)' : ''}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
