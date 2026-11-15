import { seriesMembers } from '../core/shelves.js';
import type { Game } from '../core/types.js';
import { ConfirmButton } from './ColeccionBits.js';
import { coleccionStore } from './coleccionStore.js';
import { platformName } from './coleccionText.js';

/** A "se busca" gap, as a paper poster: the price seen and where, and "¡Ya lo tengo!" turns it into a game. */
export function WantedPoster({
  game,
  games,
  onDelete,
}: {
  game: Game;
  games: readonly Game[];
  onDelete: (id: string) => void;
}) {
  const series = game.series ? seriesMembers(games, game.series) : [];
  return (
    <div className="col-poster" role="dialog" aria-label={`Se busca: ${game.title}`}>
      <h4>SE BUSCA</h4>
      <div className="name">{game.title}</div>
      <div className="p">
        <span>Consola</span>
        <span>{platformName(game.platform)}</span>
      </div>
      <div className="p">
        <span>Precio visto</span>
        <span>{game.price || 'sin anotar'}</span>
      </div>
      {game.seenAt && (
        <div className="p">
          <span>Dónde</span>
          <span>{game.seenAt}</span>
        </div>
      )}
      {series.length > 1 && (
        <div className="p">
          <span>Serie {game.series}</span>
          <span>
            tienes {series.filter((x) => !x.wanted).length} de {series.length}
          </span>
        </div>
      )}
      {game.notes && (
        <div className="p">
          <span>{game.notes}</span>
        </div>
      )}
      <div className="acts">
        <button type="button" className="yes" onClick={() => coleccionStore.edit(game, 'acquire')}>
          ¡Ya lo tengo!
        </button>
        <button type="button" onClick={() => coleccionStore.edit(game)}>
          Editar
        </button>
        <ConfirmButton
          className="ghost"
          label="Borrar"
          confirmLabel="¿Seguro? Borrar"
          onConfirm={() => onDelete(game.id)}
        />
        <button
          type="button"
          className="ghost"
          onClick={() => coleccionStore.show({ kind: 'shelves' })}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
