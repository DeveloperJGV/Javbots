import type { ReactNode } from 'react';

import type { PlaylistDay } from '../../../../core/src/messages.js';
import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { dayLabel, roundedDuration } from './playlistText.js';

export const linkClass = 'text-accent-bright underline';
export const inputClass = 'py-1 px-4 bg-bg-dark border-2 border-border rounded-none text-text';

/** A button that stays lit while it's on (accent + aria-pressed). */
export function ToggleButton({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={disabled ? 'disabled' : on ? 'accent' : 'default'}
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** A pixel check box with its label (role checkbox: its name is the label). */
export function CheckBox({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={children}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`self-start flex items-center gap-4 text-sm ${disabled ? 'opacity-[var(--btn-disabled-opacity)] cursor-default' : 'cursor-pointer'}`}
    >
      <span
        aria-hidden
        className={`inline-flex items-center justify-center w-12 h-12 border-2 ${checked ? 'border-accent bg-accent' : 'border-border bg-bg-dark'}`}
      />
      <span>{children}</span>
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-lg text-accent-bright">{children}</div>;
}

/** Name (a link to Spotify when there is one), songs, length and day. */
export function ListInfo({ list, showDay = true }: { list: PlaylistDay; showDay?: boolean }) {
  return (
    <span className="flex flex-col">
      {list.url ? (
        <a className={linkClass} href={list.url} target="_blank" rel="noreferrer">
          {list.name}
        </a>
      ) : (
        <span className="text-base">{list.name}</span>
      )}
      <span className="text-text-muted text-xs">
        {list.count} canciones · {roundedDuration(list.totalMs)}
        {showDay && ` · ${dayLabel(list.day)}`}
      </span>
    </span>
  );
}

/** "Guardar" / "Borrar" for a list nobody decided on yet. */
export function KeepOrDelete({
  list,
  busy,
  send,
}: {
  list: PlaylistDay;
  busy: boolean;
  send: (action: 'keep' | 'delete', id: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-8">
      <ListInfo list={list} />
      <span className="flex gap-4 shrink-0">
        <Button
          size="sm"
          variant={busy ? 'disabled' : 'accent'}
          disabled={busy}
          onClick={() => send('keep', list.id)}
        >
          Guardar
        </Button>
        <Button
          size="sm"
          variant={busy ? 'disabled' : 'default'}
          disabled={busy}
          onClick={() => send('delete', list.id)}
        >
          Borrar
        </Button>
      </span>
    </li>
  );
}
