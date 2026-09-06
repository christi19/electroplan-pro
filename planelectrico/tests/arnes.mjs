// arnes.mjs — utilidades de prueba DOM para PlanElectricoPro.html
// Sin dependencias del proyecto: Playwright global + Chromium de /opt/pw-browsers.
// REGLA ANTI-ENVEJECIMIENTO: cero numeros de linea. Solo anclas semanticas
// (data-tool, data-id, id="...", textos visibles).
//
// Lecciones aplicadas (references/verificacion-dom.md):
//  - render() RECREA los nodos SVG -> nunca se guardan handles, se re-consulta.
//  - onDown llama setPointerCapture sin try/catch -> con punteros sinteticos
//    hay que stubbearlo ANTES de que cargue la pagina (addInitScript).
//  - El tutorial tapa la app -> se quita antes de interactuar.
//  - Las esperas son por cambio observable en el DOM, nunca por sleep fijo.

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Playwright vive en el node_modules GLOBAL: el proyecto sigue SIN npm ni
// node_modules propio. ESM no honra NODE_PATH, asi que se resuelve por ruta.
const PW = process.env.PLAYWRIGHT_MODULE
  || '/opt/node22/lib/node_modules/playwright/index.js';
const pw = await import(PW);              // CJS: los exports llegan en .default
const chromium = pw.chromium ?? pw.default?.chromium;

export const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export const ok   = m => console.log(`   - OK  ${m}`);
export const fail = m => console.log(`   - FALLO ${m}`);

// ---------------------------------------------------------------- navegador

export async function abrirNavegador({ tactil = false } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext(
    tactil
      ? { hasTouch: true, isMobile: true, viewport: { width: 820, height: 1180 } }
      : { viewport: { width: 1440, height: 900 } }
  );
  // El stub va ANTES de cargar: onDown llama setPointerCapture sin try/catch y
  // con pointerId sintetico lanza, abortando el handler a la mitad.
  await context.addInitScript(() => {
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.releasePointerCapture = function () {};
  });
  return { browser, context };
}

/** Abre la app y espera a que el init haya corrido de verdad. */
export async function abrirApp(context, archivo = 'PlanElectricoPro.html') {
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.__errores = errores;

  await page.goto(pathToFileURL(resolve(archivo)).href);

  // Marcador de init: el rail se construye por JS (en el HTML estatico hay 0).
  await page.waitForFunction(
    () => document.querySelectorAll('.tool[data-tool]').length >= 10,
    null, { timeout: 20000 }
  );
  // El tutorial tapa la app; si un click "no hace nada", este es el sospechoso.
  await page.evaluate(() => document.getElementById('tutomodal')?.remove());
  // render() ya dibujo el plano de ejemplo.
  await page.waitForFunction(
    () => document.querySelectorAll('#canvas [data-id]').length > 0,
    null, { timeout: 20000 }
  );
  return page;
}

// ------------------------------------------------------------- observadores
// Todo se re-consulta en cada llamada: nunca se cachean handles.

export const contarElementos = page =>
  page.evaluate(() => document.querySelectorAll('#canvas [data-id]').length);

export const idsEnPlano = page =>
  page.evaluate(() => [...document.querySelectorAll('#canvas [data-id]')]
    .map(n => n.getAttribute('data-id')));

export const existeId = (page, id) =>
  page.evaluate(i => !!document.querySelector(`#canvas [data-id="${i}"]`), id);

export const textoDe = (page, sel) =>
  page.evaluate(s => document.querySelector(s)?.textContent?.trim() ?? null, sel);

export const visible = (page, sel) =>
  page.evaluate(s => {
    const n = document.querySelector(s);
    if (!n) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
  }, sel);

/** Espera a que una funcion evaluada en la pagina cambie respecto de `antes`. */
export async function esperarCambio(page, fn, antes, timeout = 8000) {
  await page.waitForFunction(
    ([src, prev]) => new Function(`return (${src})()`)() !== prev,
    [fn.toString(), antes], { timeout }
  );
}

// ------------------------------------------------------------- interacciones

