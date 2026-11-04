import { describe, expect, it } from 'vitest';
import { fromBook, fromLark, fromLinear } from '@/lib/sync/tasks';

describe('task sync mapping', () => {
  it('maps a Linear issue in review to doing, high priority, source in the id', () => {
    const t = fromLinear({ id: 'ACC-1', title: 'Fix it', status: 'In Review', priority: { value: 2 }, dueDate: '2026-11-05', url: 'https://linear.app/x' });
    expect(t).toMatchObject({ id: 'linear:ACC-1', title: 'ACC-1 Fix it', status: 'doing', priority: 'high', dueAt: '2026-11-05' });
  });

  it('turns a Lark millisecond due date into a day', () => {
    const t = fromLark({ guid: 'g1', summary: 'Draft report', due: '1793059200000', tasklists: ['Ops'] });
    expect(t).toMatchObject({ id: 'lark:g1', status: 'open', dueAt: '2026-10-27' });
    expect(t.detail).toContain('Ops');
  });

  it('maps book statuses: waiting is blocked on the operator, dropped and done are done, stale is open', () => {
    const s = (status: string) => fromBook({ id: 'b1', text: 't', status }).status;
    expect([s('waiting'), s('dropped'), s('done'), s('stale'), s('in_progress')]).toEqual(['blocked', 'done', 'done', 'open', 'doing']);
  });
});
