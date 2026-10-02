import { test } from "node:test";
import assert from "node:assert/strict";
import { extract, bestParas, refine, sourcesFor, checkWeb, cites } from "../lib/lunares/webai.js";
import { untag } from "../lib/lunares/web.js";

const NOW = new Date(2026, 9, 1, 8, 0).getTime();

test("untag quita etiquetas y entidades", () => {
  assert.equal(untag("<p>Hola&nbsp;<b>mundo</b> &laquo;ya&raquo; &#233;l &#99999999;</p>"), "Hola mundo «ya» él &#99999999;");
});

test("extract se queda con los párrafos del contenido", () => {
  const html = `<html><head><script>var x = "<p>no soy contenido, soy un script muy largo que no debería salir nunca</p>";</script></head>
  <body><nav><p>Inicio · Noticias · Deportes · Contacto · Más enlaces del menú principal de la web</p></nav>
  <article><p>La Torre Eiffel mide 330 metros de altura desde que se le añadió una nueva antena en 2022.</p>
  <p>Aceptamos cookies para mejorar tu experiencia en esta web, pulsa aceptar.</p>
  <p>Corto.</p>
  <p>Fue construida por Gustave Eiffel para la Exposición Universal de París de 1889 y tardó dos años.</p></article>
  <footer><p>Todos los derechos reservados a la empresa editora de este periódico digital, 2026.</p></footer></body></html>`;
  assert.deepEqual(extract(html), [
    "La Torre Eiffel mide 330 metros de altura desde que se le añadió una nueva antena en 2022.",
    "Fue construida por Gustave Eiffel para la Exposición Universal de París de 1889 y tardó dos años.",
  ]);
});

test("bestParas elige los párrafos que hablan de la pregunta, en orden", () => {
  const paras = ["El clima de París es templado y llueve a menudo en otoño.", "La Torre Eiffel mide 330 metros de altura.", "París tiene muchos museos famosos.", "La altura de la torre ha cambiado con las antenas."];
  assert.deepEqual(bestParas(paras, "¿cuánto mide de altura la torre Eiffel?", 2), [paras[1], paras[3]]);
});

test("refine quita relleno, añade el año y limita la fecha", () => {
  assert.deepEqual(refine("oye, dime ¿quién ganó la última Champions?", NOW), { q: "quién ganó la última Champions 2026", range: null });
  assert.deepEqual(refine("¿qué ha pasado hoy en Valencia?", NOW), { q: "qué ha pasado hoy en Valencia", range: "day" });
  assert.equal(refine("último iPhone 2025", NOW).q, "último iPhone 2025");
  assert.equal(refine("capital de Francia", NOW).q, "capital de Francia");
});

const v = {
  q: "altura torre eiffel",
  agree: ["330 metros"],
  results: [
    { site: "es.wikipedia.org", url: "https://es.wikipedia.org/wiki/Torre_Eiffel", title: "Torre Eiffel", text: "corto", paras: ["La Torre Eiffel mide 330 metros desde 2022.", "Fue construida por Gustave Eiffel en 1889."] },
    { site: "turismo.fr", url: "https://turismo.fr/eiffel", title: "Visitar la torre", text: "La torre recibe unos 7 millones de visitantes al año." },
  ],
};

test("sourcesFor numera las fuentes y marca lo confirmado", () => {
  const { list, prompt } = sourcesFor(v);
  assert.equal(list.length, 2);
  assert.match(prompt, /^\[1\] wikipedia\.org — Torre Eiffel: La Torre Eiffel mide 330 metros desde 2022\. Fue construida/);
  assert.match(prompt, /\[2\] turismo\.fr — Visitar la torre: La torre recibe/);
  assert.match(prompt, /Confirmado por varias fuentes: 330 metros\./);
});

test("checkWeb quita las frases con cifras o nombres que no están en las fuentes", () => {
  const src = sourcesFor(v).list.map((s) => `${s.site} ${s.title} ${s.text}`);
  const r = checkWeb("Mide 330 metros [1]. La diseñó Gustave Eiffel en 1889 [1]. La visitan 9 millones de personas al año [2]. Su arquitecto fue Stephen Sauvestre [1].", src, "¿cuánto mide la torre Eiffel?");
  assert.equal(r.text, "Mide 330 metros [1]. La diseñó Gustave Eiffel en 1889 [1].");
  assert.equal(r.bad.length, 2);
  // «unos 7 millones» y redondeos valen
  assert.equal(checkWeb("Recibe unos 7 millones de visitas [2].", src).bad.length, 0);
});

test("cites quita las marcas y devuelve las fuentes citadas", () => {
  const { list } = sourcesFor(v);
  assert.deepEqual(cites("[happy] Mide 330 metros [2][1]. Es de 1889 [1, 2]. 😀", list), {
    text: "Mide 330 metros. Es de 1889.",
    sources: [{ site: "turismo.fr", url: "https://turismo.fr/eiffel" }, { site: "wikipedia.org", url: "https://es.wikipedia.org/wiki/Torre_Eiffel" }],
  });
  // sin citas: las dos primeras fuentes
  assert.equal(cites("Mide 330 metros.", list).sources.length, 2);
});
