// Kero por Telegram: lo que no necesita red (vincular, recordatorios del servidor, órdenes y contexto para la IA).
// La parte con red y archivos está en lib/kerobot.js. Aquí todo es puro: entra el estado y sale qué cambiar.
import { fmtWhen, shortWhen } from "./when.js";
import { fmtRep, nextRep, MIN_EVERY } from "./repeat.js";
import { findFact, findTodo } from "./commands.js";
import { findFactBy, upsertFact, removeFact, relevantFacts, factsOverview, nearPlans } from "./memory.js";
import { plansLine } from "./plans.js";
import { recallFacts } from "./router.js";
import { resolveRel } from "./watches.js";
import { toYou, toThem } from "./text.js";
import { topics, brief, glance } from "./brain.js";
import { calc } from "./numbers.js";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const quote = (s) => `«${String(s).replace(/[.!?]+$/, "")}»`;
const you = (m) => cap(toYou(m.text)).replace(/[.!]*$/, ".");
export const fmtDur = (ms) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60, o = [];
  if (h) o.push(`${h} ${h === 1 ? "hora" : "horas"}`);
  if (m) o.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  if (r && !h) o.push(`${r} ${r === 1 ? "segundo" : "segundos"}`);
  return o.join(" y ") || "un momento";
};
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- vincular: solo habla con el chat que mande el código de la página ---------- */
export const CODE_MS = 15 * 60000;
export const newCode = () => String(Math.floor(100000 + Math.random() * 900000));
// «/start 123456», «123456», «el código es 123 456»
export function pairOf(text) {
  const m = String(text || "").replace(/(\d)\s+(?=\d)/g, "$1").match(/(?:^|\D)(\d{6})(?:\D|$)/);
  return m ? m[1] : null;
}

/* ---------- recordatorios ---------- */
// los que tocan (y los que se repiten, con su próxima vez); los de hace más de un día se tiran sin decir nada
export function takeDue(list, t = Date.now()) {
  const all = (list || []).filter((r) => r && Number.isFinite(r.at));
  const due = all.filter((r) => r.at <= t);
  const next = due.filter((r) => r.rep).map((r) => ({ ...r, at: nextRep(r.rep, t, r.at) })).filter((r) => r.at > t);
  return { due: due.filter((r) => t - r.at < 864e5), keep: [...all.filter((r) => r.at > t), ...next].sort((a, b) => a.at - b.at) };
}
export function remText(due, t = Date.now()) {
  const late = due.some((r) => t - r.at > 120000);
  const one = (r) => (r.kind === "timer" ? (r.text ? `¡Tiempo! ${cap(r.text)}` : "¡Se acabó el tiempo!") : cap(r.text || "¡Es la hora!"));
  if (due.length === 1) return (late ? "Se me pasó avisarte: " : due[0].kind === "timer" ? "" : "¡Recordatorio! ") + one(due[0]).replace(/[.!]?$/, (m) => m || ".");
  return `${late ? "Se me pasaron" : "Tienes"} ${due.length} recordatorios: ${due.map((r) => one(r).replace(/[.!]+$/, "")).join("; ")}.`;
}
// cada vez que suena uno se apunta «id@hora»: así la copia de la página no lo repite
export const sentKey = (r) => `${r.id}@${r.at}`;
// la lista que manda la página, sin lo que ya se avisó por aquí; solo lo que vale
export function pageRems(list, sent = {}) {
  return (Array.isArray(list) ? list : []).slice(0, 50)
    .filter((r) => r && typeof r.id === "string" && Number.isFinite(r.at) && !sent[sentKey(r)])
    .map((r) => ({ id: r.id.slice(0, 24), at: r.at, text: String(r.text || "").slice(0, 200), kind: r.kind === "timer" ? "timer" : "remind", ...(r.rep && typeof r.rep === "object" ? { rep: r.rep } : {}), page: true }));
}
// los avisos ya dichos, solo los de los últimos 3 días
export const pruneSent = (sent = {}, t = Date.now()) => Object.fromEntries(Object.entries(sent).filter(([, v]) => t - v < 3 * 864e5));

