import type { JardinStatus } from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { CARE_LABEL } from './constants.js';
import { sectionTitle, type Send } from './JardinComun.js';
import { hoySummary } from './jardinResumen.js';
import { dayLabel, lateText, todayCares, upcomingCares } from './jardinText.js';

/** Today's cares with their "Hecho" button, and what comes after. */
export function JardinHoy({
  status,
  send,
  onGoPlants,
}: {
  status: JardinStatus;
  send: Send;
  /** Takes the view to the plants, where the cares are set (offered when no plant has any). */
  onGoPlants?: () => void;
}) {
  const today = todayCares(status);
  const soon = upcomingCares(status);
  const summary = hoySummary(status);
  return (
    <section className="flex flex-col gap-4">
      <div className={sectionTitle}>Hoy en el jardín</div>
      {today.length === 0 ? (
        <span className="flex items-center justify-between gap-8">
          <span className="text-text-muted">{summary.empty}</span>
          {summary.noCaresAtAll && onGoPlants && (
            <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={onGoPlants}>
              Ir a plantas
            </Button>
          )}
        </span>
      ) : (
        <ul className="flex flex-col gap-2">
          {today.map(({ plant, care, late }) => (
            <li
              key={`${plant.id}:${care.kind}`}
              className="flex items-center justify-between gap-8"
            >
              <span className="text-base">
                {CARE_LABEL[care.kind]} <span className="text-accent-bright">{plant.name}</span>
                <span className={late > 0 ? 'text-status-error' : 'text-text-muted'}>
                  {' '}
                  · {lateText(late)}
                </span>
                <span className="text-text-muted"> · {care.time}</span>
              </span>
              <Button
                size="sm"
                variant={status.saving ? 'disabled' : 'default'}
                disabled={status.saving}
                onClick={() => send({ type: 'markJardinCare', plantId: plant.id, kind: care.kind })}
              >
                Hecho
              </Button>
            </li>
          ))}
        </ul>
      )}
      {soon.length > 0 && (
        <span className="text-text-muted">
          Después:{' '}
          {soon
            .map(
              ({ plant, care }) =>
                `${CARE_LABEL[care.kind].toLowerCase()} ${plant.name} (${dayLabel(care.due, status.today).toLowerCase()})`,
            )
            .join(', ')}
        </span>
      )}
      {summary.withoutCares && <span className="text-text-muted">{summary.withoutCares}</span>}
    </section>
  );
}
