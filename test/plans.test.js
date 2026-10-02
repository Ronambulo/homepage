import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertFact, pruneFacts, relevantFacts, factsOverview, recentEpisodes, nearPlans, prefsOf, prefKey, tidyFacts, MAX_FACTS } from "../lib/lunares/memory.js";
import { planOf, planWhen, planAsk, planReply } from "../lib/lunares/plans.js";
import { nudges } from "../lib/lunares/nudges.js";
import { command } from "../lib/lunares/commands.js";
import { glance } from "../lib/lunares/brain.js";
import { parseAI } from "../lib/lunares/text.js";

const DAY = 864e5, HOUR = 36e5;
const NOW = new Date(2026, 9, 1, 10, 0).getTime(); // jueves 1 de octubre, 10:00

test("planOf: planes con fecha, no tareas ni preguntas", () => {
  const p = planOf("mañana tengo un examen", NOW);
  assert.equal(p.text, "el examen");
  assert.equal(p.allday, true);
  assert.equal(new Date(p.due).getDate(), 2);
  assert.equal(planOf("el viernes tengo dentista a las 17", NOW).text, "el dentista");
  assert.equal(planOf("el viernes tengo dentista a las 17", NOW).allday, undefined);
  assert.equal(planOf("el sábado es la boda de mi hermana", NOW).text, "la boda de mi hermana");
  assert.equal(planOf("el lunes me voy a Lisboa", NOW).text, "el viaje a Lisboa");
  assert.equal(planOf("mañana tengo que llamar a Pedro", NOW), null);
  assert.equal(planOf("¿mañana tengo algo?", NOW), null);
  assert.equal(planOf("tengo un examen", NOW), null); // sin fecha
  assert.equal(planOf("ayer tuve un examen", NOW), null);
});

test("planWhen y planReply", () => {
  assert.equal(planWhen({ due: NOW + DAY, allday: true }, NOW), "mañana");
  assert.equal(planWhen({ due: new Date(2026, 9, 2, 17).getTime() }, NOW), "mañana a las 17:00");
  assert.equal(planWhen({ due: NOW - DAY, allday: true }, NOW), "ayer");
  assert.match(planReply({ text: "el examen", due: NOW + DAY, allday: true }), /suerte con el examen/);
  assert.match(planReply({ text: "el viaje a Lisboa", due: NOW + DAY, allday: true }), /Qué bien/);
});

test("planAsk: una vez pasado, a buena hora", () => {
  const p = { id: "abcd", text: "el examen de mi hermana", due: NOW, at: NOW - DAY };
  assert.equal(planAsk(p, NOW + HOUR), null); // aún no
  const a = planAsk(p, NOW + 5 * HOUR);
  assert.equal(a.key, "plan:abcd");
  assert.equal(a.text, "Oye, ¿qué tal ha ido el examen de tu hermana?");
  assert.equal(planAsk(p, NOW + 3 * DAY), null); // demasiado tarde
  assert.equal(planAsk(p, new Date(2026, 9, 1, 23).getTime()), null); // a deshoras
  // en nudges, solo si no se ha dicho ya
  assert.equal(nudges({}, NOW + 5 * HOUR, {}, null, [p])[0]?.key, "plan:abcd");
  assert.equal(nudges({}, NOW + 5 * HOUR, { "plan:abcd": NOW }, null, [p]).length, 0);
});

