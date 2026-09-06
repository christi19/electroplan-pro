// calidad.mjs — la barra "solidez Illustrator/3D" y los criterios de aceptacion.
// No prueba features: prueba que la app AGUANTA. Uso: node tests/calidad.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual, esperarFoco,
  elegirHerramienta, puntoLienzo, contarElementos, arrastrarDedo, tocar,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const c = crearCorredor(`CALIDAD ${ARCHIVO}`);
console.log(`CALIDAD ${ARCHIVO}`);

// ---------------------------------------------------------------- escritorio
const { browser, context } = await abrirNavegador();

// Criterio 6: "todo funciona con el avion en modo vuelo". Se corta TODA la red:
// si algo dependiera de internet, aqui se rompe.
const pedidosDeRed = [];
await context.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
  pedidosDeRed.push(u);
  return route.abort();
});

const page = await abrirApp(context, ARCHIVO);

await c.prueba('la app entera arranca sin tocar la red (modo avion)', async () => {
  afirmarIgual(pedidosDeRed.length, 0,
    `pidio recursos de red: ${pedidosDeRed.slice(0, 3).join(', ')}`);
});

// --- criterio 3: 30 colocaciones seguidas -----------------------------------

await c.prueba('30 colocaciones seguidas no degradan ni dejan estado fantasma', async () => {
  await page.click('.tabs button[data-tab="mat"]');     // con la lista viva abierta: el caso caro
  await page.waitForSelector('#matLista', { timeout: 5000 });
  await elegirHerramienta(page, 'toma');
  const inicial = await contarElementos(page);

  const tiempos = [];
  for (let i = 0; i < 30; i++) {
    const p = await puntoLienzo(page, 0.18 + (i % 6) * 0.11, 0.20 + Math.floor(i / 6) * 0.13);
    const t0 = Date.now();
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(
      n => document.querySelectorAll('#canvas [data-id]').length > n,
      inicial + i, { timeout: 8000 });
    tiempos.push(Date.now() - t0);
  }
  const final = await contarElementos(page);
  afirmarIgual(final, inicial + 30, 'no se colocaron exactamente 30');

  const prim = tiempos.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const ult = tiempos.slice(-10).reduce((a, b) => a + b, 0) / 10;
  console.log(`     (primeras 10: ${prim.toFixed(0)}ms · ultimas 10: ${ult.toFixed(0)}ms)`);
  afirmar(ult < prim * 4 + 120, `se degrada: ${prim.toFixed(0)}ms -> ${ult.toFixed(0)}ms`);

  // Estado fantasma: el ghost del arrastre no puede quedar visible, ni la
  // seleccion colgada, ni un draft a medio hacer.
  const fantasma = await page.evaluate(() => {
    const g = document.getElementById('dragGhost');
    return { ghost: g ? getComputedStyle(g).display : 'none',
             sel: document.querySelectorAll('#canvas .sel').length };
  });
  afirmarIgual(fantasma.ghost, 'none', 'quedo el ghost del arrastre pegado');
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

// --- criterio 4: deshacer todo el trabajo de la sesion ----------------------

await c.prueba('deshacer todo devuelve la app al estado inicial limpio', async () => {
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => document.getElementById('undo').disabled)) break;
    await page.click('#undo');
  }
  const deshabilitado = await page.evaluate(() => document.getElementById('undo').disabled);
  afirmar(deshabilitado, 'quedaron pasos sin deshacer');
  afirmarIgual(page.__errores.length, 0, `errores al deshacer: ${page.__errores.join(' | ')}`);
});

await c.prueba('la lista viva acompano el deshacer hasta el final', async () => {
  const cifra = await page.evaluate(() => {
    const s = [...document.querySelectorAll('#panelbody .matstat')]
      .find(x => x.querySelector('span').textContent.trim() === 'puntos');
    return s ? parseFloat(s.querySelector('b').textContent) : null;
  });
  afirmar(cifra !== null, 'la lista viva desaparecio');
  afirmar(cifra < 30, `la lista quedo desincronizada del plano: ${cifra} puntos`);
});

// --- accesibilidad ----------------------------------------------------------

await c.prueba('se llega a las pestanas nuevas con el teclado y se activan con Enter', async () => {
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="bodega"]').focus());
  const enfocado = await page.evaluate(() => document.activeElement?.dataset?.tab);
  afirmarIgual(enfocado, 'bodega', 'no se puede enfocar la pestana');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#bodLista', { timeout: 5000 });
});

