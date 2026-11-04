import { z } from 'zod';
import { LinearIssue } from '@/lib/sync/tasks';

/** The model only places the calls; the issues are read from the raw tool results in the event stream, never retyped. */
export function issuesFromStream(jsonl: string): z.infer<typeof LinearIssue>[] {
  const issues: z.infer<typeof LinearIssue>[] = [];
  for (const line of jsonl.split('\n').filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.type === 'result' && event.is_error) throw new Error(`linear: ${event.subtype}`);
    if (event.type !== 'user') continue;
    for (const part of event.message?.content ?? []) {
      if (part.type !== 'tool_result' || !Array.isArray(part.content)) continue;
      for (const item of part.content) {
        if (item.type !== 'text') continue;
        const body = JSON.parse(item.text);
        if (Array.isArray(body.issues)) issues.push(...z.array(LinearIssue).parse(body.issues));
      }
    }
  }
  return issues;
}
