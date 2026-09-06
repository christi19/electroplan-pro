// puente.mjs — pruebas DOM del cruce entre la lista de materiales y la bodega.
// Es la función que hace valiosa la app: "de lo que ocupás, esto ya lo tenés".
// Uso: node tests/puente.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual, esperarFoco,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const { browser, context } = await abrirNavegador();
const c = crearCorredor(`PUENTE ${ARCHIVO}`);
console.log(`PUENTE ${ARCHIVO}`);

const page = await abrirApp(context, ARCHIVO);

const irA = async tab => {
  await page.click(`.tabs button[data-tab="${tab}"]`);
  await page.waitForSelector(tab === 'mat' ? '#matLista' : '#bodLista', { timeout: 5000 });
};

async function agregarItem({ nombre, cantidad, unidad = 'u' }) {
  await irA('bodega');
  await page.click('#bodAdd');
  await page.waitForSelector('#bfNom', { timeout: 5000 });
  await esperarFoco(page, 'bfNom');
  await page.fill('#bfNom', nombre);
  await page.fill('#bfCant', String(cantidad));
  await page.selectOption('#bfUni', unidad);
  await page.click('#bfOk');
  await page.waitForFunction(
    n => document.querySelectorAll('#bodLista [data-bitem]').length >= n, 1, { timeout: 5000 });
}

/** Lee el cruce que muestra una fila de la lista de materiales. */
const cruceDe = clave => page.evaluate(k => {
  const f = document.querySelector(`#matLista [data-mat="${k}"]`);
  if (!f) return null;
  const mc = f.querySelector('.mc');
  return { texto: mc ? mc.textContent.trim() : null,
           clase: mc ? [...mc.classList].filter(x => x !== 'mc')[0] : null };
}, clave);

const resumen = () => page.evaluate(() =>
  document.querySelector('.matpuente')?.textContent.replace(/\s+/g, ' ').trim() || null);

await c.prueba('con la bodega vacia ENSENA en vez de mostrar ceros', async () => {
  await irA('mat');
  const r = await resumen();
  afirmar(/Bodega/i.test(r), 'no invita a cargar la bodega');
  afirmar(!/0 ya las ten/i.test(r), 'muestra un conteo falso con la bodega vacia');
  const cruce = await cruceDe('toma');
  afirmarIgual(cruce.texto, null, 'inventa un cruce sin bodega');
});

await c.prueba('lo que alcanza se marca como "ya lo tenes"', async () => {
  await agregarItem({ nombre: 'Tomacorriente sencillo', cantidad: 5, unidad: 'u' });
  await irA('mat');
  const cruce = await cruceDe('toma');            // el plano ocupa 2
  afirmar(cruce.texto, 'no aparecio el cruce');
  afirmar(/ya lo ten/i.test(cruce.texto), `esperaba "ya lo tenés", vino "${cruce.texto}"`);
  afirmarIgual(cruce.clase, 'ok', 'no se pinta como resuelto');
});

await c.prueba('lo que NO alcanza dice cuanto falta', async () => {
  await agregarItem({ nombre: 'Cable THHN #12', cantidad: 20, unidad: 'm' });
  await irA('mat');
  const cruce = await cruceDe('cable');           // el plano ocupa ~39.4 m
  afirmar(/faltan/i.test(cruce.texto), `esperaba "faltan", vino "${cruce.texto}"`);
  afirmar(/ten[eé]s 20/i.test(cruce.texto), 'no dice cuanto tiene');
  afirmarIgual(cruce.clase, 'falta', 'no se pinta como pendiente');
});

await c.prueba('lo que no esta en bodega lo dice, no inventa un numero', async () => {
  const cruce = await cruceDe('panel');
  afirmar(/no est[aá] en tu bodega/i.test(cruce.texto),
    `esperaba "no está en tu bodega", vino "${cruce.texto}"`);
});

