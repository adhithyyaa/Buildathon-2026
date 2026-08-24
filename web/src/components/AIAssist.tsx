import { useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Pill } from './ui';

/** On-demand LLM text: the model never decides the action or touches money here. */
export function AIAssist({ caseId }: { caseId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ title: string; text: string; source: string } | null>(null);

  async function run(kind: 'explain' | 'summarize' | 'draft') {
    setBusy(kind);
    setOut(null);
    try {
      if (kind === 'explain') {
        const r = await api.explainCase(caseId);
        setOut({ title: 'Why this decision', text: r.text, source: r.source });
      } else if (kind === 'summarize') {
        const r = await api.summarizeCase(caseId);
        setOut({ title: 'Escalation summary', text: r.text, source: r.source });
      } else {
        const r = await api.draftMessage(caseId);
        setOut({ title: 'Drafted message', text: `${r.subject}\n\n${r.body}`, source: r.source });
      }
    } catch (e) {
      setOut({ title: 'Error', text: e instanceof Error ? e.message : String(e), source: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="AI assist (text only)" right={<Pill tone="sky">LLM · narrow use</Pill>}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run('explain')} disabled={!!busy}>{busy === 'explain' ? 'Thinking…' : 'Explain the decision'}</Button>
        <Button onClick={() => run('draft')} disabled={!!busy}>{busy === 'draft' ? 'Drafting…' : 'Draft message'}</Button>
        <Button onClick={() => run('summarize')} disabled={!!busy}>{busy === 'summarize' ? 'Summarizing…' : 'Escalation summary'}</Button>
      </div>
      {out && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
            {out.title}
            <Pill tone={out.source === 'llm' ? 'emerald' : 'slate'}>{out.source === 'llm' ? 'AI-generated' : out.source === 'template' ? 'template fallback' : out.source}</Pill>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">{out.text}</pre>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">The LLM never decides the action or moves money — it only writes explanations, messages, and summaries on demand.</p>
    </Card>
  );
}
