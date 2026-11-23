import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import type { RuedaSettingsPatch, RuedaStatus } from '../../../../core/src/messages.js';
import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { Checkbox } from '../../../../webview-ui/src/components/ui/Checkbox.js';
import { Modal } from '../../../../webview-ui/src/components/ui/Modal.js';
import { RUEDA_MODAL_Z } from '../constants.js';
import { drawScene, easeAngle, knobAngle, SCENE_H, SCENE_SCALE, SCENE_W } from './ruedaScene.js';
import { ruedaStore } from './ruedaStore.js';
import { detail, headline, lastKeyText, RUEDA_STEPS, sceneTarget } from './ruedaText.js';

const useRuedaState = () => useSyncExternalStore(ruedaStore.subscribe, ruedaStore.get);
const set = (settings: RuedaSettingsPatch) => ruedaStore.send({ action: 'set', settings });
const known = (s: RuedaStatus) => s.installed || s.running;

/** The animated knob: it turns with the volume of the device the wheel moves. */
export function RuedaScene({ status }: { status: RuedaStatus | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(sceneTarget(status));
  target.current = sceneTarget(status);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const start = performance.now();
    let last = start;
    let angle = knobAngle(target.current.volume);
    let shownVolume = target.current.volume;
    let changedAt = -1e9;
    let raf = 0;
    const frame = (now: number) => {
      const tgt = target.current;
      if (tgt.volume !== shownVolume) {
        shownVolume = tgt.volume;
        changedAt = now;
      }
      angle = easeAngle(angle, knobAngle(tgt.on ? tgt.volume : 0), now - last);
      last = now;
      drawScene(ctx, { target: tgt, angle, t: now - start, sinceChange: now - changedAt });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={canvas}
      width={SCENE_W}
      height={SCENE_H}
      style={{
        width: SCENE_W * SCENE_SCALE,
        height: SCENE_H * SCENE_SCALE,
        imageRendering: 'pixelated',
      }}
      className="self-center max-w-full"
      aria-label={status ? headline(status) : 'Rueda de volumen'}
    />
  );
}

/** Start / stop, pause, sign in and "Opciones": the same row everywhere. */
function RuedaButtons({ s, options = true }: { s: RuedaStatus; options?: boolean }) {
  if (!known(s)) return null;
  const send = (action: 'start' | 'stop' | 'signIn') => ruedaStore.send({ action });
  return (
    <div className="flex flex-wrap gap-6">
      {s.running ? (
        <Button size="sm" disabled={s.busy} onClick={() => send('stop')}>
          Apagar
        </Button>
      ) : (
        <Button size="sm" variant="accent" disabled={s.busy} onClick={() => send('start')}>
          Prender la rueda
        </Button>
      )}
      {s.running && (
        <Button size="sm" onClick={() => set({ paused: !s.settings.paused })}>
          {s.settings.paused ? 'Quitar la pausa' : 'Pausar'}
        </Button>
      )}
      {s.running && !s.session && !s.signingIn && (
        <Button size="sm" variant="accent" disabled={s.busy} onClick={() => send('signIn')}>
          Iniciar sesión de Spotify
        </Button>
      )}
      {options && (
        <Button size="sm" onClick={() => ruedaStore.openOptions()}>
          Opciones de la rueda
        </Button>
      )}
    </div>
  );
}

function Lines({ s }: { s: RuedaStatus }) {
  const last = lastKeyText(s);
  return (
    <>
      <div className="text-text">{headline(s)}</div>
      <div className="text-xs text-text-muted">{detail(s)}</div>
      {last && <div className="text-xs text-text-muted">{last}</div>}
      {s.message && <div className="text-xs text-text">{s.message}</div>}
    </>
  );
}

/** In the player menu (features/musica): the knob scene and the buttons. Only where the program has run. */
export function RuedaPanel() {
  const { status: s } = useRuedaState();
  if (!s || !known(s)) return null;
  return (
    <div
      className="mt-6 pt-6 border-t-2 border-border flex flex-col gap-6"
      data-testid="rueda-panel"
    >
      <div className="text-sm text-text-muted">Rueda de volumen</div>
      <RuedaScene status={s} />
      <Lines s={s} />
      <RuedaButtons s={s} />
    </div>
  );
}

/** Settings → Música: one row (Settings is already tall); the options open in their own panel. */
export function RuedaSettings() {
  const { status: s } = useRuedaState();
  if (!s) return null;
  return (
    <div
      className="flex items-center justify-between gap-6 pt-6 border-t-2 border-border"
      data-testid="rueda-ajustes"
    >
      <span>
        <span className="text-text">Rueda de volumen:</span>{' '}
        {headline(s).replace(/^Rueda de volumen: /, '')}
      </span>
      <Button size="sm" className="shrink-0" onClick={() => ruedaStore.openOptions()}>
        Opciones de la rueda
      </Button>
    </div>
  );
}

/** Every option of the program, in its own panel over whatever opened it. Always mounted (by JukeboxPicker). */
export function RuedaOptions() {
  const { status: s, optionsOpen } = useRuedaState();
  const [name, setName] = useState<string | null>(null);
  if (!optionsOpen || !s) return null;
  const typed = name ?? s.settings.computerName;
  const nameChanged = typed.trim() !== s.settings.computerName && typed.trim().length > 0;
  const close = () => {
    setName(null);
    ruedaStore.closeOptions();
  };
  return createPortal(
    <Modal
      isOpen
      onClose={close}
      title="Rueda de volumen"
      zIndex={RUEDA_MODAL_Z}
      className="w-[min(460px,94vw)]"
    >
      <div className="px-10 pb-8 flex flex-col gap-6 text-sm" data-testid="rueda-opciones">
        <RuedaScene status={s} />
        <Lines s={s} />
        <RuedaButtons s={s} options={false} />
        {known(s) && (
          <>
            <div className="flex flex-col text-text -mx-10">
              <Checkbox
                label="Aviso en pantalla al girar"
                checked={s.settings.toast}
                onChange={() => set({ toast: !s.settings.toast })}
              />
              <Checkbox
                label="Arrancar con Windows"
                checked={s.settings.startWithWindows}
                onChange={() =>
                  !s.busy &&
                  ruedaStore.send({ action: 'startup', on: !s.settings.startWithWindows })
                }
              />
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <span>Paso por vuelta:</span>
              {RUEDA_STEPS.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={s.settings.step === n ? 'active' : 'default'}
                  onClick={() => set({ step: n })}
                >
                  {n}
                </Button>
              ))}
            </div>
            <label className="flex flex-col gap-4">
              <span className="text-text-muted text-xs">
                Nombre de esta computadora en Spotify (si la música suena aquí, la rueda mueve
                Windows):
              </span>
              <div className="flex gap-6">
                <input
                  className="flex-1 min-w-0 bg-bg-dark border-2 border-border text-text px-6 py-2 text-sm"
                  value={typed}
                  maxLength={64}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!nameChanged}
                  onClick={() => {
                    set({ computerName: typed.trim() });
                    setName(null);
                  }}
                >
                  Guardar
                </Button>
              </div>
            </label>
          </>
        )}
      </div>
    </Modal>,
    document.body,
  );
}