/* ---------- órdenes ---------- */
// c: command() · s: { rems (los de aquí), page (los de la página), todos, facts, f, lastRem, now }
// → { reply, rems?, inbox?: [ops para la página], mem?: fn(lista) → lista, pageDel?: [id] } o null (no es cosa de aquí)
export function botCommand(c, s) {
  const t = s.now ?? Date.now(), rems = s.rems || [], page = s.page || [];
  const add = (at, text, kind, rep) => [...rems, { id: newId(), at, text, kind, ...(rep ? { rep } : {}) }].sort((a, b) => a.at - b.at).slice(-50);
  switch (c.type) {
    case "snooze": {
      const lr = s.lastRem;
      if (lr && t - lr.t <= 15 * 60000) {
        const at = t + c.ms;
        let list = rems;
        for (const r of lr.due) list = [...list, { id: newId(), at, text: r.text, kind: r.kind === "timer" ? "timer" : "remind" }];
        return { reply: `Vale, te lo vuelvo a decir ${fmtWhen(at, t)}.`, rems: list.sort((a, b) => a.at - b.at), lastRem: null };
      }
      if (c.bare) return c.alt ? botCommand(c.alt, s) : null;
      return { reply: "No hay ningún aviso reciente que posponer." };
    }
    case "remind": {
      if (c.rel) {
        const cal = s.f?.w?.cal, hit = cal ? resolveRel(c.rel, cal.events, t) : null;
        if (!hit) {
          if (c.rel.soft && c.alt) return botCommand(c.alt, s);
          return { reply: cal ? `No encuentro ${quote(c.rel.ev)} en tu agenda.` : "No tengo tu agenda a mano (la veo cuando tienes la página abierta), así que no sé cuándo es eso." };
        }
        const title = hit.ev.title, end = c.rel.edge === "end", ms = c.rel.ms;
        if (hit.past) return { reply: `Esa hora ya ha pasado (${quote(title)}, ${shortWhen(+new Date(end ? hit.ev.end || hit.ev.start : hit.ev.start), t)}).` };
        const how = ms ? `${fmtDur(ms)} ${end ? "después de" : "antes de"}` : end ? "al acabar" : "al empezar";
        return { reply: `Vale, te aviso ${fmtWhen(hit.at, t)}, ${how} ${quote(title)}${c.text ? ": " + toYou(c.text).replace(/[.!]+$/, "") : ""}.`, rems: add(hit.at, c.text || (end ? `Ha acabado ${quote(title)}` : ms ? `${quote(title)} en ${fmtDur(ms)}` : `Empieza ${quote(title)}`), "remind") };
      }
      if (!c.at) return { reply: "¿Cuándo te lo recuerdo? Dime, por ejemplo, «recuérdame mañana a las 9 llamar a mamá»." };
      if (c.past) return { reply: "Esa hora ya ha pasado. ¿Cuándo te aviso?" };
      const what = c.text ? ": " + toYou(c.text).replace(/[.!]+$/, "") : "";
      if (c.rep) {
        if (c.rep.ms && c.rep.ms < MIN_EVERY) return { reply: "Eso es demasiado a menudo; como mucho, cada 5 minutos." };
        return { reply: `Vale, te lo recuerdo ${fmtRep(c.rep)}${what}. La primera vez, ${fmtWhen(c.at, t)}.`, rems: add(c.at, c.text, "remind", c.rep) };
      }
      return { reply: `Vale, te lo recuerdo ${fmtWhen(c.at, t)}${what}.`, rems: add(c.at, c.text, "remind") };
    }
    case "timer":
      if (!c.ms) return { reply: "¿De cuánto? Por ejemplo, «pon un temporizador de 10 minutos»." };
      return { reply: `Temporizador de ${fmtDur(c.ms)} en marcha${c.text ? ` para ${quote(c.text)}` : ""}.`, rems: add(c.at, c.text, "timer") };
    case "reminders": {
      const list = [...rems, ...page].sort((a, b) => a.at - b.at);
      if (!list.length) return { reply: "No tienes recordatorios pendientes." };
      const items = list.slice(0, 6).map((r) => `${r.kind === "timer" ? "temporizador" : r.text || "aviso"} (${r.rep ? fmtRep(r.rep) : shortWhen(r.at, t)})`);
      return { reply: `Tienes ${list.length === 1 ? "uno" : list.length}: ${items.join("; ")}${list.length > 6 ? "…" : "."}` };
    }
    case "unremind": {
      const n = rems.length + page.length;
      if (!n) return { reply: "No tienes recordatorios que borrar." };
      if (c.all) return { reply: n === 1 ? "Borrado." : `Borrados los ${n}.`, rems: [], pageDel: page.map((r) => r.id) };
      const i = findFact(rems, c.text);
      if (i >= 0) return { reply: `Borrado: ${quote(rems[i].text || "temporizador")}.`, rems: rems.filter((_, j) => j !== i) };
      const j = findFact(page, c.text);
      if (j >= 0) return { reply: `Borrado: ${quote(page[j].text || "temporizador")}.`, pageDel: [page[j].id] };
      return { reply: `No encuentro ningún recordatorio de ${quote(c.text)}.` };
    }
    case "watch":
      return { reply: "Eso lo vigilo desde la página de inicio, que es donde veo tus widgets. Pídemelo allí." };
    case "multi": {
      // cada una por su lado; los cambios se van encadenando
      let cur = s, out = { reply: "" };
      for (const x of c.list) {
        const r = botCommand(x, cur);
        if (!r) continue;
        out = {
          ...out, ...r,
          reply: [out.reply, r.reply].filter(Boolean).join(" "),
          inbox: [...(out.inbox || []), ...(r.inbox || [])],
          pageDel: [...(out.pageDel || []), ...(r.pageDel || [])],
          mem: out.mem && r.mem ? ((f) => r.mem(out.mem(f))) : out.mem || r.mem,
        };
        cur = { ...cur, ...(r.rems ? { rems: r.rems } : {}), ...(r.todos ? { todos: r.todos } : {}) };
      }
      return out.reply ? out : null;
    }
    case "todo":
      return { reply: c.fromRemind ? `Como no me has dicho cuándo, lo apunto en Tareas: ${quote(c.text)}.` : `Apuntado en Tareas: ${quote(c.text)}.`, inbox: [{ op: "todo", text: c.text }], todos: [...(s.todos || []), c.text] };
    case "done": {
      const todos = s.todos || [], i = findTodo(todos.map((x) => ({ text: x })), c.text);
      if (i < 0) return { reply: `No encuentro ${quote(c.text)} en tus tareas.` };
      return { reply: `¡Hecho! He tachado ${quote(todos[i])}.`, inbox: [{ op: "done", text: todos[i] }], todos: todos.filter((_, j) => j !== i) };
    }
    case "pref":
      return { reply: `Vale, lo tendré en cuenta: ${quote(cap(c.text))}.`, mem: (l) => upsertFact(l, c.text, t, undefined, { kind: "pref" }).list };
    case "remember": {
      const r = upsertFact(s.facts || [], c.text, t);
      if (!r.fact) return null;
      const mem = (l) => upsertFact(l, c.text, t).list;
      if (r.old && r.old.text.toLowerCase() !== r.fact.text.toLowerCase()) return { reply: `Apuntado. Antes sabía que ${toYou(r.old.text).replace(/[.!]+$/, "")}; ahora, que ${toYou(r.fact.text).replace(/[.!]+$/, "")}.`, mem };
      return { reply: c.soft ? `¡Me lo apunto! ${you(r.fact)}` : `Vale, me acordaré: ${toYou(c.text).replace(/[.!]+$/, "")}.`, mem };
    }
    case "forget": {
      const list = s.facts || [];
      if (c.all) return { reply: list.length ? "Hecho, ya no recuerdo nada de lo que me contaste." : "No sabía nada de ti todavía.", mem: () => [] };
      const hit = findFactBy(list, c.text) || list[findFact(list, c.text)];
      if (!hit) return { reply: "No recordaba nada de eso." };
      return { reply: `Olvidado: ${quote(toYou(hit.text))}.`, mem: (l) => removeFact(l, hit.id) };
    }
    case "recall": {
      const list = s.facts || [];
      if (c.q) {
        if (c.soft && topics(c.q).length) return null;
        const hits = recallFacts(list, c.q);
        if (!hits.length) return c.soft ? null : { reply: `No me has contado nada de ${quote(toYou(c.q))}. Si quieres, dime «recuerda que…».` };
        return { reply: hits.map(you).join(" ") };
      }
      if (!list.length) return { reply: "Todavía no me has contado nada de ti. Dime «recuerda que…» y me lo apunto." };
      const o = factsOverview(list, 6), more = list.length - o.length;
      return { reply: `Sé que ${o.map((m) => toYou(m.text).replace(/[.!]+$/, "")).join("; ")}.${more > 0 ? ` Y ${more === 1 ? "una cosa" : more + " cosas"} más: las tienes en mi menú de la página.` : ""}` };
    }
  }
  return null;
}

