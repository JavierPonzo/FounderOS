/**
 * Outside tasks (Linear, Lark, the eldunari book) as agent_tasks rows owned by
 * the operator. The id carries the source (`linear:ACC-1`, `lark:<guid>`,
 * `book:b3`) so a sync can replace exactly its own rows and nothing else.
 */
import { z } from 'zod';

export const SYNC_SOURCES = ['linear', 'lark', 'book'] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export type SyncedTask = {
  id: string;
  title: string;
  status: 'open' | 'doing' | 'blocked' | 'done';
  priority: 'low' | 'normal' | 'high';
  dueAt: string | null;
  detail: string;
};

export const LinearIssue = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.union([z.object({ value: z.number() }), z.number()]).nullish(),
  dueDate: z.string().nullish(),
  url: z.string().nullish(),
});

export function fromLinear(raw: z.infer<typeof LinearIssue>): SyncedTask {
  const p = typeof raw.priority === 'number' ? raw.priority : raw.priority?.value ?? 0;
  const s = raw.status.toLowerCase();
  return {
    id: `linear:${raw.id}`,
    title: `${raw.id} ${raw.title}`,
    status: /done|cancel/.test(s) ? 'done' : /progress|review/.test(s) ? 'doing' : /block/.test(s) ? 'blocked' : 'open',
    priority: p === 1 || p === 2 ? 'high' : p === 3 ? 'normal' : 'low',
    dueAt: raw.dueDate ?? null,
    detail: `Linear · ${raw.status}${raw.url ? ` · ${raw.url}` : ''}`,
  };
}

export const LarkTask = z.object({
  guid: z.string(),
  summary: z.string(),
  due: z.string().nullish(),
  completed: z.boolean().optional(),
  tasklists: z.array(z.string()).optional(),
  url: z.string().nullish(),
});

export function fromLark(raw: z.infer<typeof LarkTask>): SyncedTask {
  return {
    id: `lark:${raw.guid}`,
    title: raw.summary,
    status: raw.completed ? 'done' : 'open',
    priority: 'normal',
    dueAt: raw.due ? new Date(Number(raw.due)).toISOString().slice(0, 10) : null,
    detail: `Lark · ${(raw.tasklists ?? []).join(', ')}${raw.url ? ` · ${raw.url}` : ''}`,
  };
}

export const BookEntry = z.object({
  id: z.string(),
  text: z.string(),
  done_when: z.string().optional(),
  status: z.string(),
  session: z.string().nullish(),
});

export function fromBook(raw: z.infer<typeof BookEntry>): SyncedTask {
  const s = raw.status;
  return {
    id: `book:${raw.id}`,
    title: raw.text,
    status: s === 'done' || s === 'dropped' ? 'done' : s === 'waiting' ? 'blocked' : s === 'in_progress' ? 'doing' : 'open',
    priority: s === 'waiting' ? 'high' : 'normal',
    dueAt: null,
    detail: `Book${raw.session ? ` · ${raw.session}` : ''}${raw.done_when ? ` · done when: ${raw.done_when}` : ''}`,
  };
}
