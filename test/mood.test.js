import test from "node:test";
import assert from "node:assert/strict";
import { mood, decay, raise } from "../lib/lunares/mood.js";
import { nudges, pruneSaid } from "../lib/lunares/nudges.js";

const at = (...a) => new Date(...a).getTime();

test("mood", () => {
  assert.equal(mood({ alerts: 2 }).key, "agobiado");
  assert.equal(mood({ grump: 0.6 }).key, "gruñón");
  assert.equal(mood({ joy: 0.6 }).key, "mimoso");
  assert.equal(mood({ idleMin: 40 }).key, "aburrido");
  assert.equal(mood({ total: 3, joy: 0.2 }).key, "radiante");
  assert.equal(mood({}).key, "contento");
  assert.equal(mood({ alerts: 1, idleMin: 15 }).key, "tranquilo");
});

test("decay y raise", () => {
  assert.ok(Math.abs(decay(1, 300000, 300000) - Math.exp(-1)) < 1e-9);
  assert.equal(raise(0.8, 0.5), 1);
});

test("nudges: evento en 10 minutos, una sola vez", () => {
  const now = at(2026, 9, 1, 10, 0);
  const f = { w: { cal: { events: [{ title: "Reunión", start: new Date(now + 8 * 60000).toISOString() }] } } };
  const n = nudges(f, now);
  assert.equal(n.length, 1);
  assert.match(n[0].text, /Reunión.*8 minutos/);
  assert.equal(n[0].wake, true);
  assert.equal(nudges(f, now, { [n[0].key]: now }).length, 0);
});

test("nudges: lluvia de día y madrugón mañana por la tarde", () => {
  assert.equal(nudges({ weather: { rain: 80 } }, at(2026, 9, 1, 9, 0))[0].key, "rain:2026-10-1");
  assert.equal(nudges({ weather: { rain: 80 } }, at(2026, 9, 1, 22, 0)).length, 0);
  const ev = { w: { cal: { events: [{ title: "Dentista", start: new Date(2026, 9, 2, 8, 30).toISOString() }] } } };
  assert.equal(nudges(ev, at(2026, 9, 1, 20, 0))[0].key, "early:2026-10-2");
  assert.equal(nudges(ev, at(2026, 9, 1, 15, 0)).length, 0);
});

test("nudges: servicio que vuelve", () => {
  const n = nudges({ services: { down: [] } }, at(2026, 9, 1, 10, 0), {}, ["Plex"]);
  assert.match(n[0].text, /Plex vuelve/);
});

test("pruneSaid", () => {
  const now = at(2026, 9, 5);
  assert.deepEqual(pruneSaid({ a: now - 1000, b: now - 3 * 86400000 }, now), { a: now - 1000 });
});
