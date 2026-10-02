// Banco de preguntas: ¿por dónde va cada frase? (test/fixtures/questions.json)
// No exige que todo acierte: exige que nada de lo que ya acertaba deje de hacerlo.
// Lo que acierta hoy está en test/fixtures/bench-baseline.json; tras mejorar algo, se actualiza con
//   BENCH_UPDATE=1 npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { route } from "../lib/lunares/router.js";
import { upsertFact } from "../lib/lunares/memory.js";

const read = (f) => JSON.parse(readFileSync(new URL("./fixtures/" + f, import.meta.url), "utf8"));
const { cases } = read("questions.json");
const BASE = new URL("./fixtures/bench-baseline.json", import.meta.url);

// jueves 1 de octubre de 2026, 8:00
const NOW = new Date(2026, 9, 1, 8, 0).getTime();
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const f = {
  links: [{ name: "Plex", href: "#" }, { name: "Jellyfin", href: "#" }, { name: "Nextcloud", href: "#" }],
  todos: ["Comprar pan", "Llamar al banco", "Pagar la luz"],
  w: {
    svc: [{ name: "Plex", up: false }, { name: "Jellyfin", up: true, ms: 23 }, { name: "Nextcloud", up: true, ms: 80 }],
    cal: { ok: true, events: [
      { title: "Reunión", start: at(1, 10), end: at(1, 11) },
      { title: "Dentista", start: at(2, 17, 30), end: at(2, 18) },
      { title: "Cena", start: at(3, 21), end: at(3, 23) },
      { title: "Excursión", start: new Date(2026, 9, 3).toISOString(), end: new Date(2026, 9, 4).toISOString(), allDay: true },
    ] },
    wx: { city: "Madrid", t: 15, feels: 14, lo: 10, hi: 22, rain: 5, days: [
      { c: 0, lo: 10, hi: 22, rain: 5 }, { c: 61, lo: 11, hi: 18, rain: 80 }, { c: 2, lo: 9, hi: 20, rain: 10 }, { c: 0, lo: 8, hi: 21, rain: 0 },
    ] },
    fm: { nw: 10000, first: 9000, inc: 2000, exp: 800, s: 1200, inv: 3000 },
    srv: { ok: true, cpu: 12, temp: 48, ramUsed: 6, ramTotal: 16, disk: { used: 400, total: 1000 }, watts: 35, uptime: 86400 * 3 },
    ha: { ok: true, temp: 21.5, boiler: { on: true }, roomba: { state: "docked", battery: 100 } },
    im: { ok: true, today: 4, photos: 12000, videos: 300 },
    gh: { ok: true, streak: 5, total: 300, prs: { count: 2 }, issues: { count: 1 } },
    dp: { ok: true, servers: [{ name: "Survival", running: true, players: 2 }] },
  },
};
const facts = ["me llamo Enrique", "mi perro se llama Toby", "mi cumpleaños es el 3 de mayo", "vivo en Madrid", "mi hermana se llama Lucía", "me encanta la pizza", "trabajo de programador"]
  .reduce((l, t, i) => upsertFact(l, t, NOW - 1e6 + i).list, []);

const label = (r) => (r.type === "command" ? "command:" + r.c.type : r.type);
const kind = (w) => w.split(":")[0];

test("banco de preguntas: nada de lo que acertaba se estropea", (t) => {
  const pass = [], miss = [], stats = {};
  for (const c of cases) {
    const want = [].concat(c.want), r = route(c.q, { f, facts, now: NOW, prev: c.prev });
    const ok = want.includes(label(r)) && (!c.has || (r.type === "answer" && r.text.includes(c.has)));
    const k = c.note === "seguimiento" ? "seguimiento" : kind(want[0]), s = (stats[k] ||= { ok: 0, n: 0 });
    s.n++; if (ok) { s.ok++; pass.push(c.q); } else miss.push(`«${c.q}» → ${label(r)}${r.type === "answer" ? ` («${r.text.slice(0, 50)}»)` : ""}, quería ${want.join(" o ")}${c.has ? ` con «${c.has}»` : ""}`);
  }
  const pct = (a, b) => Math.round((a / b) * 100) + "%";
  t.diagnostic(`acierta ${pass.length} de ${cases.length} (${pct(pass.length, cases.length)}): ` + Object.entries(stats).map(([k, s]) => `${k} ${s.ok}/${s.n}`).join(", "));
  for (const m of miss) t.diagnostic("falla: " + m);

  if (process.env.BENCH_UPDATE) { writeFileSync(BASE, JSON.stringify({ pass: pass.sort() }, null, 1) + "\n"); return; }
  let base;
  try { base = JSON.parse(readFileSync(BASE, "utf8")).pass; } catch { base = []; }
  const broke = base.filter((q) => cases.some((c) => c.q === q) && !pass.includes(q));
  const fixed = pass.filter((q) => !base.includes(q));
  if (fixed.length) t.diagnostic(`ahora acierta ${fixed.length} más (actualiza con BENCH_UPDATE=1): ${fixed.join(" | ")}`);
  assert.deepEqual(broke, [], "Antes acertaba y ahora no");
});
