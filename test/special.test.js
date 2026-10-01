import test from "node:test";
import assert from "node:assert/strict";
import { special, birthday } from "../lib/lunares/special.js";

const T = (mo, d, h = 10, y = 2026) => new Date(y, mo, d, h).getTime();
const r0 = () => 0;

test("cumpleaños desde la memoria", () => {
  assert.deepEqual(birthday([{ text: "mi cumpleaños es el 3 de mayo" }]), { d: 3, m: 4 });
  assert.deepEqual(birthday([{ text: "nací el 12/11/1990" }]), { d: 12, m: 10 });
  assert.equal(birthday([{ text: "me gusta el 3 de mayo" }]), null);
  const mem = [{ text: "Mi cumple es el 3 de mayo" }];
  const s = special(T(4, 3), mem, "Enrique", r0);
  assert.equal(s.key, "bday:2026");
  assert.equal(s.act, "party");
  assert.match(s.text, /Enrique/);
  assert.equal(special(T(4, 2, 18), mem, "", r0).key, "bday-1:2026");
  assert.equal(special(T(4, 2, 9), mem, "", r0), null); // el día antes, solo por la tarde (y es sábado por la mañana)
});

test("fiestas", () => {
  assert.equal(special(T(11, 25), [], "", r0).key, "xmas:2026");
  assert.equal(special(T(0, 1, 10, 2027), [], "", r0).key, "ny:2027");
  assert.equal(special(T(11, 31, 12), [], "", r0), null);
  assert.equal(special(T(11, 31, 20), [], "", r0).key, "nv:2026");
});

test("viernes tarde y lunes mañana", () => {
  // 2 de octubre de 2026 es viernes; 5, lunes
  assert.equal(special(T(9, 2, 16), [], "", r0).key, "fri:2026-10-2");
  assert.equal(special(T(9, 2, 10), [], "", r0), null);
  assert.equal(special(T(9, 5, 8), [], "", r0).act, "sigh");
  assert.equal(special(T(9, 1, 10), [], "", r0), null); // jueves
});
