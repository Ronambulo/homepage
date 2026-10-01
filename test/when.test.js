import test from "node:test";
import assert from "node:assert/strict";
import { parseWhen, duration, fmtWhen, shortWhen } from "../lib/lunares/when.js";

// jueves 1 de octubre de 2026, 10:00 (hora local)
const NOW = new Date(2026, 9, 1, 10, 0).getTime();
const at = (...a) => new Date(...a).getTime();

test("duration", () => {
  assert.equal(duration("20 minutos"), 20 * 60000);
  assert.equal(duration("una hora y media"), 90 * 60000);
  assert.equal(duration("2 horas y 10 minutos"), 130 * 60000);
  assert.equal(duration("media hora"), 30 * 60000);
  assert.equal(duration("nada"), 0);
});

test("relativo: en / dentro de", () => {
  const w = parseWhen("en 20 minutos sacar la ropa", NOW);
  assert.equal(w.at, NOW + 20 * 60000);
  assert.equal(w.rest, "sacar la ropa");
  assert.equal(parseWhen("dentro de una hora y media", NOW).at, NOW + 90 * 60000);
});

test("mañana, pasado mañana y días de la semana", () => {
  assert.equal(parseWhen("mañana a las 9 llamar", NOW).at, at(2026, 9, 2, 9, 0));
  assert.equal(parseWhen("mañana a las 9 llamar", NOW).rest, "llamar");
  assert.equal(parseWhen("pasado mañana", NOW).at, at(2026, 9, 3, 9, 0));
  assert.equal(parseWhen("el viernes por la tarde", NOW).at, at(2026, 9, 2, 17, 0));
  // hoy es jueves: «el jueves» es el de la semana que viene
  assert.equal(parseWhen("el jueves a las 8:30", NOW).at, at(2026, 9, 8, 8, 30));
});

test("«de la mañana» no se confunde con «mañana»", () => {
  // ya han pasado las 7: mañana
  assert.equal(parseWhen("a las 7 de la mañana", NOW).at, at(2026, 9, 2, 7, 0));
});

test("hora sola: la próxima que tenga sentido", () => {
  assert.equal(parseWhen("a las 6", NOW).at, at(2026, 9, 1, 18, 0));
  assert.equal(parseWhen("a las 11", NOW).at, at(2026, 9, 1, 11, 0));
  assert.equal(parseWhen("a las 18:30", NOW).at, at(2026, 9, 1, 18, 30));
  assert.equal(parseWhen("a las 7 y media", NOW).at, at(2026, 9, 1, 19, 30));
  assert.equal(parseWhen("a las 6", NOW, { am: true }).at, at(2026, 9, 2, 6, 0));
});

test("fechas", () => {
  assert.equal(parseWhen("el 3 de mayo", NOW).at, at(2027, 4, 3, 9, 0));
  assert.equal(parseWhen("el 15 de octubre a las 10", NOW).at, at(2026, 9, 15, 10, 0));
  assert.equal(parseWhen("el 24/12", NOW).at, at(2026, 11, 24, 9, 0));
});

test("sin fecha", () => {
  assert.equal(parseWhen("comprar pan", NOW), null);
});

test("fmtWhen y shortWhen", () => {
  assert.equal(fmtWhen(NOW + 20 * 60000, NOW), "en 20 minutos");
  assert.equal(fmtWhen(at(2026, 9, 1, 18, 30), NOW), "hoy a las 18:30");
  assert.equal(fmtWhen(at(2026, 9, 2, 9, 0), NOW), "mañana a las 9:00");
  assert.equal(fmtWhen(at(2026, 9, 2, 1, 0), NOW), "mañana a la 1:00");
  assert.equal(shortWhen(at(2026, 9, 1, 18, 30), NOW), "18:30");
  assert.equal(shortWhen(at(2026, 9, 2, 9, 0), NOW), "mañana 9:00");
});
