// Guion del tráiler 2: una sola toma continua; editar.py la corta en escenas.
// Los tiempos son segundos desde que empieza la grabación.
//
// Reglas del juego que el guion respeta:
// - Una herramienta abierta 7 s sin datos saca el globo de permiso: las normales
//   se cierran a los PASO s (salvo la del permiso, a propósito).
// - El escáner adopta sesiones nuevas cada 3 s.
// - Cada turno terminado se festeja con un brinco; si trabajaron 2+ y todos
//   acaban, hay fiesta en Becarios (con disco si es de noche).
// - El tiempo libre empieza a los 45 s sin trabajo.

const PASO = 4.5;
export const SEGUNDOS = 162;

/** Isaac (Sótano, col 39 fila 23, sprite de 16 px): centro, en px del mundo. */
const ISAAC = { x: 39 * 16 + 8, y: 23 * 16 + 8 };

export async function correr({
  Agente,
  version,
  espera,
  seg,
  marca,
  noche,
  abrirPizarron,
  cerrarPizarron,
  clicMundo,
}) {
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
  const blog = new Agente('blog-viajes');

  // Oficina vacía; llegan uno por uno.
  await hasta(4);
  marca('llegan');
  juego.llegar();
  await hasta(5.5);
  web.llegar();
  await hasta(7);
  recetas.llegar();
  await hasta(8.5);
  blog.llegar();

  // Blog: le escriben, piensa, escribe y festeja su turno (en paralelo a todo).
  const turnoBlog = (async () => {
    await hasta(14);
    marca('blog piensa');
    await blog.pensar();
    await tanda(blog, 21, [
      ['Write', { file_path: 'entradas/japon.md' }],
      ['Edit', { file_path: 'entradas/japon.md' }],
      ['Edit', { file_path: 'index.md' }],
    ]);
    blog.terminarTurno();
    await blog.pararHook();
    marca('blog festeja');
  })();

  await Promise.all([
    // Código, Jedi y taller al mismo tiempo.
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
    // Web: Light Labs y luego el commit al pedestal.
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
    // Juego: delega en un becario.
    (async () => {
      await hasta(27);
      marca('becario');
      const task = juego.herramienta('Task', {
        description: 'Revisar los niveles',
        subagent_type: 'general-purpose',
      });
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
    // Recetas: pruebas en Aperture, permiso en Senku y una prueba que falla
    // (baja llorando al Sótano). Sigue trabajando unos segundos para que no se
    // vaya a descansar a medio camino.
    (async () => {
      await tanda(recetas, 26, [
        ['Bash', { command: 'npx vitest run' }],
        ['Bash', { command: 'npx vitest run --coverage' }],
      ]);
      marca('permiso');
      const permiso = recetas.herramienta('Bash', { command: 'npm install' });
      await hasta(64); // > 7 s sin datos: "Necesita tu permiso"
      recetas.resultado(permiso);
      marca('falla');
      await tanda(recetas, 64.2, [['Bash', { command: 'npm test' }]], { falla: 0 });
      await tanda(recetas, 69, [
        ['Read', { file_path: 'logs/error.txt' }],
        ['Read', { file_path: 'src/recetas.test.ts' }],
      ]);
      // Recetas no termina su turno aquí: si acabara con todos libres, la
      // fiesta empezaría ya, lejos de Becarios y de día.
    })(),
  ]);

  // De noche, los cuatro corren las pruebas finales en Aperture (junto a
  // Becarios) y acaban al mismo tiempo: fiesta con disco, con todos cerca.
  await hasta(76);
  marca('noche');
  await noche();
  const finales = [
    ['Bash', { command: 'npx vitest run' }],
    ['Bash', { command: 'npx vitest run' }],
  ];
  const todos = [juego, web, recetas, blog];
  await Promise.all(todos.map((a) => tanda(a, 79, finales)));
  for (const a of todos) a.terminarTurno();
  await blog.pararHook();
  marca('fiesta');
  await turnoBlog;

  // El pizarrón: lo que hizo cada quien.
  await hasta(112);
  marca('pizarron abre');
  await abrirPizarron();
  await hasta(121);
  await cerrarPizarron();
  marca('pizarron cierra');

  // Solo la versión completa: el huevo de pascua de Isaac (11 clics).
  if (version === 'completa') {
    await hasta(124);
    marca('isaac');
    for (let i = 0; i < 11; i++) {
      await clicMundo(ISAAC.x, ISAAC.y);
      await espera(120);
    }
  }

  // Después: tiempo libre de noche (Pac-Man, estrellas...) hasta el final.
  await hasta(136);
  marca('tiempo libre');
}
