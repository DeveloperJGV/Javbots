import { Button } from '../../../webview-ui/src/components/ui/Button.js';

export const inputClass = 'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text';
export const sectionTitle = 'text-lg text-accent-bright';

export type Send = (msg: Record<string, unknown>) => void;

/** Write, check, confirm: what goes to Google is shown before anything is saved. */
export function Review({
  lines,
  busy,
  onYes,
  onBack,
  yes,
}: {
  lines: string[];
  busy: boolean;
  onYes: () => void;
  onBack: () => void;
  yes: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-2 border-border p-8">
      <span>¿Lo agrego así?</span>
      {lines.length === 0 ? (
        <span className="text-text-muted">No se agrega nada a Google.</span>
      ) : (
        <ul className="flex flex-col gap-2 text-accent-bright">
          {lines.map((l) => (
            <li key={l}>· {l}</li>
          ))}
        </ul>
      )}
      <span className="flex gap-8">
        <Button size="sm" variant={busy ? 'disabled' : 'accent'} disabled={busy} onClick={onYes}>
          {yes}
        </Button>
        <Button size="sm" onClick={onBack}>
          Corregir
        </Button>
      </span>
    </div>
  );
}
