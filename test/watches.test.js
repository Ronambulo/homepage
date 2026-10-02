import { test } from "node:test";
import assert from "node:assert/strict";
import { numberIn, watchOf, resolveWatch, checkWatch, watchSay, watchLabel, relOf, resolveRel } from "../lib/lunares/watches.js";
import { command } from "../lib/lunares/commands.js";

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 1, 10, 0).getTime(); // jueves 1 de octubre, 10:00
const at = (h, m = 0, d = 1) => new Date(2026, 9, d, h, m).toISOString();

test("numberIn: cifras como se dicen", () => {
  assert.equal(numberIn("pase de 50.000"), 50000);
  assert.equal(numberIn("50 mil euros"), 50000);
  assert.equal(numberIn("50k"), 50000);
  assert.equal(numberIn("1,5 millones"), 1500000);
  assert.equal(numberIn("del 90%"), 90);
  assert.equal(numberIn("18,5 grados"), 18.5);
  assert.equal(numberIn("nada"), null);
});

test("watchOf: lo que se puede vigilar", () => {
  const w = (s) => command(s, NOW)?.w;
  assert.deepEqual({ ...w("avísame si la CPU pasa de 80"), until: 0 }, { k: "srv", m: "cpu", op: ">", n: 80, until: 0 });
  assert.equal(w("avísame si la RAM pasa del 90%").m, "ram");
  assert.equal(w("avísame si el disco supera el 95%").m, "disk");
  assert.deepEqual([w("avísame si se calienta el servidor").m, w("avísame si se calienta el servidor").n], ["temp", 80]); // sin número, el de siempre
  assert.deepEqual([w("avísame si en casa baja de 18 grados").k, w("avísame si en casa baja de 18 grados").op], ["ha", "<"]);
  assert.deepEqual([w("avísame cuando vuelva Plex").name, w("avísame cuando vuelva Plex").up], ["Plex", true]);
  assert.deepEqual([w("avísame si se cae Jellyfin").name, w("avísame si se cae Jellyfin").up], ["Jellyfin", false]);
  assert.equal(w("avísame cuando el patrimonio pase de 50.000").n, 50000);
  const r = w("avísame si mañana llueve");
  assert.equal(r.k, "rain");
  assert.equal(new Date(r.day).getDate(), 2);
  assert.equal(r.until, r.day + DAY);
  assert.equal(new Date(w("avísame si llueve el sábado").day).getDate(), 3);
  assert.equal(command("avísame si tal cosa", NOW)?.bad, true);
  // lo de siempre sigue igual
  assert.equal(command("avísame a las 18:00 de la reunión", NOW).type, "remind");
  assert.equal(command("avísame cuando sean las 5", NOW).type, "todo");
  assert.equal(watchOf("mañana a las 9", NOW), null);
});

test("resolveWatch: el servicio por su nombre, y que el widget esté", () => {
  const f = { w: { svc: [{ name: "Plex", up: false }, { name: "Jellyfin", up: true }] } };
  assert.equal(resolveWatch({ k: "svc", name: "plex", up: true }, f).w.name, "Plex");
  assert.equal(resolveWatch({ k: "svc", name: "jelly", up: true }, f).w.name, "Jellyfin");
  assert.match(resolveWatch({ k: "svc", name: "Sonarr", up: true }, f).err, /Sonarr/);
  assert.match(resolveWatch({ k: "srv", m: "cpu", op: ">", n: 80 }, f).err, /servidor/);
});

test("checkWatch: avisa cuando se cumple", () => {
  const cpu = { k: "srv", m: "cpu", op: ">", n: 80 };
  assert.equal(checkWatch(cpu, { w: { srv: { cpu: 50 } } }, NOW), null);
  assert.equal(checkWatch(cpu, { w: { srv: { cpu: 85 } } }, NOW), "la CPU va al 85%");
  assert.equal(checkWatch(cpu, {}, NOW), null); // sin datos, nada
  assert.equal(checkWatch({ k: "srv", m: "disk", op: ">", n: 90 }, { w: { srv: { disk: { used: 95, total: 100 } } } }, NOW), "el disco va al 95%");
  const plex = { k: "svc", name: "Plex", up: true };
  assert.equal(checkWatch(plex, { w: { svc: [{ name: "Plex", up: false }] } }, NOW), null);
  assert.equal(checkWatch(plex, { w: { svc: [{ name: "Plex", up: true }] } }, NOW), "Plex funciona");
  const rain = { k: "rain", day: new Date(2026, 9, 2).getTime() };
  const wx = (r) => ({ w: { wx: { city: "Madrid", rain: 0, days: [{ rain: 0 }, { rain: r }] } } });
  assert.equal(checkWatch(rain, wx(20), NOW), null);
  assert.equal(checkWatch(rain, wx(70), NOW), "mañana hay un 70% de lluvia en Madrid");
  assert.equal(checkWatch(rain, { w: { wx: { rain: 80, days: [{ rain: 80 }] } } }, NOW + DAY), "hoy hay un 80% de lluvia"); // ya es ese día
  const fm = { k: "fm", op: ">", n: 50000 };
  assert.equal(checkWatch(fm, { w: { fm: { state: "loading" } } }, NOW), null);
  assert.match(checkWatch(fm, { w: { fm: { nw: 50321 } } }, NOW), /^tu patrimonio ya pasa de 50\.000 €: 50\.321 €$/);
  assert.equal(checkWatch({ k: "ha", op: "<", n: 18 }, { w: { ha: { temp: 17.5 } } }, NOW), "en casa hay 17,5 °C");
});

