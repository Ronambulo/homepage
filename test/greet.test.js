import test from "node:test";
import assert from "node:assert/strict";
import { visit, greet } from "../lib/lunares/greet.js";

const T = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const r0 = () => 0;

test("visit cuenta las visitas del día", () => {
  const a = visit(null, T(1, 10));
  assert.equal(a.first, true);
  assert.equal(a.n, 1);
  const b = visit(a.seen, T(1, 10, 2)); // recarga al momento: la misma visita
  assert.equal(b.n, 1);
  const c = visit(b.seen, T(1, 11));
  assert.equal(c.n, 2);
  assert.equal(c.gap, T(1, 11) - T(1, 10, 2));
  const d = visit(c.seen, T(2, 9)); // otro día: vuelve a empezar
  assert.equal(d.n, 1);
});

test("saludos", () => {
  assert.match(greet({ first: true }, T(1, 10), "Ana").text, /Soy Kero/);
  assert.match(greet({ gap: 10 * 86400000, n: 1 }, T(1, 10), "", r0).text, /Cuánto tiempo/);
  assert.equal(greet({ gap: 3.5 * 86400000, n: 1 }, T(1, 10)).text, "¡Hola de nuevo! Hacía 3 días que no venías.");
  assert.equal(greet({ gap: 3600000, n: 1 }, T(1, 3), "", r0).face, "sus");
  assert.match(greet({ gap: 3600000, n: 4 }, T(1, 12), "", r0).text, /Ya van 4 hoy/);
  assert.equal(greet({ gap: 3600000, n: 2 }, T(1, 12)), null);
  assert.equal(greet({ gap: 60000, n: 4 }, T(1, 3)), null); // una recarga no cuenta
  assert.equal(greet(null), null);
});
