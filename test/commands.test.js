import test from "node:test";
import assert from "node:assert/strict";
import { command, findTodo, findFact } from "../lib/lunares/commands.js";

const NOW = new Date(2026, 9, 1, 10, 0).getTime();
const c = (t) => command(t, NOW);

test("recordatorios", () => {
  const r = c("recuérdame mañana a las 9 llamar a mamá");
  assert.equal(r.type, "remind");
  assert.equal(r.at, new Date(2026, 9, 2, 9, 0).getTime());
  assert.equal(r.text, "llamar a mamá");
  assert.equal(c("avísame en 10 minutos de sacar el horno").text, "sacar el horno");
  assert.equal(c("despiértame a las 7").text, "¡Arriba!");
  assert.equal(c("despiértame a las 7").at, new Date(2026, 9, 2, 7, 0).getTime());
});

test("recordatorio sin hora → tarea", () => {
  assert.deepEqual(c("recuérdame comprar pan"), { type: "todo", text: "comprar pan", fromRemind: true });
});

test("temporizadores", () => {
  const t = c("pon un temporizador de 5 minutos");
  assert.equal(t.type, "timer");
  assert.equal(t.ms, 5 * 60000);
  assert.equal(c("temporizador").ms, 0); // falta la duración
  assert.equal(c("pon una alarma a las 7").type, "remind");
});

test("listar y borrar recordatorios", () => {
  assert.equal(c("¿qué recordatorios tengo?").type, "reminders");
  assert.equal(c("borra todos los recordatorios").all, true);
  const u = c("borra el recordatorio de llamar");
  assert.equal(u.type, "unremind");
  assert.equal(u.all, false);
  assert.equal(u.text, "llamar");
});

test("tareas", () => {
  assert.deepEqual(c("apunta comprar leche"), { type: "todo", text: "Comprar leche" });
  assert.deepEqual(c("añade revisar el coche a la lista"), { type: "todo", text: "Revisar el coche" });
  assert.equal(c("pon música"), null);
  assert.equal(c("ya he hecho lo de la compra").type, "done");
  assert.equal(c("tacha comprar leche").text, "comprar leche");
});

test("memoria", () => {
  assert.deepEqual(c("recuerda que mi color favorito es el verde"), { type: "remember", text: "mi color favorito es el verde" });
  assert.equal(c("me llamo Enrique").type, "remember");
  assert.equal(c("me llamo Enrique").soft, true);
  assert.equal(c("¿qué sabes de mí?").type, "recall");
  assert.deepEqual(c("olvida todo"), { type: "forget", all: true });
  assert.deepEqual(c("olvida que me gusta el café"), { type: "forget", text: "me gusta el café" });
  assert.equal(c("recuerda que el viernes es el cumple de Ana").type, "remind");
});

test("no es una orden", () => {
  assert.equal(c("¿qué tiempo hace?"), null);
  assert.equal(c(""), null);
});

test("findTodo / findFact", () => {
  const list = [{ text: "Comprar leche" }, { text: "Revisar el coche", done: true }, { text: "Llamar al banco" }];
  assert.equal(findTodo(list, "leche"), 0);
  assert.equal(findTodo(list, "llamar banco"), 2);
  assert.equal(findTodo(list, "algo raro"), -1);
  assert.equal(findFact(["me gusta el café", "vivo en Madrid"], "madrid"), 1);
});

test("posponer avisos", () => {
  const NOW = new Date(2026, 9, 1, 10, 0).getTime();
  const c = (t) => command(t, NOW);
  assert.deepEqual(c("luego"), { type: "snooze", ms: 600000, bare: true, alt: null });
  assert.equal(c("pospónlo").ms, 600000);
  assert.equal(c("pospónlo").bare, false);
  assert.equal(c("pospón 15 minutos").ms, 15 * 60000);
  assert.equal(c("en media hora").ms, 30 * 60000);
  // sin aviso reciente, «avísame en 10 minutos» es un recordatorio nuevo
  const a = c("avísame en 10 minutos");
  assert.equal(a.type, "snooze");
  assert.equal(a.alt.type, "remind");
  assert.equal(c("avísame luego").alt, null);
  // con algo más que la duración no es posponer
  assert.equal(c("avísame en 10 minutos de sacar el horno").type, "remind");
  assert.equal(c("en 20 minutos sacar la ropa"), null);
});
