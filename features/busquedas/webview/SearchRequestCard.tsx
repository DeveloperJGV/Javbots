import { type ReactNode, useState } from 'react';

import type { SearchLauncher, SearchRequest, SearchResult } from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { ratingText, resultsInOrder, STATE_LABELS, telHref } from './searchText.js';

function ResultLine({
  result,
  kindLabel,
  onMark,
  actions,
}: {
  result: SearchResult;
  kindLabel: (kind: string) => string;
  onMark: (mark: 'contactado' | 'descartado' | 'ninguno') => void;
  actions?: ReactNode;
}) {
  const discarded = result.verdict === 'descartado' || result.mark === 'descartado';
  const rating = ratingText(result);
  return (
    <li
      className={`flex flex-col gap-2 border-2 border-border p-6 ${discarded ? 'opacity-60' : ''}`}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-8">
        <span className="text-base">
          <span className="text-accent-bright">{result.score}</span>{' '}
          {result.link ? (
            <a className="hover:underline" href={result.link} target="_blank" rel="noreferrer">
              {result.name}
            </a>
          ) : (
            result.name
          )}
          <span className="text-text-muted"> · {kindLabel(result.kind)}</span>
          {result.verdict === 'descartado' && (
            <span className="text-status-error"> · descartado por el agente</span>
          )}
          {result.mark === 'contactado' && (
            <span className="text-status-success"> · contactado</span>
          )}
          {result.mark === 'agendado' && <span className="text-status-success"> · agendado</span>}
          {result.mark === 'descartado' && (
            <span className="text-status-error"> · lo descartaste</span>
          )}
        </span>
        {rating && <span className="text-status-permission">{rating}</span>}
      </span>
      {result.why && <span>{result.why}</span>}
      <span className="flex flex-wrap gap-x-12 text-text-muted">
        {result.phone && (
          <a className="hover:underline" href={telHref(result.phone)}>
            {result.phone}
          </a>
        )}
        {result.address && <span>{result.address}</span>}
        {result.source && <span>Fuente: {result.source}</span>}
      </span>
      <span className="flex flex-wrap items-start gap-4">
        <Button
          size="sm"
          variant={result.mark === 'contactado' ? 'active' : 'default'}
          onClick={() => onMark(result.mark === 'contactado' ? 'ninguno' : 'contactado')}
        >
          Contacté
        </Button>
        <Button
          size="sm"
          variant={result.mark === 'descartado' ? 'active' : 'default'}
          onClick={() => onMark(result.mark === 'descartado' ? 'ninguno' : 'descartado')}
        >
          Descartado
        </Button>
        {actions}
      </span>
    </li>
  );
}

/**
 * One request of a search room (features/busquedas): what was asked, how the agent is doing, the buttons to launch it
 * or copy its brief, and its results best first with the owner's marks. `actions` adds a room's own buttons per result
 * (the Directorio's "Agendar").
 */
export function SearchRequestCard({
  request,
  launcher,
  criteriaLabel,
  kindLabel,
  onLaunch,
  onMark,
  onDelete,
  actions,
}: {
  request: SearchRequest;
  launcher: SearchLauncher;
  criteriaLabel: string;
  kindLabel: (kind: string) => string;
  onLaunch: () => void;
  onMark: (resultId: string, mark: 'contactado' | 'descartado' | 'ninguno') => void;
  onDelete: () => void;
  actions?: (result: SearchResult) => ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const results = resultsInOrder(request.results);
  const launchLabel =
    request.state === 'esperando'
      ? 'Mandar encargo'
      : request.state === 'nuevo'
        ? 'Buscar'
        : 'Buscar otra vez';
  const stateClass =
    request.state === 'error'
      ? 'text-status-error'
      : request.state === 'listo'
        ? 'text-status-success'
        : 'text-status-permission';

  return (
    <section className="flex flex-col gap-4 border-2 border-border p-8">
      <span className="flex flex-wrap items-baseline justify-between gap-8">
        <span className="text-lg text-text">{request.text}</span>
        <span className={stateClass}>{STATE_LABELS[request.state]}</span>
      </span>
      <span className="text-text-muted">
        {[request.place, request.when, `Criterios: ${criteriaLabel}`].filter(Boolean).join(' · ')}
      </span>
      {request.note && <span className="text-text-muted">{request.note}</span>}
      <span className="flex flex-wrap gap-4">
        <Button
          size="sm"
          variant={launcher.available ? 'accent' : 'disabled'}
          disabled={!launcher.available}
          title={launcher.available ? 'Abre un agente de Claude Code en herdr' : launcher.detail}
          onClick={onLaunch}
        >
          {launchLabel}
        </Button>
        <Button
          size="sm"
          title="Copia una línea para pegarla en cualquier sesión de Claude Code"
          onClick={() =>
            void navigator.clipboard?.writeText(request.brief).then(() => setCopied(true))
          }
        >
          {copied ? 'Copiado' : 'Copiar encargo'}
        </Button>
        {confirmDelete ? (
          <>
            <Button size="sm" onClick={onDelete}>
              Sí, borrar
            </Button>
            <Button size="sm" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
            Borrar
          </Button>
        )}
      </span>
      {!launcher.available && launcher.detail && (
        <span className="text-text-muted">
          {launcher.detail} Copia el encargo y pégalo en una sesión de Claude Code.
        </span>
      )}
      {request.resultsNote && (
        <span className="text-text-muted">Nota del agente: {request.resultsNote}</span>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col gap-4">
          {results.map((r) => (
            <ResultLine
              key={r.id}
              result={r}
              kindLabel={kindLabel}
              onMark={(m) => onMark(r.id, m)}
              actions={actions?.(r)}
            />
          ))}
        </ul>
      )}
      {request.state === 'listo' && results.length === 0 && (
        <span className="text-text-muted">El agente no encontró a nadie que cumpla.</span>
      )}
    </section>
  );
}