test("watchSay y watchLabel", () => {
  assert.equal(watchSay({ k: "srv", m: "cpu", op: ">", n: 80 }), "si la CPU pasa de 80%");
  assert.equal(watchSay({ k: "svc", name: "Plex", up: true }), "cuando vuelva Plex");
  assert.equal(watchSay({ k: "rain", day: new Date(2026, 9, 2).getTime() }, NOW), "si mañana llueve");
  assert.equal(watchLabel({ k: "srv", m: "ram", op: ">", n: 90 }), "RAM > 90%");
  assert.equal(watchLabel({ k: "fm", op: ">", n: 50000 }), "Patrimonio > 50.000 €");
});

test("relOf y resolveRel: recordatorios con la agenda", () => {
  const r = relOf("10 minutos antes de la reunión");
  assert.deepEqual(r, { ev: "reunión", ms: 10 * MIN, edge: "start", text: "" });
  assert.deepEqual(relOf("llevar el portátil media hora antes de la reunión"), { ev: "reunión", ms: 30 * MIN, edge: "start", text: "llevar el portátil" });
  assert.deepEqual(relOf("un cuarto de hora antes del partido que compre cerveza"), { ev: "partido", ms: 15 * MIN, edge: "start", text: "compre cerveza" });
  assert.equal(relOf("al acabar el dentista").edge, "end");
  assert.equal(relOf("cuando empiece el partido").edge, "start");
  assert.equal(relOf("después de comer llamar a Ana").soft, true);
  assert.equal(relOf("antes de las 9 llamar a Ana"), null);
  assert.equal(relOf("mañana a las 9"), null);
  const events = [
    { title: "Reunión de equipo", start: at(9), end: at(9, 30) }, // ya pasó
    { title: "Reunión de equipo", start: at(16), end: at(17) },
    { title: "Dentista", start: at(12), end: at(13) },
    { title: "Cumple", start: at(0), allDay: true },
  ];
  assert.equal(resolveRel(r, events, NOW).at, +new Date(at(16)) - 10 * MIN);
  assert.equal(resolveRel(relOf("al acabar el dentista"), events, NOW).at, +new Date(at(13)));
  assert.equal(resolveRel(relOf("antes del cine"), events, NOW), null);
  assert.equal(resolveRel(relOf("al empezar el dentista"), events, NOW + 3 * HOUR).past, true);
  // «después de comer» sin evento: sigue siendo una tarea, como antes
  assert.equal(command("recuérdame después de comer llamar a Ana", NOW).alt.type, "todo");
});

test("varias órdenes en una frase", () => {
  const c = command("recuérdame mañana llamar a mamá y apunta comprar pan", NOW);
  assert.equal(c.type, "multi");
  assert.deepEqual(c.list.map((x) => x.type), ["remind", "todo"]);
  assert.equal(c.list[0].text, "llamar a mamá");
  assert.equal(c.list[1].text, "Comprar pan");
  assert.deepEqual(command("apunta pan y apunta leche y recuérdame en 10 minutos sacar la ropa", NOW).list.map((x) => x.type), ["todo", "todo", "remind"]);
  assert.equal(command("apunta comprar pan y también avísame si la CPU pasa de 80", NOW).list[1].type, "watch");
  // una sola orden con «y» dentro
  assert.equal(command("apunta comprar pan y leche", NOW).type, "todo");
  assert.equal(command("recuérdame mañana a las 9 llamar a mamá y a papá", NOW).text, "llamar a mamá y a papá");
  assert.equal(command("recuérdame que compre pan y que llame a mamá", NOW).type, "todo");
  assert.equal(command("me gusta el queso y apunta pan", NOW)?.type, "remember"); // «me gusta…» suelto no cuenta como orden
});