test("memoria: charlas, planes y gustos de estilo van aparte", () => {
  let l = upsertFact([], "me encanta la pizza", NOW).list;
  l = upsertFact(l, "el viaje a Lisboa", NOW, undefined, { kind: "episode", key: "ep:abc" }).list;
  l = upsertFact(l, "el viaje a Lisboa y los hoteles", NOW + 1000, undefined, { kind: "episode", key: "ep:abc" }).list; // misma charla: se actualiza
  l = upsertFact(l, "el examen", NOW, undefined, { kind: "plan", due: NOW + DAY, allday: true }).list;
  l = upsertFact(l, "háblame más corto", NOW, undefined, { kind: "pref" }).list;
  l = upsertFact(l, "háblame más largo", NOW + 1000, undefined, { kind: "pref" }).list; // pisa al anterior
  assert.equal(l.filter((f) => f.kind === "episode").length, 1);
  assert.equal(l.find((f) => f.kind === "episode").text, "el viaje a Lisboa y los hoteles");
  assert.equal(l.find((f) => f.kind === "plan").due, NOW + DAY);
  assert.deepEqual(prefsOf(l), ["háblame más largo"]);
  assert.equal(prefKey("contéstame más breve"), "pref:largo");
  // «lo que sé de ti» no los enseña
  assert.deepEqual(relevantFacts(l, "pizza").map((f) => f.text), ["me encanta la pizza"]);
  assert.ok(!/Lisboa|examen|háblame/.test(factsOverview(l)));
  // y sobreviven a tidyFacts
  assert.equal(tidyFacts(l, NOW).length, l.length);
  assert.equal(recentEpisodes(l, "hoteles", { now: NOW })[0].text, "el viaje a Lisboa y los hoteles");
  assert.equal(recentEpisodes(l, null, { now: NOW, skip: "ep:abc" }).length, 0);
  assert.equal(nearPlans(l, NOW)[0].text, "el examen");
});

test("memoria: caducan charlas viejas y planes pasados", () => {
  let l = upsertFact([], "una charla vieja", NOW - 61 * DAY, undefined, { kind: "episode", key: "ep:old" }).list;
  l = upsertFact(l, "el examen", NOW - 10 * DAY, undefined, { kind: "plan", due: NOW - 8 * DAY }).list;
  l = upsertFact(l, "la boda", NOW - 10 * DAY, undefined, { kind: "plan", due: NOW - 2 * DAY }).list;
  assert.deepEqual(pruneFacts(l, NOW).map((f) => f.text), ["la boda"]);
  // las charlas no cuentan para el límite
  let m = [];
  for (let i = 0; i < 20; i++) m = upsertFact(m, "charla número " + i, NOW + i, undefined, { kind: "episode", key: "ep:" + i }).list;
  for (let i = 0; i < MAX_FACTS; i++) m = upsertFact(m, `mi cosa favorita número ${i} es la ${i}`, NOW + 100 + i).list;
  assert.equal(m.filter((f) => f.kind === "episode").length, 20);
});

test("command: gustos de estilo", () => {
  assert.equal(command("háblame más corto")?.type, "pref");
  assert.equal(command("no hagas tantas bromas")?.type, "pref");
  assert.equal(command("llámame Quique")?.text, "llámame Quique");
  assert.equal(command("tutéame")?.type, "pref");
  assert.notEqual(command("llámame mañana a las 9")?.type, "pref");
  assert.notEqual(command("¿me hablas más corto?")?.type, "pref");
});

test("glance: lo que va mal primero, sin repetir lo detallado", () => {
  const f = { w: {
    svc: [{ name: "Plex", up: false }, { name: "Jellyfin", up: true }],
    srv: { ok: true, cpu: 10, ramUsed: 4, ramTotal: 16, disk: { used: 950, total: 1000 } },
    wx: { city: "Madrid", t: 18, rain: 0 },
    gh: { ok: false, error: "x" },
  } };
  const g = glance(f);
  assert.match(g, /^De un vistazo: servicios caídos: Plex; servidor .*disco 95%; GitHub no responde; tiempo 18° en Madrid/);
  assert.ok(!/tiempo/.test(glance(f, ["wx"])));
  assert.equal(glance({}), "");
});

test("parseAI quita la etiqueta de tema", () => {
  assert.equal(parseAI("[happy] Qué bien. [tema: el viaje a Lisboa]").text, "Qué bien.");
});
