import test from "node:test";
import assert from "node:assert/strict";
import { summarize, sentences, host, blocklist, blocked, agree } from "../lib/lunares/web.js";

test("host, blocklist y blocked", () => {
  assert.equal(host("https://www.elpais.com/x"), "elpais.com");
  assert.equal(host("nope"), "");
  const b = blocklist("elpais.com, https://www.ejemplo.es/x; basura");
  assert.deepEqual(b, ["elpais.com", "ejemplo.es"]);
  assert.equal(blocked("blogs.elpais.com", b), true);
  assert.equal(blocked("noelpais.com", b), false);
});

test("sentences quita relleno, preguntas y frases cortadas", () => {
  const s = sentences("12 may 2025 — El Real Madrid ganó la final por tres goles a uno. ¿Quién marcó el gol? Acepta las cookies para seguir leyendo la noticia. Esto se corta a medias y no termina…");
  assert.deepEqual(s, ["El Real Madrid ganó la final por tres goles a uno."]);
});

test("agree: datos que repiten dos webs", () => {
  const a = agree([
    { site: "a.com", text: "La población de Madrid es de 3.400.000 habitantes según el INE." },
    { site: "b.com", text: "Madrid tiene unos 3.400.000 habitantes." },
  ], "población Madrid");
  assert.ok(a.includes("3.400.000"));
});

test("summarize contrasta y cita las fuentes", () => {
  const v = {
    q: "quién ganó la final de la Champions",
    results: [
      { site: "as.com", url: "https://as.com/1", text: "El Real Madrid ganó la final de la Champions ante el Dortmund. El partido se jugó en Wembley." },
      { site: "marca.com", url: "https://marca.com/2", text: "La final de la Champions la ganó el Real Madrid con goles de Carvajal y Vinicius." },
      { site: "c.com", url: "https://c.com/3", text: "Texto que no viene a cuento de nada en absoluto aquí presente." },
    ],
  };
  const s = summarize(v);
  assert.match(s.text, /^Según as\.com: el Real Madrid ganó/);
  assert.match(s.text, /Y en marca\.com: /);
  assert.equal(s.sources[0].url, "https://as.com/1");
  assert.ok(s.sources.length <= 3);
});

test("summarize: respuesta directa corta y vacío", () => {
  const s = summarize({ q: "temperatura Madrid", results: [{ site: "", title: "Respuesta directa", text: "28 °C" }] });
  assert.equal(s.text, "28 °C.");
  assert.deepEqual(summarize({ q: "x", results: [] }), { text: "", sources: [] });
});
