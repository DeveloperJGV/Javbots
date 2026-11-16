import { useState, useSyncExternalStore } from 'react';

import type { FreelanceOfferSpec, SearchCriteriaSet } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { CriteriaEditor } from '../../busquedas/webview/CriteriaEditor.js';
import { SearchRequestCard } from '../../busquedas/webview/SearchRequestCard.js';
import {
  FREELANCE_KIND_LABELS,
  FREELANCE_MARK_LABELS,
  FREELANCE_ROOM,
  FREELANCE_THEME,
  OFFER_TEXT_MAX,
} from './constants.js';
import { freelanceOfferStore, freelanceStore, openLeads } from './freelanceStore.js';
import { linesOf, offerReady, textOf } from './freelanceText.js';

const inputClass = 'py-2 px-4 bg-bg-dark border-2 border-border rounded-none text-text';
const kindLabel = (k: string) => FREELANCE_KIND_LABELS[k] ?? k;
const room = FREELANCE_ROOM;

/** One labeled line of the offer (lists joined). */
function OfferLine({ label, value }: { label: string; value: string | string[] }) {
  const text = Array.isArray(value) ? value.join(' · ') : value;
  return (
    <span>
      <span className="text-text-muted">{label}: </span>
      {text || <span className="text-text-muted">(vacío)</span>}
    </span>
  );
}

/** The offer editor: short fields on one line, lists one item per line. */
function OfferEditor({
  offer,
  onSave,
  onCancel,
}: {
  offer: FreelanceOfferSpec;
  onSave: (offer: FreelanceOfferSpec) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(offer.title);
  const [rate, setRate] = useState(offer.rate);
  const [availability, setAvailability] = useState(offer.availability);
  const [basedIn, setBasedIn] = useState(offer.basedIn ?? '');
  const [services, setServices] = useState(textOf(offer.services));
  const [technologies, setTechnologies] = useState(textOf(offer.technologies));
  const [languages, setLanguages] = useState(textOf(offer.languages));
  const [notWanted, setNotWanted] = useState(textOf(offer.notWanted));
  const draft: FreelanceOfferSpec = {
    title: title.trim(),
    services: linesOf(services),
    technologies: linesOf(technologies),
    rate: rate.trim(),
    availability: availability.trim(),
    basedIn: basedIn.trim(),
    languages: linesOf(languages),
    notWanted: linesOf(notWanted),
  };
  const ready = offerReady(draft);
  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="flex flex-col gap-2">
      <span className="text-text-muted">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={OFFER_TEXT_MAX}
        placeholder={hint}
        onChange={(e) => set(e.target.value)}
        className={inputClass}
      />
    </label>
  );
  const area = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="flex flex-col gap-2">
      <span className="text-text-muted">{label} (uno por línea)</span>
      <textarea
        value={value}
        rows={3}
        placeholder={hint}
        onChange={(e) => set(e.target.value)}
        className={`resize-y ${inputClass}`}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-6 border-2 border-border p-8">
      {field('Qué ofreces', title, setTitle, 'Ej. Desarrollo de apps móviles')}
      {area('Servicios', services, setServices, 'Ej. Apps Android de cero')}
      {area('Tecnologías', technologies, setTechnologies, 'Ej. Kotlin')}
      <span className="flex flex-wrap gap-6">
        <span className="flex-1 min-w-[200px]">
          {field('Tarifa', rate, setRate, 'Ej. desde 25 USD/h o por proyecto')}
        </span>
        <span className="flex-1 min-w-[200px]">
          {field('Disponibilidad', availability, setAvailability, 'Ej. 20 h por semana, remoto')}
        </span>
      </span>
      {field(
        'Desde dónde trabajo',
        basedIn,
        setBasedIn,
        'Ej. México (UTC-6), remoto: el agente descarta lo que no acepte tu país o tu zona',
      )}
      {area('Idiomas', languages, setLanguages, 'Ej. Español')}
      {area('Lo que no aceptas', notWanted, setNotWanted, 'Ej. Trabajo gratis a prueba')}
      <span className="flex gap-8">
        <Button
          size="sm"
          variant={ready ? 'accent' : 'disabled'}
          disabled={!ready}
          title={ready ? undefined : 'Escribe al menos qué ofreces o un servicio'}
          onClick={() => onSave(draft)}
        >
          Guardar oferta
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </span>
    </div>
  );
}

/** What is wanted today and which criteria. Saving does not launch anything yet. */
function NewRequest({
  criteria,
  onSave,
}: {
  criteria: SearchCriteriaSet[];
  onSave: (r: { text: string; criteriaId: string }) => void;
}) {
  const [text, setText] = useState('');
  const [criteriaId, setCriteriaId] = useState(criteria[0]?.id ?? '');
  const ready = text.trim().length > 0;
  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        rows={2}
        maxLength={500}
        placeholder="¿Qué buscas? Ej. proyectos de apps Android, remoto, de 500 USD para arriba, publicados esta semana"
        onChange={(e) => setText(e.target.value)}
        className={`resize-y ${inputClass}`}
      />
      <span className="flex flex-wrap items-center gap-4">
        <span className="text-text-muted">Criterios:</span>
        {criteria.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={c.id === criteriaId ? 'active' : 'default'}
            onClick={() => setCriteriaId(c.id)}
          >
            {c.label}
          </Button>
        ))}
      </span>
      <Button
        size="sm"
        className="self-start"
        variant={ready ? 'accent' : 'disabled'}
        disabled={!ready}
        onClick={() => {
          onSave({ text: text.trim(), criteriaId });
          setText('');
        }}
      >
        Guardar pedido
      </Button>
    </div>
  );
}

