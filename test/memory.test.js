import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, upsertFact, searchFacts, findFactBy, relevantFacts, tidyFacts, removeFact, factsOverview, MAX_FACTS } from "../lib/lunares/memory.js";
import { command } from "../lib/lunares/commands.js";
import { toYou, toThem } from "../lib/lunares/text.js";

const T = Date.UTC(2026, 9, 2, 10);
const build = (...texts) => texts.reduce((l, t, i) => upsertFact(l, t, T + i * 1000).list, []);

test("classify: de qué trata cada dato", () => {
  assert.deepEqual(classify("Me llamo Enrique"), { kind: "name", key: "nombre" });
  assert.equal(classify("mi cumpleaños es el 3 de mayo").kind, "birthday");
  assert.equal(classify("nací el 3 de mayo").kind, "birthday");
  assert.equal(classify("mi madre cumple años el 5 de junio").kind, "fact"); // el de tu madre no es el tuyo
  assert.equal(classify("vivo en Madrid").key, "vivir");
  assert.equal(classify("trabajo en una consultora").kind, "work");
  assert.equal(classify("me gusta el café").key, classify("no me gusta el café").key);
  assert.equal(classify("no me gusta el café").kind, "dislike");
  assert.equal(classify("mi color favorito es el verde").key, "fav:color");
  assert.equal(classify("mi perro se llama Toby").key, "llama:perro");
  assert.notEqual(classify("mi hermano se llama Pablo").key, classify("mi hermana se llama Lucía").key);
});

test("upsertFact: lo nuevo sustituye a lo viejo sobre lo mismo", () => {
  let l = build("me gusta el café", "vivo en Madrid");
  const r = upsertFact(l, "no me gusta el café", T + 9000);
  assert.equal(r.old.text, "me gusta el café");
  assert.equal(r.list.length, 2);
  assert.equal(r.list.at(-1).id, r.old.id); // mismo dato, cambiado
  l = upsertFact(r.list, "vivo en Sevilla", T + 10000).list;
  assert.deepEqual(l.map((f) => f.text), ["no me gusta el café", "vivo en Sevilla"]);
  // casi lo mismo dicho otra vez: no se repite
  l = build("tengo dos gatos y un perro", "tengo dos gatos y un perro.");
  assert.equal(l.length, 1);
  // ids que manda el cliente se respetan (para borrar luego el mismo)
  assert.equal(upsertFact([], "me gusta el mar", T, "abc123").fact.id, "abc123");
});

test("upsertFact: lleno, se va lo más viejo menos quién eres", () => {
  let l = upsertFact([], "me llamo Ana", T).list;
  for (let i = 0; i < MAX_FACTS + 5; i++) l = upsertFact(l, `dato número ${i} sobre zorro${i}`, T + i).list;
  assert.equal(l.length, MAX_FACTS);
  assert.equal(l[0].text, "me llamo Ana");
});

test("searchFacts: preguntas que encuentran el dato", () => {
  const l = build("me llamo Enrique", "nací el 3 de mayo", "mi perro se llama Toby", "vivo en Madrid", "trabajo en una consultora", "me encanta la pizza", "mi hermana se llama Lucía", "mi color favorito es el verde");
  const top = (q) => searchFacts(l, q)[0]?.fact.text;
  assert.equal(top("¿cuándo es mi cumpleaños?"), "nací el 3 de mayo");
  assert.equal(top("¿cómo se llama mi perro?"), "mi perro se llama Toby");
  assert.equal(top("¿qué mascota tengo?"), "mi perro se llama Toby");
  assert.equal(top("¿dónde vivo?"), "vivo en Madrid");
  assert.equal(top("¿de qué trabajo?"), "trabajo en una consultora");
  assert.equal(top("¿qué comida me gusta?"), "me encanta la pizza");
  assert.equal(top("mi hermana"), "mi hermana se llama Lucía");
  assert.equal(top("¿cuál es mi color favorito?"), "mi color favorito es el verde");
  assert.equal(searchFacts(l, "patrimonio").length, 0);
  assert.equal(findFactBy(l, "lo de la pizza").text, "me encanta la pizza");
  assert.equal(findFactBy(l, "el tiempo de mañana"), null);
});

test("relevantFacts: lo que va a la IA", () => {
  const l = build("me llamo Enrique", "me encanta la pizza", "mi perro se llama Toby", "vivo en Madrid");
  const r = relevantFacts(l, "¿qué le compro a mi perro?", 3).map((f) => f.text);
  assert.equal(r[0], "mi perro se llama Toby");
  assert.ok(r.includes("me llamo Enrique"));
  assert.ok(!r.includes("me encanta la pizza"));
  assert.equal(factsOverview(l, 2)[0].text, "me llamo Enrique");
});

test("tidyFacts / removeFact: lo antiguo del navegador y lo que llega de fuera", () => {
  const l = tidyFacts([{ text: "me gusta el mar", at: 5 }, "vivo en Lugo", null, { text: "  " }], T);
  assert.equal(l.length, 2);
  assert.ok(l.every((f) => f.id && f.kind && Number.isFinite(f.upd)));
  assert.equal(l[0].at, 5);
  assert.equal(removeFact(l, l[0].id).length, 1);
});

test("command: preguntar lo que sabe", () => {
  assert.deepEqual(command("¿qué sabes de mi perro?"), { type: "recall", q: "mi perro", soft: false });
  assert.equal(command("¿qué sabes de Python?").soft, true);
  assert.deepEqual(command("¿cuándo es mi cumpleaños?"), { type: "recall", q: "¿cuándo es mi cumpleaños?", soft: true });
  assert.equal(command("¿qué sabes de mí?").q, undefined);
  assert.equal(command("¿qué tengo el viernes?"), null);
  assert.equal(command("cuando llegue a casa recuérdame mi pastilla")?.type === "recall", false);
});

test("toYou / toThem: verbos del principio", () => {
  assert.equal(toYou("nací el 3 de mayo"), "naciste el 3 de mayo");
  assert.equal(toYou("trabajo en una consultora"), "trabajas en una consultora");
  assert.equal(toYou("mi trabajo es aburrido"), "tu trabajo es aburrido");
  assert.equal(toThem("me llamo Enrique"), "se llama Enrique");
});
