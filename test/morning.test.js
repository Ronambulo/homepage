import test from "node:test";
import assert from "node:assert/strict";
import { morning, morningReady, dayKey } from "../lib/lunares/morning.js";

// jueves 1 de octubre de 2026, 8:00 (hora local)
const NOW = new Date(2026, 9, 1, 8, 0).getTime();
const at = (h, m = 0, d = 1) => new Date(2026, 9, d, h, m).toISOString();

const facts = {
  weather: { t: 14, hi: 21, lo: 12, rain: 70, city: "Madrid" },
  todos: ["Comprar pan", "Llamar al banco"],
  services: { total: 5, down: ["Plex"] },
  w: { cal: { ok: true, events: [
    { title: "Reunión", start: at(10), end: at(11) },
    { title: "Dentista", start: at(17, 30), end: at(18) },
    { title: "Ya pasó", start: at(7), end: at(7, 30) },
    { title: "Mañana", start: at(9, 0, 2), end: at(10, 0, 2) },
    { title: "Cumple de Ana", start: "2026-10-01", end: "2026-10-02", allDay: true },
  ] } },
};

test("agenda, tiempo y pendientes", () => {
  const rems = [{ at: new Date(2026, 9, 1, 22).getTime(), text: "tomar la pastilla" }, { at: new Date(2026, 9, 2, 9).getTime(), text: "mañana no" }];
  const [one, two] = morning(facts, rems, NOW);
  assert.match(one, /«Reunión» a las 10:00 y «Dentista» a las 17:30/);
  assert.doesNotMatch(one, /Ya pasó|Mañana/);
  assert.match(one, /Hoy es «Cumple de Ana»/);
  assert.match(one, /de 12° a 21°, con un 70% de lluvia: mejor llévate paraguas/);
  assert.match(two, /Te recordaré tomar la pastilla \(22:00\)/);
  assert.doesNotMatch(two, /mañana no/);
  assert.match(two, /Te quedan 2 tareas/);
  assert.match(two, /Plex está caído/);
});

test("día tranquilo", () => {
  const p = morning({ weather: { hi: 20, lo: 10, rain: 0 }, todos: [], services: { down: [] }, w: { cal: { ok: true, events: [] } } }, [], NOW);
  assert.deepEqual(p, ["Hoy no tienes nada en el calendario. Hoy de 10° a 20°."]);
});

test("sin datos todavía", () => {
  assert.equal(morningReady({}), false);
  assert.equal(morningReady({ weather: { hi: 1, lo: 0 } }), true);
  assert.deepEqual(morning({}, [], NOW), []);
  assert.equal(dayKey(NOW), "2026-10-1");
});
