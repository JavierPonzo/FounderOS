import { describe, expect, it } from 'vitest';
import { issuesFromStream } from '@/lib/sync/linear-stream';

const line = (o: object) => JSON.stringify(o);
const toolResult = (issues: object[]) => line({ type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: JSON.stringify({ issues }) }] }] } });

describe('issuesFromStream', () => {
  it('reads issues from raw tool results, ignoring tool references and model text', () => {
    const jsonl = [
      line({ type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'tool_reference', tool_name: 'x' }] }] } }),
      toolResult([{ id: 'ACC-1', title: 'a', status: 'Todo' }]),
      line({ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }),
      toolResult([{ id: 'ACC-2', title: 'b', status: 'In Progress' }]),
      line({ type: 'result', is_error: false }),
    ].join('\n');
    expect(issuesFromStream(jsonl).map((i) => i.id)).toEqual(['ACC-1', 'ACC-2']);
  });

  it('fails loudly when the run ended in an error', () => {
    expect(() => issuesFromStream(line({ type: 'result', is_error: true, subtype: 'error_max_turns' }))).toThrow('error_max_turns');
  });
});
