import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyHabits, cleanHabits, noteUse, habitsNow, habitNudges, routeKey, routeLabel, noteRoute, wrongRoute, learnedScore } from "../lib/lunares/habits.js";
import { route, SURE } from "../lib/lunares/router.js";
import { command } from "../lib/lunares/commands.js";

const DAY = 864e5, WEEK = 7 * DAY, MIN = 60000;
const MON = new Date(2026, 9, 5, 9, 10).getTime(); // lunes 5 de octubre, 9:10

test("noteUse: una vez cada media hora, y se olvida lo de hace más de 8 semanas", () => {
  let h = emptyHabits();
  h = noteUse(h, "fm", MON);
  h = noteUse(h, "fm", MON + 5 * MIN);
  assert.equal(h.use.fm.length, 1);
  h = noteUse(h, "fm", MON + 40 * MIN);
  assert.equal(h.use.fm.length, 2);
  h = noteUse(h, "fm", MON + 9 * WEEK);
  assert.equal(h.use.fm.length, 1);
  assert.deepEqual(cleanHabits("basura"), emptyHabits());
  assert.deepEqual(cleanHabits({ use: { fm: [1, "x", 2] } }).use.fm, [1, 2]);
});

test("habitsNow: el mismo día de la semana, 3 semanas, cerca de la hora", () => {
  let h = emptyHabits();
  for (const w of [1, 2, 4]) h = noteUse(h, "fm", MON - w * WEEK);
  h = noteUse(h, "wx", MON - 1 * WEEK); // solo una semana: aún no es costumbre
  assert.deepEqual(habitsNow(h, MON).map((x) => x.id), ["fm"]);
  assert.equal(habitsNow(h, MON + 4 * 60 * MIN).length, 0); // a las 13 ya no
  assert.equal(habitsNow(h, MON + DAY).length, 0); // el martes tampoco
  assert.equal(habitsNow(noteUse(h, "fm", MON - 5 * MIN), MON).length, 0); // hoy ya lo has mirado
});

test("habitNudges: «como sueles mirar…» con los datos reales, una vez al día", () => {
  let h = emptyHabits();
  for (const w of [1, 2, 3]) h = noteUse(h, "wx", MON - w * WEEK);
  const f = { w: { wx: { city: "Madrid", t: 18, hi: 22, lo: 12, rain: 0 } } };
  const [n] = habitNudges(h, f, MON);
  assert.equal(n.text, "Como sueles mirar el tiempo los lunes: Ahora 18° en Madrid. Hoy entre 12° y 22°, 0% de lluvia.");
  assert.equal(habitNudges(h, f, MON, { [n.key]: MON }).length, 0);
  assert.equal(habitNudges(h, {}, MON).length, 0); // sin datos, nada
});

test("routeKey y routeLabel", () => {
  assert.equal(routeKey("¿Cómo está la casa?"), routeKey("la casa, ¿cómo está?"));
  assert.equal(routeKey("¿qué es eso?"), "");
  assert.equal(routeLabel({ type: "command", c: { type: "remind" } }), "command:remind");
  assert.equal(routeLabel({ type: "web" }), "web");
});

test("learnedScore: dos aciertos lo hacen seguro; un «eso no» lo deja a la IA", () => {
  const q = "¿qué es un agujero negro?";
  const r = route(q);
  assert.equal(r.type, "web");
  assert.ok(r.score < SURE);
  let h = emptyHabits();
  h = noteRoute(h, routeKey(q), "web", 1);
  assert.ok(route(q, { learned: h.routes }).score < SURE);
  h = noteRoute(h, routeKey(q), "web", 1);
  assert.equal(route(q, { learned: h.routes }).score, SURE);
  h = wrongRoute(h, routeKey(q), "web");
  assert.ok(h.routes[routeKey(q)].web <= -1);
  assert.ok(route(q, { learned: h.routes }).score < SURE);
  // una respuesta segura de los widgets también se puede corregir
  const f = { w: { wx: { city: "Madrid", t: 18, rain: 0 } } };
  const a = route("¿qué tiempo hace?", { f });
  assert.equal(a.type, "answer");
  const bad = wrongRoute(emptyHabits(), routeKey("¿qué tiempo hace?"), "answer");
  assert.ok(route("¿qué tiempo hace?", { f, learned: bad.routes }).score < SURE);
  // abrir apps no se toca
  assert.deepEqual(learnedScore({ type: "open", score: 1 }, { "": { open: -3 } }, "abre", SURE), { type: "open", score: 1 });
});

test("noteRoute: entre −3 y 5, y como mucho 200 frases", () => {
  let h = emptyHabits();
  for (let i = 0; i < 10; i++) h = noteRoute(h, "casa", "answer", 1);
  assert.equal(h.routes.casa.answer, 5);
  for (let i = 0; i < 10; i++) h = noteRoute(h, "casa", "answer", -1);
  assert.equal(h.routes.casa.answer, -3);
  for (let i = 0; i < 250; i++) h = noteRoute(h, "frase " + i, "web", 1);
  assert.equal(Object.keys(h.routes).length, 200);
  assert.ok(!h.routes.casa);
});

test("command: «no, eso no»", () => {
  for (const s of ["no, eso no", "eso no", "No es eso", "eso no es lo que te he preguntado", "no te he preguntado eso", "te has equivocado"]) assert.equal(command(s)?.type, "wrong", s);
  for (const s of ["¿eso no es raro?", "eso no me gusta", "no es eso lo que quería decir del perro"]) assert.notEqual(command(s)?.type, "wrong", s);
});
