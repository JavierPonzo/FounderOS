import { describe, expect, it } from 'vitest';
import { parseHerdr } from '@/lib/connectors/herdr';

const agents = JSON.stringify({
  result: {
    agents: [
      { agent: 'claude', agent_status: 'working', cwd: '/home/someone/code/app', focused: true, pane_id: 'w1:p1', terminal_title_stripped: 'App lead', workspace_id: 'w1' },
      { agent_status: 'idle', pane_id: 'w9:p2', workspace_id: 'w9' },
    ],
  },
});
const spaces = JSON.stringify({ result: { workspaces: [{ workspace_id: 'w1', label: 'APP · repo' }] } });

describe('parseHerdr', () => {
  it('resolves workspace labels and shortens the home path', () => {
    const [first] = parseHerdr(agents, spaces);
    expect(first).toEqual({ paneId: 'w1:p1', workspace: 'APP · repo', title: 'App lead', status: 'working', cwd: '~/code/app', focused: true });
  });

  it('falls back to ids when a label or title is missing', () => {
    const second = parseHerdr(agents, spaces)[1];
    expect(second.workspace).toBe('w9');
    expect(second.title).toBe('w9:p2');
  });
});
