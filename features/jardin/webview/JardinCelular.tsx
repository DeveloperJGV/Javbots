import { useState } from 'react';

import type { JardinCareKind, JardinInboxItem, JardinStatus } from '../../../core/src/messages.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { CARE_LABEL } from './constants.js';
import { inputClass, sectionTitle, type Send } from './JardinComun.js';
import { photoUrl } from './jardinText.js';

/** One thing from the phone: a note or a photo the office couldn't place, sorted with a click. */
function InboxLine({
  item,
  status,
  send,
  onNewPlant,
}: {
  item: JardinInboxItem;
  status: JardinStatus;
  send: Send;
  onNewPlant: (item: JardinInboxItem) => void;
}) {
  const [plantId, setPlantId] = useState(status.plants[0]?.id ?? '');
  const plant = status.plants.find((p) => p.id === plantId);
  const [kind, setKind] = useState<JardinCareKind>('regar');
  const careKinds = plant?.cares.map((c) => c.kind) ?? [];
  const resolve = (action: string, extra: Record<string, unknown> = {}) =>
    send({ type: 'resolveJardinInbox', id: item.id, action, ...extra });
  return (
    <li className="flex flex-col gap-2 border-l-2 border-border pl-6">
      <span className="flex items-start gap-8">
        {item.photo && (
          <img
            src={photoUrl(item.photo, officeToken())}
            alt=""
            className="w-[56px] h-[56px] object-cover"
            style={{ imageRendering: 'auto' }}
          />
        )}
        <span className="flex flex-col">
          <span className="text-base">{item.text ?? item.name}</span>
          <span className="text-text-muted">
            {item.source === 'drive' ? 'Del celular' : 'De la compu'} · {item.why}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-4">
        {item.newPlant ? (
          <Button
            size="sm"
            variant="accent"
            disabled={status.saving}
            onClick={() => onNewPlant(item)}
          >
            Revisar y agregar planta
          </Button>
        ) : status.plants.length > 0 ? (
          <>
            <select
              className={inputClass}
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
            >
              {status.plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {item.kind === 'photo' ? (
              <Button
                size="sm"
                disabled={status.saving}
                onClick={() => resolve('photo', { plantId })}
              >
                Es de esta planta
              </Button>
            ) : (
              <>
                <select
                  className={inputClass}
                  value={careKinds.includes(kind) ? kind : careKinds[0]}
                  onChange={(e) => setKind(e.target.value as JardinCareKind)}
                >
                  {careKinds.map((k) => (
                    <option key={k} value={k}>
                      {CARE_LABEL[k]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={status.saving || careKinds.length === 0}
                  onClick={() =>
                    resolve('care', {
                      plantId,
                      kind: careKinds.includes(kind) ? kind : careKinds[0],
                    })
                  }
                >
                  Ya se hizo
                </Button>
              </>
            )}
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={status.saving}
          title={item.photo ? 'La foto no se borra: se guarda en "Ya no están"' : undefined}
          onClick={() => resolve('discard')}
        >
          Descartar
        </Button>
      </span>
    </li>
  );
}

/** What came from the phone (or the computer) that the office couldn't place. Hidden when there's nothing. */
export function JardinCelular({
  status,
  send,
  onNewPlant,
}: {
  status: JardinStatus;
  send: Send;
  onNewPlant: (item: JardinInboxItem) => void;
}) {
  if (status.inbox.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className={sectionTitle}>Del celular ({status.inbox.length})</div>
      <ul className="flex flex-col gap-6">
        {status.inbox.map((i) => (
          <InboxLine key={i.id} item={i} status={status} send={send} onNewPlant={onNewPlant} />
        ))}
      </ul>
    </section>
  );
}
