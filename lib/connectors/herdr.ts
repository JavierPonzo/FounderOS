/**
 * Herdr sessions: the terminal agents running on this machine, read from
 * `herdr agent list` and `herdr workspace list` (JSON). Read-only; steering an
 * agent stays in Herdr and its Shepherd page.
 */
import { z } from 'zod';

const AgentRow = z.object({
  agent: z.string().optional(),
  agent_status: z.string(),
  cwd: z.string().optional(),
  focused: z.boolean().optional(),
  pane_id: z.string(),
  terminal_title_stripped: z.string().optional(),
  workspace_id: z.string(),
});
const WorkspaceRow = z.object({ id: z.string().optional(), workspace_id: z.string().optional(), label: z.string().optional() });

export type HerdrAgent = {
  paneId: string;
  workspace: string;
  title: string;
  status: string;
  cwd: string;
  focused: boolean;
};

export type HerdrSnapshot = { ok: true; agents: HerdrAgent[] } | { ok: false; error: string };

/** Pure: turns the two CLI replies into rows, workspace labels resolved. */
export function parseHerdr(agentsJson: string, workspacesJson: string): HerdrAgent[] {
  const agents = z.array(AgentRow).parse(JSON.parse(agentsJson).result.agents);
  const spaces = z.array(WorkspaceRow).parse(JSON.parse(workspacesJson).result.workspaces);
  const labels = new Map(spaces.map((w) => [w.workspace_id ?? w.id ?? '', w.label ?? '']));
  return agents.map((a) => ({
    paneId: a.pane_id,
    workspace: labels.get(a.workspace_id) || a.workspace_id,
    title: a.terminal_title_stripped ?? a.agent ?? a.pane_id,
    status: a.agent_status,
    cwd: (a.cwd ?? '').replace(/^\/home\/[^/]+/, '~'),
    focused: a.focused ?? false,
  }));
}

async function herdrJson(args: string[]): Promise<string> {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    execFile('herdr', args, { timeout: 5_000, maxBuffer: 4 * 1024 * 1024 }, (err, out, stderr) =>
      err ? reject(new Error((stderr?.trim() || err.message).slice(0, 300))) : resolve(out),
    );
  });
}

export async function herdrSnapshot(): Promise<HerdrSnapshot> {
  try {
    const [agents, spaces] = await Promise.all([herdrJson(['agent', 'list']), herdrJson(['workspace', 'list'])]);
    return { ok: true, agents: parseHerdr(agents, spaces) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
