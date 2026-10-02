import { test } from "node:test";
import assert from "node:assert/strict";
import { nums, sameNum, checkNumbers, calc } from "../lib/lunares/numbers.js";

const NOW = new Date(2026, 9, 1, 8, 0).getTime(); // jueves 1 de octubre de 2026, 8:00
const GB = 1073741824;
const f = {
  w: {
    fm: { nw: 9876.5, first: 9000, inc: 2000, exp: 800, s: 1200, inv: 3000 },
    srv: { ok: true, cpu: 12, ramUsed: 6 * GB, ramTotal: 16 * GB, disk: { used: 400 * GB, total: 1000 * GB } },
    cal: { ok: true, events: [{ title: "Dentista", start: new Date(2026, 9, 2, 17, 30).toISOString(), end: new Date(2026, 9, 2, 18).toISOString() }] },
  },
};

test("nums lee cifras en español", () => {
  assert.deepEqual(nums("1.234,56 € y 3.5 y 1,2 mil, 10k, 3 millones"), [1234.56, 3.5, 1200, 10000, 3e6]);
  assert.deepEqual(nums("a las 17:30"), [17, 30]);
  assert.deepEqual(nums("gemma4e4b"), []);
});

test("sameNum acepta redondeos y no cifras distintas", () => {
  assert.ok(sameNum(1235, 1234.56));
  assert.ok(sameNum(1200, 1234.56));
  assert.ok(sameNum(9900, 9876.5));
  assert.ok(sameNum(10000, 9876.5));
  assert.ok(!sameNum(20, 23));
  assert.ok(!sameNum(1500, 1234.56));
  assert.ok(!sameNum(8000, 9876.5));
});

test("checkNumbers quita la frase con la cifra inventada y pone la exacta", () => {
  const known = "Patrimonio: neto 9.877 €; ingresos 2.000 €, gastos 800 €, ahorro 1.200 €.";
  const r = checkNumbers("[happy] Tienes unos 9.900 €. Este mes has gastado 1.500 €. ¡Bien!", known, "Este ciclo has gastado 800 €.");
  assert.equal(r.text, "[happy] Tienes unos 9.900 €. Este ciclo has gastado 800 €. ¡Bien!");
  assert.deepEqual(r.bad, ["Este mes has gastado 1.500 €."]);
  // sin respuesta exacta, la frase se quita
  assert.equal(checkNumbers("[sus] Has gastado 4.321 €.", known).text, "");
  // números pequeños y cifras que sí están: no se tocan
  assert.equal(checkNumbers("Te quedan 3 tareas y 1.200 € ahorrados.", known).bad.length, 0);
});

test("calc: cuentas sueltas", () => {
  assert.match(calc("¿cuánto es 23 por 17?", {}, NOW), /23 por 17 = 391/);
  assert.match(calc("calcula (1.500 - 200) / 4", {}, NOW), /= 325/);
  assert.match(calc("¿cuánto es el 15% de 2.400?", {}, NOW), /es 360/);
  assert.equal(calc("¿cuánto es la capital de Francia?", {}, NOW), null);
});

test("calc: patrimonio, servidor y cuánto falta", () => {
  const goal = calc("¿cuánto me falta para 15.000 €?", f, NOW);
  assert.match(goal, /te faltan 5124 €/);
  assert.match(goal, /1200 € al mes \(como este ciclo\), 5 meses/);
  assert.match(goal, /ahorras el 60%/);
  assert.match(calc("si ahorro 500 € al mes, ¿cuándo llego a 20 mil?", f, NOW), /ahorrando 500 € al mes, 21 meses/);
  assert.match(calc("¿cuánto espacio libre tiene el disco del servidor?", f, NOW), /600 GB libres de 1000 GB/);
  assert.match(calc("¿cuánto falta para el dentista?", f, NOW), /faltan 1 día y 9 horas/);
  assert.match(calc("¿cuántos días faltan para navidad?", f, NOW), /faltan 85 días/);
  assert.equal(calc("hola, ¿qué tal?", f, NOW), null);
});
