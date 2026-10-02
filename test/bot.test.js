import { test } from "node:test";
import assert from "node:assert/strict";
import { pairOf, takeDue, remText, pageRems, sentKey, pruneSent, botCommand, botContext, plainText, newCode } from "../lib/lunares/bot.js";

const T = new Date(2026, 9, 2, 12, 0).getTime(), MIN = 60000;

test("pairOf: saca el código de 6 cifras", () => {
  assert.equal(pairOf("123456"), "123456");
  assert.equal(pairOf("/start 654321"), "654321");
  assert.equal(pairOf("el código es 123 456"), "123456");
  assert.equal(pairOf("hola"), null);
  assert.equal(pairOf("1234567"), null);
  assert.match(newCode(), /^\d{6}$/);
});

test("takeDue: separa lo que toca, repite y tira lo muy viejo", () => {
  const list = [
    { id: "a", at: T - MIN, text: "llamar" },
    { id: "b", at: T + MIN, text: "luego" },
    { id: "c", at: T - 2 * 864e5, text: "viejo" },
    { id: "d", at: T - MIN, text: "pastilla", rep: { ms: 864e5 } },
  ];
  const { due, keep } = takeDue(list, T);
  assert.deepEqual(due.map((r) => r.id).sort(), ["a", "d"]);
  assert.ok(keep.some((r) => r.id === "b"));
  const d = keep.find((r) => r.id === "d");
  assert.ok(d && d.at > T, "el que se repite vuelve con su próxima vez");
  assert.ok(!keep.some((r) => r.id === "a" || r.id === "c"));
});

test("remText: uno, varios y con retraso", () => {
  assert.match(remText([{ at: T, text: "llamar a mamá" }], T), /^¡Recordatorio! Llamar a mamá/);
  assert.match(remText([{ at: T, kind: "timer" }], T), /Se acabó el tiempo/);
  assert.match(remText([{ at: T - 10 * MIN, text: "x" }], T), /^Se me pasó avisarte/);
  assert.match(remText([{ at: T, text: "a" }, { at: T, text: "b" }], T), /^Tienes 2 recordatorios/);
});

test("pageRems: limpia, marca y quita lo ya avisado", () => {
  const r1 = { id: "p1", at: T, text: "uno" }, r2 = { id: "p2", at: T + MIN, text: "dos", kind: "timer" };
  const out = pageRems([r1, r2, { id: 3, at: T }, null, { id: "x", at: "no" }], { [sentKey(r1)]: T });
  assert.deepEqual(out, [{ id: "p2", at: T + MIN, text: "dos", kind: "timer", page: true }]);
  assert.deepEqual(pageRems("nada"), []);
});

test("pruneSent: olvida los avisos de hace más de 3 días", () => {
  assert.deepEqual(pruneSent({ a: T, b: T - 4 * 864e5 }, T), { a: T });
});

test("botCommand: recordatorio y temporizador", () => {
  const r = botCommand({ type: "remind", at: T + 60 * MIN, text: "llamar a mamá" }, { now: T });
  assert.match(r.reply, /^Vale, te lo recuerdo/);
  assert.equal(r.rems.length, 1);
  assert.equal(r.rems[0].text, "llamar a mamá");
  assert.match(botCommand({ type: "remind", past: true, at: T - MIN }, { now: T }).reply, /ya ha pasado/);
  const t = botCommand({ type: "timer", ms: 10 * MIN, at: T + 10 * MIN }, { now: T });
  assert.equal(t.rems[0].kind, "timer");
});

test("botCommand: tareas van a la bandeja de la página", () => {
  const a = botCommand({ type: "todo", text: "comprar pan" }, { todos: ["lavar"], now: T });
  assert.deepEqual(a.inbox, [{ op: "todo", text: "comprar pan" }]);
  assert.deepEqual(a.todos, ["lavar", "comprar pan"]);
  const d = botCommand({ type: "done", text: "lavar" }, { todos: ["lavar", "comprar pan"], now: T });
  assert.deepEqual(d.inbox, [{ op: "done", text: "lavar" }]);
  assert.deepEqual(d.todos, ["comprar pan"]);
  assert.match(botCommand({ type: "done", text: "nadar" }, { todos: [], now: T }).reply, /No encuentro/);
});

test("botCommand: borrar un recordatorio de la página", () => {
  const page = [{ id: "p1", at: T + MIN, text: "regar las plantas", page: true }];
  const r = botCommand({ type: "unremind", text: "regar las plantas" }, { rems: [], page, now: T });
  assert.deepEqual(r.pageDel, ["p1"]);
  assert.equal(r.rems, undefined);
  const all = botCommand({ type: "unremind", all: true }, { rems: [{ id: "a", at: T, text: "x" }], page, now: T });
  assert.deepEqual(all.rems, []);
  assert.deepEqual(all.pageDel, ["p1"]);
});

test("botCommand: varias órdenes encadenadas", () => {
  const r = botCommand({ type: "multi", list: [{ type: "todo", text: "pan" }, { type: "todo", text: "leche" }, { type: "done", text: "pan" }] }, { todos: [], now: T });
  assert.equal(r.inbox.length, 3);
  assert.deepEqual(r.todos, ["leche"]);
});

test("botCommand: posponer el último aviso", () => {
  const lastRem = { t: T - MIN, due: [{ text: "llamar", kind: "remind" }] };
  const r = botCommand({ type: "snooze", ms: 10 * MIN }, { rems: [], lastRem, now: T });
  assert.equal(r.rems.length, 1);
  assert.equal(r.rems[0].at, T + 10 * MIN);
  assert.equal(r.lastRem, null);
  assert.match(botCommand({ type: "snooze", ms: MIN }, { now: T }).reply, /No hay ningún aviso/);
  assert.equal(botCommand({ type: "snooze", ms: MIN, bare: true }, { now: T }), null);
});

test("botCommand: vigilar solo desde la página", () => {
  assert.match(botCommand({ type: "watch" }, { now: T }).reply, /página/);
});

test("botContext: avisa si los datos de la página son viejos", () => {
  const fresh = botContext({ f: { at: T - MIN, name: "Enrique", hour: 12 }, now: T });
  assert.match(fresh, /Enrique/);
  assert.doesNotMatch(fresh, /pueden haber cambiado/);
  const rems = [{ at: T + 30 * MIN, text: "llamar" }];
  assert.match(botContext({ rems, now: T }), /Recordatorios pendientes: llamar/);
});

test("plainText: sin etiquetas de gestos", () => {
  assert.equal(plainText("[happy] ¡Hola! [spin] ¿Qué tal?"), "¡Hola! ¿Qué tal?");
});