await c.prueba('no cruza medidas distintas (cajas contra unidades sueltas)', async () => {
  await agregarItem({ nombre: 'Tablero de breakers', cantidad: 3, unidad: 'caja' });
  await irA('mat');
  const cruce = await cruceDe('panel');
  afirmar(/no est[aá] en tu bodega/i.test(cruce.texto),
    'cruzo "cajas" contra un articulo que se mide en unidades');
});

await c.prueba('el resumen dice cuantas de las que ocupas ya tenes', async () => {
  const r = await resumen();
  afirmar(/cosas que ocup[aá]s/i.test(r), `resumen inesperado: ${r}`);
  const nums = r.match(/\d+/g).map(Number);
  afirmar(nums.length >= 2 && nums[1] <= nums[0], `el resumen no cuadra: ${r}`);
  afirmar(nums[1] >= 1, 'deberia contar al menos la toma que si alcanza');
});

await c.prueba('la lista de compras trae SOLO lo que falta', async () => {
  await page.click('#matCompras');
  await page.waitForSelector('#cpTxt', { timeout: 5000 });
  const txt = await page.inputValue('#cpTxt');
  afirmar(/comprar/i.test(txt), 'no se ve como una lista de compras');
  afirmar(/Cable/i.test(txt), 'no incluye el cable que falta');
  afirmar(!/Toma sencilla/i.test(txt), 'incluye algo que el electricista YA tiene');
  afirmar(/Ya ten[eé]s en bodega/i.test(txt), 'no dice cuanto ya esta cubierto');
  await page.click('#cpNo');
});

await c.prueba('el enlace elegido a mano manda y sobrevive a recargar', async () => {
  await irA('mat');
  // "Tablero" no casa solo con nada: se enlaza a mano contra un item compatible.
  await agregarItem({ nombre: 'Centro de carga 8 espacios', cantidad: 1, unidad: 'u' });
  await irA('mat');
  await page.click('#matLista [data-mat="panel"] [data-menl]');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-k]').length > 0, null, { timeout: 5000 });
  const opciones = await page.evaluate(() =>
    [...document.querySelectorAll('[data-k]')].map(b => ({ k: b.dataset.k, t: b.textContent })));
  const elegida = opciones.find(o => /Centro de carga/i.test(o.t));
  afirmar(elegida, `no ofrecio el centro de carga: ${JSON.stringify(opciones.map(o => o.t))}`);
  await page.click(`[data-k="${elegida.k}"]`);
  await page.waitForFunction(
    () => { const f = document.querySelector('#matLista [data-mat="panel"] .mc');
            return f && /ya lo ten/i.test(f.textContent); }, null, { timeout: 5000 });

  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll('.tool[data-tool]').length >= 10, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('tutomodal')?.remove());
  await irA('mat');
  const cruce = await cruceDe('panel');
  afirmar(/ya lo ten/i.test(cruce.texto), 'el enlace manual no sobrevivio a la recarga');
  afirmar(!/\?/.test(cruce.texto), 'sigue marcado como sugerencia sin confirmar');
});

await c.prueba('el cruce se actualiza al cambiar el stock, sin tocar el plano', async () => {
  const antes = await cruceDe('cable');
  await irA('bodega');
  await page.click('#bodLista [data-bitem] [data-bedit]');
  await page.waitForSelector('#bfNom', { timeout: 5000 });
  await esperarFoco(page, 'bfNom');
  const nombre = await page.inputValue('#bfNom');
  await page.fill('#bfCant', '500');
  await page.click('#bfOk');
  await page.waitForSelector('#bodLista', { timeout: 5000 });
  await irA('mat');
  const clave = /cable/i.test(nombre) ? 'cable' : 'toma';
  const despues = await cruceDe(clave);
  afirmar(despues.texto !== antes.texto || clave !== 'cable',
    'el cruce no reacciono al cambio de stock');
});

await c.prueba('el puente no genero errores de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);
