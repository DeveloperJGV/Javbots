import { useState } from 'react';

import type {
  PlaylistCommand,
  PlaylistRecipe,
  PlaylistStatus,
} from '../../../../core/src/messages.js';
import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { PLAYLIST_CUSTOM_NAME, PLAYLIST_DECADES, PLAYLIST_MINUTES } from './constants.js';
import { CheckBox, inputClass, SectionTitle, ToggleButton } from './PlaylistBits.js';
import {
  canBuild,
  emptyRecipe,
  recipeSummary,
  toggleArtist,
  toggleDecade,
  togglePlaylist,
} from './playlistText.js';

export type PlaylistSend = (cmd: Omit<PlaylistCommand, 'type'>) => void;

function QuickRecipes({
  status,
  busy,
  send,
  onEdit,
}: {
  status: PlaylistStatus;
  busy: boolean;
  send: PlaylistSend;
  onEdit: (r: PlaylistRecipe) => void;
}) {
  if (status.recipes.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>Recetas rápidas</SectionTitle>
      <ul className="flex flex-col gap-6">
        {status.recipes.map((r) => (
          <li key={r.id} className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-4">
              <Button
                size="sm"
                variant={busy || !canBuild(r) ? 'disabled' : 'default'}
                disabled={busy || !canBuild(r)}
                onClick={() => send({ action: 'preview', recipe: r })}
              >
                {r.name}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={`Editar ${r.name}`}
                onClick={() => onEdit(r)}
              >
                Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={`Quitar ${r.name}`}
                onClick={() => send({ action: 'deleteRecipe', id: r.id })}
              >
                Quitar
              </Button>
            </span>
            <span className="text-xs text-text-muted">{recipeSummary(r, status.playlists)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "A mi gusto": buttons only. Nothing is typed except a recipe's short name. */
export function PlaylistBuilder({
  status,
  busy,
  send,
}: {
  status: PlaylistStatus;
  busy: boolean;
  send: PlaylistSend;
}) {
  const [recipe, setRecipe] = useState<PlaylistRecipe>(emptyRecipe);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const ready = canBuild(recipe) && !busy;
  const set = (next: Partial<PlaylistRecipe>) => setRecipe((r) => ({ ...r, ...next }));

  const save = () => {
    const n = name.trim();
    if (!n || busy) return;
    send({ action: 'saveRecipe', recipe: { ...recipe, name: n } });
    setNaming(false);
  };

  return (
    <>
      <QuickRecipes
        status={status}
        busy={busy}
        send={send}
        onEdit={(r) => {
          setRecipe({ ...r });
          setName(r.name);
          setNaming(false);
        }}
      />

      <section className="flex flex-col gap-6">
        <SectionTitle>
          A mi gusto
          {recipe.id && <span className="text-sm text-text-muted"> · editando {recipe.name}</span>}
        </SectionTitle>

        <div className="flex flex-col gap-4">
          <span className="text-text-muted">De dónde</span>
          <span className="flex flex-wrap gap-4">
            <ToggleButton on={recipe.top} disabled={busy} onClick={() => set({ top: !recipe.top })}>
              Lo que más escucho
            </ToggleButton>
            <ToggleButton
              on={recipe.liked}
              disabled={busy}
              onClick={() => set({ liked: !recipe.liked })}
            >
              Mis me gusta
            </ToggleButton>
            <ToggleButton
              on={recipe.surprise}
              disabled={busy}
              onClick={() => set({ surprise: !recipe.surprise })}
            >
              Sorpresa de mis listas
            </ToggleButton>
          </span>
          {status.playlists.length > 0 && (
            <>
              <span className="text-text-muted text-xs">Mis listas</span>
              <div className="flex flex-wrap gap-4 max-h-[120px] overflow-y-auto border-2 border-border bg-bg-dark p-4">
                {status.playlists.map((p) => (
                  <ToggleButton
                    key={p.id}
                    on={recipe.playlists.includes(p.id)}
                    disabled={busy}
                    onClick={() => setRecipe((r) => togglePlaylist(r, p.id))}
                  >
                    {p.name}
                    {p.count !== undefined && ` (${p.count})`}
                  </ToggleButton>
                ))}
              </div>
            </>
          )}
          {status.artists.length > 0 && (
            <>
              <span className="text-text-muted text-xs">Artistas</span>
              <div className="flex flex-wrap gap-4 max-h-[120px] overflow-y-auto border-2 border-border bg-bg-dark p-4">
                {status.artists.map((a) => (
                  <ToggleButton
                    key={a.id}
                    on={recipe.artists.some((x) => x.id === a.id)}
                    disabled={busy}
                    onClick={() => setRecipe((r) => toggleArtist(r, a))}
                  >
                    {a.name}
                  </ToggleButton>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <span className="text-text-muted">Década (ninguna = cualquiera)</span>
          <span className="flex flex-wrap gap-4">
            {PLAYLIST_DECADES.map((d) => (
              <ToggleButton
                key={d.decade}
                on={recipe.decades.includes(d.decade)}
                disabled={busy}
                onClick={() => setRecipe((r) => toggleDecade(r, d.decade))}
              >
                {d.label}
              </ToggleButton>
            ))}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <span className="text-text-muted">Duración</span>
          <span className="flex flex-wrap gap-4">
            {PLAYLIST_MINUTES.map((m) => (
              <ToggleButton
                key={m.minutes}
                on={recipe.minutes === m.minutes}
                disabled={busy}
                onClick={() => set({ minutes: m.minutes })}
              >
                {m.label}
              </ToggleButton>
            ))}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <span className="text-text-muted">Mezcla</span>
          <span className="flex flex-wrap gap-4">
            <ToggleButton
              on={!recipe.discover}
              disabled={busy}
              onClick={() => set({ discover: false })}
            >
              Solo lo mío
            </ToggleButton>
            <ToggleButton
              on={recipe.discover}
              disabled={busy}
              onClick={() => set({ discover: true })}
            >
              Con algo para descubrir
            </ToggleButton>
          </span>
          <CheckBox
            checked={recipe.avoidRecent}
            disabled={busy}
            onChange={(v) => set({ avoidRecent: v })}
          >
            Sin repetir lo de estos días
          </CheckBox>
        </div>

        <span className="text-xs text-text-muted">{recipeSummary(recipe, status.playlists)}</span>

        <span className="flex flex-wrap items-center gap-4">
          <Button
            size="md"
            variant={ready ? 'accent' : 'disabled'}
            disabled={!ready}
            onClick={() =>
              // A recipe that was never saved still needs a name: it names the list in Spotify.
              send({
                action: 'preview',
                recipe: { ...recipe, name: recipe.name || PLAYLIST_CUSTOM_NAME },
              })
            }
          >
            Armar
          </Button>
          {!naming ? (
            <Button
              size="md"
              variant={ready ? 'default' : 'disabled'}
              disabled={!ready}
              onClick={() => setNaming(true)}
            >
              Guardar como receta
            </Button>
          ) : (
            <>
              <input
                type="text"
                value={name}
                maxLength={40}
                aria-label="Nombre de la receta"
                placeholder="Ej. Domingo en la mañana"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                }}
                className={`min-w-[160px] ${inputClass}`}
              />
              <Button
                size="sm"
                variant={name.trim() && !busy ? 'accent' : 'disabled'}
                disabled={!name.trim() || busy}
                onClick={save}
              >
                Guardar receta
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
                No
              </Button>
            </>
          )}
          {recipe.id && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRecipe(emptyRecipe());
                setName('');
              }}
            >
              Empezar de cero
            </Button>
          )}
        </span>
      </section>
    </>
  );
}
