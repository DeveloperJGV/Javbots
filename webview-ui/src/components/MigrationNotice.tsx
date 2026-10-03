import { Button } from './ui/Button.js';

interface MigrationNoticeProps {
  onDismiss: () => void;
}

export function MigrationNotice({ onDismiss }: MigrationNoticeProps) {
  return (
    <div
      className="absolute inset-0 bg-black/70 flex items-center justify-center z-100"
      onClick={onDismiss}
    >
      <div
        className="pixel-panel py-24 px-32 max-w-xl text-center leading-[1.3]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl mb-12 text-accent">We owe you an apology!</div>
        <p className="text-xl m-0 mb-12">
          Cambiamos a gráficos totalmente de código abierto, hechos desde cero con cariño. Por eso
          tu oficina anterior tuvo que reiniciarse.
        </p>
        <p className="text-xl m-0 mb-12">We're really sorry about that.</p>
        <p className="text-xl m-0 mb-12">
          ¿La buena noticia? Solo pasa una vez, y abre la puerta a novedades que valen la pena.
        </p>
        <p className="text-xl m-0 mb-20">Stay tuned, and thanks for using Pixel Agents!</p>
        <Button variant="accent" size="xl" onClick={onDismiss}>
          Entendido
        </Button>
      </div>
    </div>
  );
}
