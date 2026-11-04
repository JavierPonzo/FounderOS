import { PageHeader } from '@/components/PageHeader';
import { Badge, SectionHead, type BadgeTone } from '@/components/terminal';
import { herdrSnapshot, type HerdrAgent } from '@/lib/connectors/herdr';

export const dynamic = 'force-dynamic';

const TONE: Record<string, BadgeTone> = { working: 'accent', blocked: 'warn', done: 'ok', idle: 'default' };

function byWorkspace(agents: HerdrAgent[]): [string, HerdrAgent[]][] {
  const groups = new Map<string, HerdrAgent[]>();
  for (const a of agents) groups.set(a.workspace, [...(groups.get(a.workspace) ?? []), a]);
  return [...groups].sort(([x], [y]) => x.localeCompare(y));
}

export default async function HerdrPage() {
  const snap = await herdrSnapshot();
  if (!snap.ok) {
    return (
      <div>
        <PageHeader eyebrow="Agents" title="Herdr" />
        <p className="text-os-muted">Herdr is not reachable here: {snap.error}</p>
      </div>
    );
  }
  const waiting = snap.agents.filter((a) => a.status === 'blocked').length;
  return (
    <div>
      <PageHeader eyebrow={`${snap.agents.length} sessions, ${waiting} waiting on you`} title="Herdr" />
      {byWorkspace(snap.agents).map(([workspace, rows]) => (
        <section key={workspace} className="mb-7">
          <SectionHead label={workspace} count={rows.length} />
          <ul className="divide-y divide-os-border rounded-lg-t border border-os-border bg-os-surface">
            {rows.map((a) => (
              <li key={a.paneId} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <Badge tone={TONE[a.status] ?? 'default'}>{a.status}</Badge>
                <span className="text-os-text">{a.title}</span>
                <span className="ml-auto truncate text-os-muted">{a.cwd}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
