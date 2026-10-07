// Guion del tráiler: una sola toma continua de ~130 s con cuatro
// agentes de mentira; editar.py la corta en escenas. Los tiempos son segundos
// desde que empieza la grabación.
//
// Reglas del juego que el guion respeta:
// - Una herramienta abierta 7 s sin datos saca el globo de permiso: las normales
//   se cierran a los PASO s (salvo la del permiso, a propósito).
// - El tiempo libre empieza a los 45 s sin trabajo.
// - El escáner adopta sesiones nuevas cada 3 s.

const PASO = 4.5;

export const escenas = [
  {
    nombre: 'todo',
    async correr({ Agente, espera, noche, seg }) {
      const hasta = async (t) => {
        const falta = t - seg();
        if (falta > 0) await espera(falta * 1000);
      };
      /** Herramientas seguidas desde `t`, cada una cerrada a los PASO s. */
      const tanda = async (agente, t, pasos, { falla = -1 } = {}) => {
        for (let i = 0; i < pasos.length; i++) {
          await hasta(t + i * PASO);
          const id = agente.herramienta(...pasos[i]);
          await hasta(t + (i + 1) * PASO);
          agente.resultado(id, { error: i === falla });
        }
      };

      const juego = new Agente('mi-juego');
      const web = new Agente('pagina-web');
      const recetas = new Agente('app-recetas');

      // 1-2: oficina vacía; llegan uno por uno.
      await hasta(4);
      juego.llegar();
      await hasta(5.5);
      web.llegar();
      await hasta(7);
      recetas.llegar();

      // 3-5: Código, Jedi y taller al mismo tiempo.
      await Promise.all([
        tanda(juego, 12, [
          ['Edit', { file_path: 'src/jugador.ts' }],
          ['Write', { file_path: 'src/enemigos.ts' }],
          ['Edit', { file_path: 'src/nivel.ts' }],
        ]),
        tanda(web, 12, [
          ['Read', { file_path: 'docs/diseño.md' }],
          ['Grep', { pattern: 'menu' }],
          ['Read', { file_path: 'src/menu.tsx' }],
        ]),
        tanda(recetas, 12, [
          ['Bash', { command: 'npm run build' }],
          ['Bash', { command: 'npm run lint' }],
          ['Bash', { command: 'npm run build' }],
        ]),
      ]);

      await Promise.all([
        // 6-10 (web): Light Labs y luego el commit al pedestal.
        (async () => {
          await tanda(web, 27, [
            ['WebFetch', { url: 'https://example.com/recetas' }],
            ['WebSearch', { query: 'fuentes pixel art' }],
          ]);
          await tanda(web, 37, [
            ['Bash', { command: 'git commit -m "Menú nuevo"' }],
            ['Bash', { command: 'git push' }],
          ]);
          web.terminarTurno();
        })(),
        // 7 (juego): delega en un becario.
        (async () => {
          await hasta(27);
          const task = juego.herramienta('Task', { description: 'Revisar los niveles', subagent_type: 'general-purpose' });
          const sub = [
            ['Read', { file_path: 'niveles/nivel1.json' }],
            ['Edit', { file_path: 'niveles/nivel1.json' }],
            ['Write', { file_path: 'niveles/nivel2.json' }],
          ];
          for (let i = 0; i < sub.length; i++) {
            await hasta(29.5 + i * PASO);
            juego.becario(task, ...sub[i]);
          }
          await hasta(29.5 + sub.length * PASO);
          juego.resultado(task);
          juego.terminarTurno();
        })(),
        // 8-9 (recetas): pruebas en Aperture (junto al taller), permiso en Senku
        // y, desde ahí, una prueba que falla → baja llorando al Sótano. El error
        // solo dura unos segundos: se sigue trabajando para que no se vaya a
        // descansar a medio camino.
        (async () => {
          await tanda(recetas, 26, [
            ['Bash', { command: 'npx vitest run' }],
            ['Bash', { command: 'npx vitest run --coverage' }],
          ]);
          const permiso = recetas.herramienta('Bash', { command: 'npm install' });
          await hasta(64); // > 7 s sin datos: "Necesita tu permiso" (y le da tiempo de llegar)
          recetas.resultado(permiso);
          await tanda(recetas, 64.2, [['Bash', { command: 'npm test' }]], { falla: 0 });
          await tanda(recetas, 69, [
            ['Read', { file_path: 'logs/error.txt' }],
            ['Read', { file_path: 'src/recetas.test.ts' }],
          ]);
          recetas.terminarTurno();
        })(),
      ]);

      // 11-12: todos descansan; de noche se prenden las luces.
      await hasta(108);
      await noche();
    },
  },
];
