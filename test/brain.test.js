import test from "node:test";
import assert from "node:assert/strict";
import { answer, askedDay, topics } from "../lib/lunares/brain.js";

// jueves 1 de octubre de 2026, 8:00 (hora local)
const NOW = new Date(2026, 9, 1, 8, 0).getTime();
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const f = {
  todos: ["Comprar pan", "Llamar al banco", "Pagar la luz"],
  w: {
    svc: [{ name: "Plex", up: false }, { name: "Jellyfin", up: true, ms: 23 }, { name: "Nextcloud", up: true, ms: 80 }],
    cal: { ok: true, events: [
      { title: "Reunión", start: at(1, 10), end: at(1, 11) },
      { title: "Dentista", start: at(2, 17, 30), end: at(2, 18) },
      { title: "Cena", start: at(3, 21), end: at(3, 23) },
      { title: "Excursión", start: new Date(2026, 9, 4).toISOString(), end: new Date(2026, 9, 5).toISOString(), allDay: true },
    ] },
    wx: { city: "Madrid", t: 15, lo: 10, hi: 22, rain: 5, days: [
      { c: 0, lo: 10, hi: 22, rain: 5 }, { c: 61, lo: 11, hi: 18, rain: 80 }, { c: 2, lo: 9, hi: 20, rain: 10 }, { c: 0, lo: 8, hi: 21, rain: 0 },
    ] },
    fm: { nw: 10000, first: 9000, inc: 2000, exp: 800, s: 1200, inv: 3000 },
  },
};
const a = (q) => answer(q, f, NOW);

test("askedDay", () => {
  assert.equal(askedDay("qué tengo mañana", NOW).label, "mañana");
  assert.equal(askedDay("qué tengo el viernes", NOW).k, 1);
  assert.equal(askedDay("y el sábado?", NOW).label, "pasado mañana");
  assert.equal(askedDay("el domingo", NOW).label, "el domingo");
  assert.equal(askedDay("hoy", NOW).k, 0);
  const we = askedDay("qué hago el finde", NOW);
  assert.equal(we.from, new Date(2026, 9, 3).getTime());
  assert.equal(we.to, new Date(2026, 9, 5).getTime());
  assert.equal(askedDay("esta semana", NOW).to, new Date(2026, 9, 5).getTime());
  assert.equal(askedDay("cómo estás", NOW), null);
});

test("calendario por días", () => {
  assert.equal(a("¿qué tengo mañana?"), "Mañana tienes «Dentista» a las 17:30.");
  assert.equal(a("¿qué tengo hoy?"), "Hoy tienes «Reunión» a las 10:00.");
  assert.equal(a("¿tengo algo el domingo?"), "Hoy tienes «Excursión» (todo el día).".replace("Hoy", "El domingo"));
  assert.equal(a("¿qué tengo el lunes?"), "No tienes nada el lunes.");
  assert.match(a("¿qué planes tengo este finde?"), /«Cena» el sábado a las 21:00 y «Excursión» el domingo/);
  assert.match(a("¿qué tengo el 20 de octubre?"), /Solo veo los próximos 8 días/);
});

test("tiempo de otro día", () => {
  assert.equal(a("¿lloverá mañana?"), "Mañana, un 80% de lluvia en Madrid.");
  assert.equal(a("¿qué tiempo hará el sábado?"), "Pasado mañana de 9° a 20°, algo nublado en Madrid.");
  assert.match(a("¿qué tiempo hará el lunes?"), /Solo tengo la previsión de los próximos 4 días/);
  assert.match(a("¿qué tiempo hace?"), /^Ahora 15° en Madrid/);
});

test("servicios por nombre", () => {
  assert.equal(a("¿está caído Plex?"), "Plex no responde ahora mismo.");
  assert.equal(a("¿cómo va jellyfin?"), "Jellyfin funciona (23 ms).");
  assert.match(a("¿hay algún servicio caído?"), /No responde: Plex/);
});

test("tareas y dinero", () => {
  assert.match(a("¿cuántas tareas me quedan?"), /^Te quedan 3/);
  assert.match(a("¿cuánto he gastado este mes?"), /has gastado 800 €/);
  assert.deepEqual(topics("¿estoy libre el viernes?"), ["cal"]);
});

test("lo que no va de datos", () => {
  assert.equal(a("cuéntame un chiste"), null);
});
