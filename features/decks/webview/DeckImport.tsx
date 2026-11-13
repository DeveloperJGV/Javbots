import { countDeck } from '../core/deck.js';
import { IMPORT_TEXT_MAX } from './constants.js';
import type { Send } from './DecksBits.js';
import type { DecksState } from './decksStore.js';
import { decksStore } from './decksStore.js';
import { countsLine, dbStateText } from './decksText.js';

/**
 * Import: paste a .ydk, a ydke:// link or a plain list ("3 Dark Magician", "2x 89631139"), or open a .ydk file. The
 * server reads it into a draft (never saved); its problems show here, and the draft goes to the editor to fix and save.
 */
export function DeckImport({ state, send }: { state: DecksState; send: Send }) {
  const { text, pending, result } = state.importing;
  const read = () => {
    const requestId = decksStore.startImport();
    send({ type: 'decksImport', requestId, text });
  };
  const openFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((t) => decksStore.setImportText(t.slice(0, IMPORT_TEXT_MAX)));
  };
  const dbLine = dbStateText(state.status?.db);

  return (
    <div className="decks-sheet">
      <div className="decks-head">
        <button
          type="button"
          className="decks-sq"
          title="Volver a la fila"
          aria-label="Volver a la fila"
          onClick={() => decksStore.show({ kind: 'row' })}
        >
          ←
        </button>
        <div style={{ minWidth: 0 }}>
          <h3>Importar deck</h3>
          <div className="meta">.ydk, ydke:// o una lista</div>
        </div>
      </div>
      <div className="decks-scroll">
        <label className="decks-label" htmlFor="decks-import">
          Pega aquí el deck
        </label>
        <textarea
          id="decks-import"
          className="decks-input pixel-scrollbar"
          rows={9}
          maxLength={IMPORT_TEXT_MAX}
          value={text}
          spellCheck={false}
          placeholder={
            '#main\n46986414\n...\n\no una lista:\n3 Dark Magician\n2x 89631139\nExtra\n1 Stardust Dragon'
          }
          onChange={(e) => decksStore.setImportText(e.target.value)}
        />
        <p className="decks-note">
          En una lista, cada renglón es una carta: «3 Dark Magician», «2x 89631139» o solo el
          nombre. Los renglones «Extra» y «Side» cambian de sección. Los nombres van en inglés; los
          códigos sirven en cualquier idioma.
        </p>
        {dbLine && <p className="decks-note">{dbLine}</p>}
        <div className="decks-actions" style={{ border: 'none', padding: '10px 0 0' }}>
          <button
            type="button"
            className="decks-btn acc"
            disabled={!text.trim() || pending}
            onClick={read}
          >
            {pending ? 'Leyendo…' : 'Leer'}
          </button>
          <label className="decks-btn" style={{ cursor: 'pointer' }}>
            Abrir archivo .ydk
            <input
              type="file"
              accept=".ydk,.txt,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                openFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {result && !pending && (
          <div style={{ marginTop: 14 }}>
            {result.deck ? (
              <p style={{ margin: 0, fontSize: 20 }}>Leí {countsLine(countDeck(result.deck))}.</p>
            ) : (
              <p style={{ margin: 0, fontSize: 20 }}>No pude leer un deck en ese texto.</p>
            )}
            {result.problems.length > 0 && (
              <ul className="decks-problems">
                {result.problems.map((p, i) => (
                  <li key={i}>▲ {p}</li>
                ))}
              </ul>
            )}
            {result.deck && (
              <p className="decks-note">
                Todavía no se guarda: revísalo, ponle nombre y dueño, y guárdalo en el editor.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="decks-actions">
        <button
          type="button"
          className="decks-btn acc"
          disabled={!result?.deck || pending}
          onClick={() => {
            if (!result?.deck) return;
            decksStore.edit(result.deck);
            decksStore.clearImport();
          }}
        >
          Revisar y guardar
        </button>
        <button
          type="button"
          className="decks-btn ghost"
          onClick={() => {
            decksStore.clearImport();
            decksStore.show({ kind: 'row' });
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