/* ---------- contexto para la IA ---------- */
// f: lo último que mandó la página (con `at`); facts: la memoria; q: la pregunta
export function botContext({ f = {}, facts = [], rems = [], q = "", name = "", now = Date.now() } = {}) {
  const d = new Date(now), o = [];
  o.push(`Ahora: ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`);
  if (name || f.name) o.push(`Tu dueño se llama ${name || f.name}.`);
  const known = relevantFacts(facts, q, 8);
  if (known.length) o.push(`Sabes de tu dueño: ${known.map((m) => toThem(m.text)).join("; ")}.`);
  const age = f.at ? Math.round((now - f.at) / 60000) : null;
  if (age != null) {
    const ids = q ? topics(q) : [];
    const b = [ids.map((id) => brief(f, id)).filter(Boolean).join("\n"), glance(f, ids)].filter(Boolean).join("\n");
    if (b) o.push(`${age > 15 ? `Datos de la página de hace ${age < 120 ? age + " min" : Math.round(age / 60) + " h"} (pueden haber cambiado):\n` : ""}${b}`);
  }
  const list = [...rems].sort((a, b) => a.at - b.at).slice(0, 3);
  if (list.length) o.push(`Recordatorios pendientes: ${list.map((r) => `${r.text || "temporizador"} (${r.rep ? fmtRep(r.rep) + ", la próxima " + fmtWhen(r.at, now) : fmtWhen(r.at, now)})`).join("; ")}.`);
  const plans = plansLine(nearPlans(facts, now), now);
  if (plans) o.push(plans);
  const c = q && age != null ? calc(q, f, now) : null;
  if (c) o.push(c);
  return o.join("\n");
}

/* ---------- texto para Telegram ---------- */
// sin las etiquetas de emoción y gestos ([happy], [spin]…): en el móvil no tiene cara
export const plainText = (t) => String(t || "").replace(/\[[^\]]{1,16}\]/g, " ").replace(/\s+/g, " ").trim();
