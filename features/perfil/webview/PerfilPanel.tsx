import { useSyncExternalStore } from 'react';

import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { perfilStore } from './perfilStore.js';
import { dateText } from './perfilText.js';

/**
 * The personality screen's panel (features/perfil): opens from the screen in the freelance room. The type, its
 * traits with their percentages, role and strategy, and the fun facts (for games and memes).
 */
export function PerfilPanel() {
  const { profile, open } = useSyncExternalStore(perfilStore.subscribe, perfilStore.get);
  if (!open) return null;

  return (
    <Modal
      isOpen
      onClose={() => perfilStore.close()}
      title={profile ? `${profile.name} (${profile.code})` : 'Perfil'}
      className="w-[min(460px,94vw)]"
    >
      <div className="px-10 pb-8 flex flex-col gap-10 text-sm text-text max-h-[70vh] overflow-y-auto">
        {!profile ? (
          <p className="text-text-muted">
            Todavía no hay resultado. Se lee de <code>~/.pixel-agents/perfil.json</code> (ver
            features/perfil/README.md) y solo se ve en la oficina abierta con su llave.
          </p>
        ) : (
          <>
            {(profile.role || profile.strategy) && (
              <div className="flex flex-wrap gap-x-16 gap-y-4">
                {profile.role && (
                  <span>
                    <span className="text-text-muted">Rol: </span>
                    <span className="text-accent-bright">{profile.role}</span>
                  </span>
                )}
                {profile.strategy && (
                  <span>
                    <span className="text-text-muted">Estrategia: </span>
                    <span className="text-accent-bright">{profile.strategy}</span>
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-6">
              {profile.traits.map((t) => (
                <div key={`${t.letter}-${t.name}`} className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span>
                      <span className="text-accent-bright">{t.letter}</span> {t.name}
                    </span>
                    <span>{t.percent}%</span>
                  </div>
                  <div className="h-8 bg-bg-dark border-2 border-border">
                    <div className="h-full bg-accent" style={{ width: `${t.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {profile.facts && profile.facts.length > 0 && (
              <div className="flex flex-col gap-4">
                <span className="text-text-muted">Datos curiosos</span>
                <ul className="flex flex-col gap-3 list-none m-0 p-0">
                  {profile.facts.map((f) => (
                    <li key={f}>&gt; {f}</li>
                  ))}
                </ul>
              </div>
            )}

            {(profile.source || profile.date) && (
              <p className="text-text-muted">
                {[profile.source, profile.date ? dateText(profile.date) : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