/**
 * Freelance (features/freelance): opens from the desk of the freelance room. The owner's offer on top, new requests,
 * the criteria sets, and each request with the jobs the search agent found, best first, with Postulé / Descartado.
 */
export function FreelancePanel({ transport }: { transport: MessageTransport }) {
  const { status, open } = useSyncExternalStore(freelanceStore.subscribe, freelanceStore.get);
  const offerStatus = useSyncExternalStore(freelanceOfferStore.subscribe, freelanceOfferStore.get);
  const [editingOffer, setEditingOffer] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState(false);
  if (!open || !status) return null;
  const leads = openLeads(status);

  return (
    <div style={FREELANCE_THEME}>
      <Modal
        isOpen
        onClose={() => freelanceStore.close()}
        title="> Freelance_"
        className="w-[min(860px,94vw)]"
      >
        <div className="max-h-[78vh] overflow-y-auto px-10 pb-6 flex flex-col gap-8 text-sm text-text">
          <p className="text-text-muted">
            Escribe qué trabajo buscas y un agente de Claude Code lo busca en páginas públicas con
            tu oferta y tus criterios. Solo lee: nunca se registra, no manda propuestas ni da tus
            datos. Tú decides a qué te postulas.
            {leads > 0 && (
              <span className="text-accent-bright">
                {' '}
                {leads === 1
                  ? 'Hay 1 trabajo recomendado'
                  : `Hay ${leads} trabajos recomendados`}{' '}
                sin marcar.
              </span>
            )}
          </p>

          <section className="flex flex-col gap-4">
            <span className="flex items-center justify-between">
              <span className="text-lg text-accent-bright">Mi oferta</span>
              {offerStatus && !editingOffer && (
                <Button size="sm" variant="ghost" onClick={() => setEditingOffer(true)}>
                  Editar
                </Button>
              )}
            </span>
            {!offerStatus ? (
              <span className="text-text-muted">Cargando la oferta…</span>
            ) : editingOffer ? (
              <OfferEditor
                offer={offerStatus.offer}
                onCancel={() => setEditingOffer(false)}
                onSave={(offer) => {
                  transport.send({ type: 'saveFreelanceOffer', offer });
                  setEditingOffer(false);
                }}
              />
            ) : (
              <>
                {offerStatus.offerIsExample && (
                  <span className="border-2 border-status-permission p-6 text-status-permission">
                    Es la oferta de ejemplo, sin llenar. Llénala con lo tuyo para que el agente
                    califique mejor (puedes buscar de todos modos).
                  </span>
                )}
                <div className="flex flex-col gap-2">
                  <span className="text-base">{offerStatus.offer.title}</span>
                  <OfferLine label="Servicios" value={offerStatus.offer.services} />
                  <OfferLine label="Tecnologías" value={offerStatus.offer.technologies} />
                  <OfferLine label="Tarifa" value={offerStatus.offer.rate} />
                  <OfferLine label="Disponibilidad" value={offerStatus.offer.availability} />
                  <OfferLine label="Desde dónde trabajo" value={offerStatus.offer.basedIn ?? ''} />
                  <OfferLine label="Idiomas" value={offerStatus.offer.languages} />
                  <OfferLine label="No acepto" value={offerStatus.offer.notWanted} />
                  <span className="text-text-muted">
                    Modelo del agente: {offerStatus.model || 'el de fábrica de la máquina'} (se
                    cambia en freelance.json, «modelo»)
                  </span>
                </div>
              </>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="text-lg text-accent-bright">Nuevo pedido</div>
            <NewRequest
              criteria={status.criteria}
              onSave={(r) => transport.send({ type: 'createSearchRequest', room, ...r })}
            />
          </section>

          <section className="flex flex-col gap-4">
            <span className="flex items-center justify-between">
              <span className="text-lg text-accent-bright">Criterios</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingCriteria(!editingCriteria)}
              >
                {editingCriteria ? 'Cerrar' : 'Editar'}
              </Button>
            </span>
            {editingCriteria ? (
              <CriteriaEditor
                criteria={status.criteria}
                onSave={(criteria) => {
                  transport.send({ type: 'saveSearchCriteria', room, criteria });
                  setEditingCriteria(false);
                }}
              />
            ) : (
              <span className="text-text-muted">
                {status.criteria.map((c) => `${c.label} (${c.rules.length})`).join(' · ')}
              </span>
            )}
          </section>

          {status.requests.length === 0 ? (
            <span className="text-text-muted">Todavía no hay pedidos.</span>
          ) : (
            status.requests.map((request) => (
              <SearchRequestCard
                key={request.id}
                request={request}
                launcher={status.launcher}
                criteriaLabel={
                  status.criteria.find((c) => c.id === request.criteriaId)?.label ??
                  request.criteriaId
                }
                kindLabel={kindLabel}
                markLabels={FREELANCE_MARK_LABELS}
                emptyText="El agente no encontró trabajos que cumplan."
                onLaunch={() => transport.send({ type: 'launchSearchAgent', room, id: request.id })}
                onDelete={() =>
                  transport.send({ type: 'deleteSearchRequest', room, id: request.id })
                }
                onMark={(resultId, mark) =>
                  transport.send({
                    type: 'markSearchResult',
                    room,
                    requestId: request.id,
                    resultId,
                    mark,
                  })
                }
              />
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
