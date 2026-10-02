import { test } from "node:test";
import assert from "node:assert/strict";
import { near1, fixTypos, followUp, route, SURE } from "../lib/lunares/router.js";
import { toolOf, shown } from "../lib/lunares/tools.js";

test("near1: un error como mucho", () => {
  assert.ok(near1("temporizador", "temporisador"));
  assert.ok(near1("recuerdame", "recuedrame"));
  assert.ok(near1("quien", "qien"));
  assert.ok(near1("buscame", "busacme"));
  assert.ok(!near1("temporizador", "temprisador"));
  assert.ok(!near1("cuanto", "cuando ya"));
});

test("fixTypos: solo las palabras clave largas", () => {
  assert.equal(fixTypos("pon un temporisador de 5 minutos"), "pon un temporizador de 5 minutos");
  assert.equal(fixTypos("¿qien es el presidente?"), "¿quien es el presidente?");
  assert.equal(fixTypos("¿cuánto falta?"), "¿cuánto falta?");
  assert.equal(fixTypos("¿qué es una gota?"), "¿qué es una gota?");
});

test("followUp: completa con la pregunta anterior", () => {
  assert.equal(followUp("¿Quién ganó la Champions en 2024?", "¿y en 2023?"), "Quién ganó la Champions en 2023");
  assert.equal(followUp("¿Quién ganó la Champions en 2024?", "¿y el año anterior?"), "Quién ganó la Champions en 2023");
  assert.equal(followUp("¿Qué tiempo hace hoy?", "¿y mañana?"), "Qué tiempo hace mañana");
  assert.equal(followUp("¿Qué tiempo hace en Madrid?", "¿y en Barcelona?"), "Qué tiempo hace en Barcelona");
  assert.equal(followUp("¿Está caído Plex?", "¿y Jellyfin?"), "Está caído Jellyfin");
  assert.equal(followUp("¿Cómo va el servidor?", "¿y la temperatura?"), "Cómo va el servidor, la temperatura");
  assert.equal(followUp("¿Qué hora es?", "¿qué día es?"), null);
  assert.equal(followUp(null, "¿y mañana?"), null);
});

test("route: seguimientos y órdenes dentro de un «y…»", () => {
  const r = route("¿y recuérdame llamar a Pedro a las 6?", { prev: "¿qué tiempo hace?" });
  assert.equal(r.type, "command");
  assert.equal(r.c.type, "remind");
  const w = route("¿y en 2023?", { prev: "¿Quién ganó la Champions en 2024?" });
  assert.equal(w.type, "web");
  assert.match(w.merged, /2023/);
  assert.equal(route("hola, ¿qué tal?").type, "ai");
  assert.ok(route("busca recetas de paella").score >= SURE);
});

test("toolOf: lee la etiqueta de la IA", () => {
  assert.deepEqual(toolOf("[think] [busca: presidente de Francia]"), { name: "busca", arg: "presidente de Francia" });
  assert.deepEqual(toolOf("[proud] [orden: recuérdame mañana a las 10 llamar al dentista]"), { name: "orden", arg: "recuérdame mañana a las 10 llamar al dentista" });
  assert.deepEqual(toolOf("[happy] [abrir: «Plex»]"), { name: "abre", arg: "Plex" });
  // sin cerrar: solo vale al terminar
  assert.equal(toolOf("[think] [busca: presidente de Fr", false), null);
  assert.deepEqual(toolOf("[think] [busca: presidente de Francia", true), { name: "busca", arg: "presidente de Francia" });
  assert.equal(toolOf("[happy] Una gota es una porción de líquido."), null);
  assert.equal(toolOf("<think>quizá [busca: algo]</think>[happy] Hola."), null);
});

test("shown: no enseña una etiqueta a medio escribir", () => {
  assert.equal(shown("[happy] Hola, qué tal [bus"), "[happy] Hola, qué tal ");
  assert.equal(shown("[happy] Hola."), "[happy] Hola.");
});