/** Centro en pixeles de pagina de un elemento del plano, por su data-id. */
export async function centroDe(page, id) {
  return page.evaluate(i => {
    const n = document.querySelector(`#canvas [data-id="${i}"]`);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}

/** Punto del lienzo a partir de una fraccion (0..1) de su caja. */
export async function puntoLienzo(page, fx, fy) {
  return page.evaluate(([a, b]) => {
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: r.left + r.width * a, y: r.top + r.height * b };
  }, [fx, fy]);
}

export async function elegirHerramienta(page, tool) {
  await page.click(`.tool[data-tool="${tool}"]`);
  await page.waitForFunction(
    t => document.querySelector(`.tool[data-tool="${t}"]`)?.classList.contains('on'),
    tool, { timeout: 5000 }
  );
}

/** Arrastre con el mouse REAL de Playwright (no necesita stub). */
export async function arrastrarMouse(page, desde, hasta, pasos = 12) {
  await page.mouse.move(desde.x, desde.y);
  await page.mouse.down();
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(
      desde.x + (hasta.x - desde.x) * (i / pasos),
      desde.y + (hasta.y - desde.y) * (i / pasos)
    );
  }
  await page.mouse.up();
}

/**
 * Arrastre con punteros SINTETICOS de tipo dedo/lapiz.
 * Es el unico camino para probar pointerType:'touch' sin un dispositivo real.
 */
export async function arrastrarDedo(page, desde, hasta, { pasos = 12, tipo = 'touch', id = 1 } = {}) {
  await page.evaluate(async ([d, h, n, tipo, pid]) => {
    const svg = document.getElementById('canvas');
    const ev = (tgt, nombre, p, extra = {}) => tgt.dispatchEvent(new PointerEvent(nombre, {
      pointerId: pid, pointerType: tipo, isPrimary: true, bubbles: true, cancelable: true,
      clientX: p.x, clientY: p.y, buttons: nombre === 'pointerup' ? 0 : 1, ...extra,
    }));
    // El DOWN va al nodo que esta bajo el dedo, para que el hit-test elija el
    // objeto correcto. Los MOVE ya no: render() recrea el arbol SVG y ese nodo
    // queda huerfano, asi que los eventos siguientes no llegarian a nadie. Se
    // despachan sobre el <svg>, que es donde la app escucha pointermove y desde
    // donde el pointerup BURBUJEA hasta el listener de window. Despacharlo
    // directo en window dejaria ev.target=window, que no es un Node, y revienta
    // los handlers que hacen contains(ev.target).
    ev(document.elementFromPoint(d.x, d.y) || svg, 'pointerdown', d);
    for (let i = 1; i <= n; i++) {
      const p = { x: d.x + (h.x - d.x) * (i / n), y: d.y + (h.y - d.y) * (i / n) };
      ev(svg, 'pointermove', p);
      await new Promise(r => requestAnimationFrame(r));
    }
    ev(svg, 'pointerup', h);
  }, [desde, hasta, pasos, tipo, id]);
}

/**
 * Espera a que el foco se pose donde la app lo manda.
 * uiModal/pedir/bodEditar hacen focus()+select() con un setTimeout de 30ms: si
 * el test llena el campo siguiente ANTES de ese instante, el foco vuelve al
 * primero con su texto seleccionado y la siguiente escritura lo sobrescribe.
 */
export async function esperarFoco(page, id) {
  await page.waitForFunction(i => document.activeElement?.id === i, id, { timeout: 5000 });
}

/** Toque simple (tap) con puntero sintetico. */
export async function tocar(page, p, { tipo = 'touch', id = 1 } = {}) {
  await arrastrarDedo(page, p, p, { pasos: 1, tipo, id });
}

// ------------------------------------------------------------------- runner

export function crearCorredor(nombre) {
  const fallos = [];
  let total = 0;
  return {
    async prueba(titulo, fn) {
      total++;
      try {
        await fn();
        ok(titulo);
      } catch (e) {
        fallos.push(`${titulo}: ${e.message}`);
        fail(`${titulo}  ->  ${e.message}`);
      }
    },
    resumen() {
      console.log(fallos.length
        ? `[FALLO] ${nombre}: ${fallos.length}/${total} pruebas fallaron`
        : `[OK]    ${nombre}: ${total}/${total} pruebas pasaron`);
      return fallos.length === 0;
    },
  };
}

export function afirmar(cond, mensaje) {
  if (!cond) throw new Error(mensaje);
}

export function afirmarIgual(actual, esperado, mensaje) {
  if (actual !== esperado) {
    throw new Error(`${mensaje} (esperado ${esperado}, obtenido ${actual})`);
  }
}