await c.prueba('los controles nuevos muestran foco visible al navegar con teclado', async () => {
  // Dos precisiones que costaron una investigacion:
  //  - focus() por JS NO dispara :focus-visible en Chromium; hay que tabular.
  //  - button{transition:.12s} vale por "all", asi que el anillo se anima de
  //    0 a 2px: medir en t=0 da 0px y parece que no hay foco.
  await page.keyboard.press('Tab');
  const id = await page.evaluate(() => document.activeElement?.id);
  afirmarIgual(id, 'bodAdd', `el primer Tab del panel no llego al boton principal (fue a ${id})`);
  await page.waitForFunction(() => {
    const s = getComputedStyle(document.activeElement);
    return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
  }, null, { timeout: 3000 });
  const anillo = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return { ancho: s.outlineWidth, color: s.outlineColor };
  });
  afirmar(anillo.color !== 'rgb(255, 255, 255)',
    `el anillo de foco no toma el color de acento: ${JSON.stringify(anillo)}`);
});

await c.prueba('ningun boton solo-icono de los paneles nuevos queda sin etiqueta', async () => {
  const sin = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#panelbody button').forEach(b => {
      const txt = b.textContent.replace(/[\s‍️]/g, '');
      const soloIcono = txt.length <= 2 && !/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(txt);
      if (soloIcono && !b.getAttribute('aria-label')) out.push(txt);
    });
    return out;
  });
  afirmarIgual(sin.length, 0, `botones solo-icono sin aria-label: ${sin.join(' ')}`);
});

// --- estados rotos ----------------------------------------------------------

await c.prueba('cancelar a la mitad no deja ningun estado roto', async () => {
  await page.click('#bodAdd');
  await page.waitForSelector('#bfNom', { timeout: 5000 });
  await esperarFoco(page, 'bfNom');
  await page.fill('#bfNom', 'A medias');
  await page.click('#bfNo');                                  // cancelar
  await page.waitForFunction(() => !document.querySelector('#bfNom'), null, { timeout: 5000 });
  const roto = await page.evaluate(() => ({
    modales: document.querySelectorAll('[style*="z-index:100"]').length,
    items: document.querySelectorAll('#bodLista [data-bitem]').length,
    panel: !!document.getElementById('bodLista'),
  }));
  afirmarIgual(roto.modales, 0, 'quedo un modal colgado tapando la app');
  afirmarIgual(roto.items, 0, 'guardo un item aunque se cancelo');
  afirmar(roto.panel, 'el panel quedo vacio tras cancelar');
});

await c.prueba('cerrar el dialogo tocando afuera tampoco rompe nada', async () => {
  await page.click('#bodAdd');
  await page.waitForSelector('#bfNom', { timeout: 5000 });
  await page.mouse.click(8, 8);                                // fuera de la tarjeta
  await page.waitForFunction(() => !document.querySelector('#bfNom'), null, { timeout: 5000 });
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

await browser.close();

// ---------------------------------------------------------------- tactil real
const tac = await abrirNavegador({ tactil: true });
const movil = await abrirApp(tac.context, ARCHIVO);

await c.prueba('en formato movil las pestanas nuevas siguen alcanzables', async () => {
  const tabs = await movil.evaluate(() =>
    [...document.querySelectorAll('.tabs button')].map(b => b.dataset.tab));
  afirmar(tabs.includes('mat') && tabs.includes('bodega'),
    `faltan pestanas en movil: ${tabs.join(',')}`);
  const scrollea = await movil.evaluate(() => {
    const t = document.querySelector('.tabs');
    return getComputedStyle(t).overflowX === 'auto' || t.scrollWidth <= t.clientWidth;
  });
  afirmar(scrollea, 'las pestanas no caben ni scrollean en movil');
});

await c.prueba('el dedo abre la bodega y anota sin que la pagina haga scroll', async () => {
  await movil.evaluate(() => {
    document.getElementById('tutomodal')?.remove();
    document.querySelector('.tabs button[data-tab="bodega"]').click();
  });
  await movil.waitForSelector('#bodLista', { timeout: 5000 });
  const yAntes = await movil.evaluate(() => window.scrollY);
  const caja = await movil.evaluate(() => {
    const r = document.getElementById('bodAdd').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await tocar(movil, caja);
  const yDespues = await movil.evaluate(() => window.scrollY);
  afirmarIgual(yDespues, yAntes, 'el toque hizo scroll de la pagina');
});

await c.prueba('un arrastre con el dedo en el lienzo no rompe los paneles nuevos', async () => {
  await movil.evaluate(() => document.querySelector('.tabs button[data-tab="mat"]').click());
  await movil.waitForSelector('#matLista', { timeout: 5000 });
  const a = await puntoLienzo(movil, 0.35, 0.4);
  const b = await puntoLienzo(movil, 0.6, 0.55);
  await arrastrarDedo(movil, a, b);
  afirmar(await movil.evaluate(() => !!document.getElementById('matLista')),
    'el arrastre tactil dejo el panel de materiales roto');
  afirmarIgual(movil.__errores.length, 0, `errores: ${movil.__errores.join(' | ')}`);
});

await tac.browser.close();

const verde = c.resumen();
process.exit(verde ? 0 : 1);
