import test from "node:test";
import assert from "node:assert/strict";
import { dream } from "../lib/lunares/lines.js";

const f = {
  todos: ["Comprar pan integral y leche"],
  services: { down: ["Plex"] },
  weather: { rain: 80 },
  w: { cal: { events: [{ title: "Reunión de equipo semanal (sala 3)" }] } },
};

test("siempre empieza por zzz y es corto", () => {
  for (let i = 0; i < 300; i++) {
    const s = dream(i % 2 ? f : {});
    assert.match(s, /^zzz… /);
    assert.ok(s.length <= 50, s);
  }
});

test("a veces sueña con el día", () => {
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  // r: elección del evento/tarea/servicio, luego «del día» (< 0.5) y cuál
  assert.equal(dream({ services: { down: ["Plex"] } }, seq(0, 0.1, 0)), "zzz… Plex… vuelve…");
  assert.equal(dream({ w: { cal: { events: [{ title: "Reunión de equipo semanal" }] } } }, seq(0, 0.1, 0.9)), "zzz… reunión de equipo…");
  assert.match(dream({}, () => 0), /^zzz… galletas…$/);
});
