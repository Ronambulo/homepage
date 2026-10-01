import test from "node:test";
import assert from "node:assert/strict";
import { parseRepeat, nextRep, fmtRep, shortRep } from "../lib/lunares/repeat.js";
import { command } from "../lib/lunares/commands.js";

// jueves 1 de octubre de 2026, 10:00 (hora local)
const NOW = new Date(2026, 9, 1, 10, 0).getTime();
const at = (...a) => new Date(...a).getTime();
const c = (t) => command(t, NOW);

test("días de la semana", () => {
  const r = c("recuérdame todos los lunes a las 9 sacar la basura");
  assert.deepEqual(r.rep, { days: [1], h: 9, m: 0 });
  assert.equal(r.at, at(2026, 9, 5, 9, 0));
  assert.equal(r.text, "sacar la basura");
  assert.deepEqual(c("recuérdame los martes y jueves por la tarde ir al gimnasio").rep, { days: [2, 4], h: 17, m: 0 });
  assert.deepEqual(c("recuérdame cada sábado limpiar").rep.days, [6]);
});

test("diario, laborables y findes", () => {
  const d = c("recuérdame cada día a las 22 tomar la pastilla");
  assert.equal(d.at, at(2026, 9, 1, 22, 0));
  assert.equal(d.rep.days.length, 7);
  const l = c("avísame de lunes a viernes a las 8:30 de fichar");
  assert.deepEqual(l.rep, { days: [1, 2, 3, 4, 5], h: 8, m: 30 });
  assert.equal(l.text, "fichar");
  assert.equal(l.at, at(2026, 9, 2, 8, 30));
  assert.deepEqual(c("recuérdame los fines de semana regar las plantas").rep.days, [0, 6]);
});

test("mañana, tarde y noche", () => {
  assert.equal(c("recuérdame cada noche apagar la estufa").rep.h, 21);
  assert.equal(c("recuérdame cada noche a las 11 apagar la estufa").rep.h, 23);
  assert.equal(c("recuérdame todas las mañanas a las 8 tomar vitaminas").rep.h, 8);
});

test("despertador y alarma", () => {
  const w = c("despiértame de lunes a viernes a las 7");
  assert.equal(w.rep.h, 7);
  assert.equal(w.text, "¡Arriba!");
  assert.equal(c("pon una alarma todos los días a las 7").rep.h, 7);
});

test("mensual", () => {
  const r = c("recuérdame el día 5 de cada mes pagar el alquiler");
  assert.deepEqual(r.rep, { mday: 5, h: 9, m: 0 });
  assert.equal(r.at, at(2026, 9, 5, 9, 0));
  // noviembre no tiene 31: el último día
  assert.equal(nextRep({ mday: 31, h: 9, m: 0 }, at(2026, 9, 31, 10, 0)), at(2026, 10, 30, 9, 0));
});

test("intervalos", () => {
  const r = c("recuérdame cada 2 horas beber agua");
  assert.deepEqual(r.rep, { ms: 2 * 3600000 });
  assert.equal(r.at, NOW + 2 * 3600000);
  assert.equal(r.text, "beber agua");
  // tras dormir la página 5 horas, la siguiente cuadra con el ritmo: 10 → 12 → 14 → 16
  assert.equal(nextRep(r.rep, NOW + 5 * 3600000, NOW + 2 * 3600000), NOW + 6 * 3600000);
});

test("cada semana: el día de hoy", () => {
  assert.deepEqual(c("recuérdame cada semana llamar a la abuela").rep.days, [4]);
});

test("nextRep salta al día siguiente que toca", () => {
  const rep = { days: [1, 2, 3, 4, 5], h: 8, m: 30 };
  assert.equal(nextRep(rep, at(2026, 9, 2, 8, 30)), at(2026, 9, 5, 8, 30)); // viernes → lunes
});

test("sin repetición", () => {
  assert.equal(parseRepeat("mañana a las 9 llamar", NOW), null);
  assert.equal(c("recuérdame mañana a las 9 llamar").rep, undefined);
});

test("fmtRep y shortRep", () => {
  assert.equal(fmtRep({ days: [0, 1, 2, 3, 4, 5, 6], h: 9, m: 0 }), "cada día a las 9:00");
  assert.equal(fmtRep({ days: [1, 2, 3, 4, 5], h: 8, m: 30 }), "de lunes a viernes a las 8:30");
  assert.equal(fmtRep({ days: [0, 6], h: 10, m: 0 }), "los fines de semana a las 10:00");
  assert.equal(fmtRep({ days: [1], h: 1, m: 0 }), "cada lunes a la 1:00");
  assert.equal(fmtRep({ days: [0, 2, 4], h: 17, m: 0 }), "los martes, jueves y domingos a las 17:00");
  assert.equal(fmtRep({ mday: 5, h: 9, m: 0 }), "el día 5 de cada mes a las 9:00");
  assert.equal(fmtRep({ ms: 7200000 }), "cada 2 horas");
  assert.equal(fmtRep({ ms: 1800000 }), "cada media hora");
  assert.equal(shortRep({ days: [1, 2, 3, 4, 5] }), "L–V");
  assert.equal(shortRep({ ms: 7200000 }), "2 h");
});
