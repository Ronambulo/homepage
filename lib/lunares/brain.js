// Kero: lo que dice a partir de los datos de la página (frases, respuestas exactas y contexto para la IA).
import { parseWhen } from "./when.js";

export const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sky = (c) =>
  c == null ? "" : c === 0 ? "despejado" : c <= 3 ? "algo nublado" : c <= 48 ? "niebla" : c <= 67 || (c >= 80 && c <= 82) ? "lluvia" : c <= 77 ? "nieve" : c >= 95 ? "tormenta" : "";

// Algo "listo" que decir a partir de los datos de la página. Devuelve la mejor frase con algo de azar.
export function thought(f = {}, name = "Kero") {
  const out = [];
  const add = (w, s) => s && out.push([w, s]);
  const h = f.hour ?? new Date().getHours(), m = new Date().getMinutes(), dow = new Date().getDay();
  const you = f.name ? ", " + f.name : "";

  if (f.alerts?.length) add(9, pick(["Ojo: ", "Oye, ", "Esto no me gusta: "]) + f.alerts[0].charAt(0).toLowerCase() + f.alerts[0].slice(1) + ".");

  const s = f.services;
  if (s?.total) {
    if (s.down?.length) add(7, s.down.length === 1 ? `${s.down[0]} no contesta. Le he dado un toque y nada.` : `${s.down.length} servicios no responden: ${s.down.join(", ")}.`);
    else if (s.total === 1) add(2, pick(["Tu servicio responde. Todo en verde.", "He pasado lista: uno de uno, presente.", "El servidor está tranquilo."]));
    else add(2, pick([`Los ${s.total} servicios responden. Todo en verde.`, `He pasado lista: ${s.total} de ${s.total} presentes.`, `Servidores tranquilos. ${s.total}/${s.total}.`]));
  }

  const w = f.weather;
  if (w && Number.isFinite(w.t)) {
    const k = sky(w.c);
    if (w.t >= 32) add(5, pick([`${w.t}° en ${w.city}. Me estoy derritiendo, literalmente.`, `${w.t}°. Si me ves más plano, es eso.`]));
    else if (w.t <= 4) add(5, pick([`${w.t}° en ${w.city}. Abrígate${you}.`, `Hace ${w.t}°. Yo me quedo aquí dentro.`]));
    if (w.rain >= 60) add(5, `Hoy hay un ${w.rain}% de lluvia. Paraguas, por si acaso.`);
    add(2, `Ahora ${w.t}° en ${w.city}${k ? ", " + k : ""}. Máxima de ${w.hi}°.`);
  }

  const t = f.todos;
  if (t) {
    if (t.length === 0) add(1, pick(["Cero tareas pendientes. Sospechoso.", "Lista de tareas vacía. Disfrútalo."]));
    else if (t.length >= 5) add(4, `Llevas ${t.length} tareas pendientes. Empieza por «${t[0]}».`);
    else add(3, pick([`Te queda «${t[0]}»${t.length > 1 ? ` y ${t.length - 1} más` : ""}.`, `¿Y si tachamos «${t[0]}»?`]));
  }

  if (h >= 23 || h < 6) add(4, pick([`Son las ${h}:${String(m).padStart(2, "0")}. ¿Qué haces despierto${you}?`, "Es tardísimo. Yo ya estaba soñando con círculos."]));
  else if (h < 10) add(1, pick(["Buenos días. ¿Café ya?", "Mañana fresquita para empezar."]));
  else if (h >= 14 && h < 17) add(1, pick(["Después de comer me entra un sueño…", "A estas horas a veces me echo la siesta."]));
  if (dow === 5 && h >= 15) add(3, "Es viernes por la tarde. Se nota en el ambiente.");
  if (dow === 1 && h < 12) add(2, "Lunes. Vamos poco a poco.");

  add(1, pick([
    "Pulsa / para buscar. Yo miro.",
    "Pulsa F y quito todo lo demás.",
    "Puedes arrastrarme. No muerdo.",
    `Me llamo ${name} por mis bultos. Tengo ocho.`,
    "Estaba pensando en formas. Redondas, sobre todo.",
    "Si me acaricias con el ratón, me pongo contento.",
    "Teclas 1 a 9: abren tus apps en orden.",
    "Déjame el ratón un rato sobre un widget y te lo comento.",
    "Puedo subirme a tus widgets. Lánzame.",
    ...(f.ai ? ["Haz doble clic sobre mí y hablamos.", "Ahora pienso con IA. Doble clic y pregúntame."] : []),
  ]));

  // ruleta ponderada
  const tot = out.reduce((a, [w]) => a + w, 0);
  let r = Math.random() * tot;
  for (const [w, s2] of out) if ((r -= w) <= 0) return s2;
  return out[0]?.[1] || "…";
}

const eu = (n) => Math.round(n).toLocaleString("es-ES") + " €";
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ROOMBA = { cleaning: "aspirando", docked: "en la base", returning: "volviendo a casa", paused: "en pausa", idle: "parada", error: "con un error", charging: "cargando" };

// Frase sobre un widget concreto (al dejar el ratón encima). Devuelve null si no hay nada que decir.
export function widgetLine(id, f = {}) {
  const W = f.w || {}, d = W[id], al = W.alert?.[id];
  if (al) return pick(["Ojo aquí: ", "Esto me preocupa: ", "Mira: "]) + al.charAt(0).toLowerCase() + al.slice(1) + ".";
  if (["srv", "cal", "gh", "dp", "ha", "im"].includes(id)) {
    if (!d) return "Todavía estoy leyendo este widget…";
    if (!d.ok) return d.auth ? "Aquí no veo nada hasta que inicies sesión en Editar." : d.error === "sin configurar" ? "Este widget está vacío. Configúralo en Editar → Conexiones." : "Este no me contesta. Le doy un rato.";
  }
  const L = [];
  const add = (...xs) => L.push(...xs.filter(Boolean));
  switch (id) {
    case "fm": {
      if (!d || d.state) return d?.state === "login" ? "Tus finanzas están bajo llave. Pulsa para conectar." : d?.state === "offline" ? "FinanceMaster no contesta. El dinero sigue ahí, supongo." : null;
      if (d.s > 0) add(`Este ciclo llevas ${eu(d.s)} ahorrados. ¡Bien!`, d.inc > 0 && `Estás ahorrando un ${Math.round((d.s / d.inc) * 100)}% de lo que entra.`);
      else if (d.s < 0) add(`Este ciclo vas ${eu(-d.s)} en negativo. Yo no compraría nada más hoy.`, `Has gastado ${eu(d.exp)}. Mmm…`);
      if (d.first != null && d.nw > d.first) add(`Tu patrimonio ha subido ${eu(d.nw - d.first)} en este periodo.`);
      if (d.inv > 0) add(`Tienes ${eu(d.inv)} invertidos. Que crezcan como yo.`);
      add(`Patrimonio: ${eu(d.nw)}. No se lo digo a nadie.`);
      break;
    }
    case "svc": {
      if (!d?.length) return "Todavía estoy comprobando los servicios…";
      const down = d.filter((x) => x.up === false), up = d.filter((x) => x.up);
      if (down.length) return down.length === 1 ? (d.length === 1 ? `${down[0].name} no contesta.` : `${down[0].name} no contesta. Los demás, bien.`) : `Fallan ${down.length}: ${down.map((x) => x.name).join(", ")}.`;
      const fast = up.filter((x) => x.ms != null).sort((a, b) => a.ms - b.ms);
      if (d.length === 1) add(`${d[0].name} responde${d[0].ms != null ? ` en ${d[0].ms} ms` : ""}.`, "Uno de uno. Pleno.");
      else add(`Los ${d.length} servicios responden.`, "Todos en verde. Me gusta este color.");
      if (fast.length > 1) add(`${fast[0].name} es el más rápido: ${fast[0].ms} ms.`, `${fast[fast.length - 1].name} va algo lento: ${fast[fast.length - 1].ms} ms.`);
      break;
    }
    case "wx": {
      if (!d) return "Todavía no sé qué tiempo hace.";
      const tm = d.days?.[1];
      add(d.feels != null && Math.abs(d.feels - d.t) >= 3 && `Marca ${d.t}°, pero se sienten ${d.feels}°.`);
      add(d.rain >= 50 ? `Un ${d.rain}% de lluvia hoy. Paraguas.` : d.rain <= 10 && "Hoy no llueve. Casi seguro.");
      add(d.wind >= 30 && `Sopla a ${d.wind} km/h. Agárrame.`);
      add(tm && (tm.hi >= d.hi + 3 ? `Mañana sube a ${tm.hi}°.` : tm.hi <= d.hi - 3 ? `Mañana baja a ${tm.hi}°. Abrígate.` : `Mañana, parecido: de ${tm.lo}° a ${tm.hi}°.`));
      add(`Hoy entre ${d.lo}° y ${d.hi}° en ${d.city}.`);
      break;
    }
    case "todo": {
      if (!d) return null;
      if (!d.length) return pick(["Nada pendiente. ¿Inventamos algo?", "Lista vacía. Qué paz."]);
      add(`«${d[0]}» lleva ahí un rato…`, d.length > 1 ? `Te quedan ${d.length}. Empieza por la fácil.` : "Solo una tarea. Tú puedes.", d.length > 2 && `¿Y «${d[d.length - 1]}»? Esa parece rápida.`);
      break;
    }
    case "srv": {
      const ram = d.ramTotal ? Math.round((d.ramUsed / d.ramTotal) * 100) : null, disk = d.disk?.total ? Math.round((d.disk.used / d.disk.total) * 100) : null;
      add(d.cpu != null && (d.cpu >= 70 ? `La CPU va al ${d.cpu}%. Algo está trabajando duro.` : d.cpu <= 10 && `CPU al ${d.cpu}%. El servidor se aburre como yo.`));
      add(ram != null && ram >= 80 && `La memoria está al ${ram}%. Apretadito.`);
      add(disk != null && `El disco está al ${disk}%.`);
      add(d.temp != null && (d.temp >= 60 ? `${Math.round(d.temp)} °C en la CPU. Calentito.` : `CPU a ${Math.round(d.temp)} °C. Fresquita.`));
      add(d.uptime >= 86400 * 7 && `Lleva ${Math.floor(d.uptime / 86400)} días sin apagarse. Ni yo aguanto tanto.`);
      add(d.watts != null && `Ahora mismo gasta ${Math.round(d.watts)} W.`);
      break;
    }
    case "cal": {
      const now = Date.now(), ev = (d.events || []).filter((e) => +new Date(e.end) > now);
      const next = ev.find((e) => !e.allDay) || ev[0];
      if (!next) return pick(["Agenda libre. Nadie te reclama.", "No tienes nada en el calendario. Plan: nada."]);
      const st = new Date(next.start), mins = Math.round((st - now) / 60000);
      if (!next.allDay && mins <= 0) add(`Ahora mismo: «${next.title}».`);
      else if (!next.allDay && mins < 90) add(`«${next.title}» empieza en ${pl(mins, "minuto", "minutos")}.`);
      else add(`Lo próximo: «${next.title}», ${st.toDateString() === new Date().toDateString() ? "hoy" : "el " + st.toLocaleDateString("es-ES", { weekday: "long" })}${next.allDay ? "" : " a las " + st.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`);
      add(ev.length > 3 && `Tienes ${ev.length} cosas por delante. Ánimo.`);
      break;
    }
    case "gh": {
      add(d.streak >= 3 && `Racha de ${d.streak} días seguidos programando. ¡Máquina!`, d.streak === 0 && "Hoy no hay commits todavía. Sin presión.");
      add(d.prs?.count ? `Tienes ${pl(d.prs.count, "PR abierta", "PRs abiertas")}${d.prs.items?.[0] ? `, como «${d.prs.items[0].title}»` : ""}.` : "Ninguna PR abierta. Limpio.");
      add(d.issues?.count > 0 && `${pl(d.issues.count, "issue te espera", "issues te esperan")}.`);
      add(d.total && `${d.total} contribuciones este año.`);
      break;
    }
    case "dp": {
      const S = d.servers || [], run = S.filter((x) => x.running), pls = run.reduce((t, x) => t + (x.players || 0), 0);
      if (!S.length) return "No hay servidores de Minecraft. Aún.";
      add(pls ? `Hay ${pl(pls, "jugador", "jugadores")} dentro. ¿Te unes?` : run.length ? `${run[0].name} está encendido y vacío. Qué pena.` : "Todos los servidores están apagados. Silencio cúbico.");
      add(S.some((x) => x.starting) && "Uno se está despertando…");
      break;
    }
    case "ha": {
      const rb = d.roomba, bl = d.boiler;
      add(rb && (rb.state === "cleaning" ? `${rb.name || "La aspiradora"} está aspirando. Yo me aparto.` : `${rb.name || "La aspiradora"}: ${ROOMBA[rb.state] || rb.state}${rb.battery != null ? `, con un ${rb.battery}% de batería` : ""}.`));
      add(bl && (bl.on ? `${bl.name || "La caldera"} está encendida. Calorcito.` : `${bl.name || "La caldera"} está apagada.`));
      add(d.temp != null && `En casa hay ${Math.round(d.temp * 10) / 10} ${d.tempUnit || "°C"}.`);
      break;
    }
    case "im": {
      add(d.today ? `Hoy has subido ${pl(d.today, "foto", "fotos")}. ¿Me sacas una?` : "Hoy no hay fotos nuevas. Yo poso gratis.");
      add(d.photos && `${d.photos.toLocaleString("es-ES")} fotos guardadas. Cuántos recuerdos.`);
      add(d.videos && `Y ${pl(d.videos, "vídeo", "vídeos")}.`);
      break;
    }
  }
  return L.length ? pick(L) : null;
}

/* ---------- preguntas sobre los datos ---------- */

export const plain = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// de qué widget habla una frase (el orden importa: «temperatura del servidor» es srv, no clima)
const TOPICS = [
  ["srv", /servidor|\bcpu\b|\bram\b|memoria|disco|consumo|vatios|\bwatts?\b|uptime|procesador|maquina/],
  ["ha", /casa|caldera|calefaccion|roomba|aspirador|home ?assistant|hogar/],
  ["wx", /tiempo hace|que tiempo|clima|llov|lluvi|calor|frio|temperatura|grados|viento|paraguas|abrig|nublad|soleado|chaquet|jersey|sudadera|bufanda|que me pongo|manga corta|ropa/],
  ["fm", /dinero|patrimonio|ahorr|gast|ingres|invers|finanz|financemaster|pasta|sueldo|euros|cuanto tengo|cuentas?\b/],
  ["svc", /servicio|\bping\b|caid|latencia|\bapps?\b|aplicaciones/],
  ["cal", /calendario|evento|agenda|\bcitas?\b|reunion|que tengo|planes|tengo (hoy|manana)|tengo algo|hay algo (hoy|manana|el|este|esta)|estoy libre|ocupad/],
  ["gh", /github|commit|racha|contribuc|\bprs?\b|pull request|issues?|\bci\b|repos?\b|programa/],
  ["dp", /minecraft|discopanel|jugador|\bmine\b/],
  ["im", /immich|\bfotos?\b|videos?|galeria/],
  ["todo", /tareas?|pendiente|to-do|que me queda|que hago|por hacer/],
];
const ALL = /como va (todo|la cosa)|resumen|va todo bien|todo bien|esta todo|estado|novedades|que hay de nuevo|alertas?|algo (mal|raro)|algun problema|que pasa\b/;
// «dime algo de mis widgets»: unas cuantas cosas al azar de lo que hay en la página
const SOME = /widgets?|mis cosas|mis datos|dime algo|cuentame algo|algo interesante|sorprendeme|que sabes de mi/;
const TIME = /que hora|que dia (es|estamos)|que fecha|a que estamos/;

export function topics(text) {
  const t = plain(text);
  let ids = TOPICS.filter(([, re]) => re.test(t)).map(([id]) => id);
  // «temperatura»/«calor» a secas con casa o servidor delante no es el clima
  if ((ids.includes("ha") || ids.includes("srv")) && !/tiempo|clima|llov|lluvi|viento|paraguas|fuera|calle/.test(t)) ids = ids.filter((id) => id !== "wx");
  return ids.slice(0, 2);
}

// Respuesta exacta con los datos reales, sin pasar por la IA. null si la pregunta no va de datos.
export function answer(text, f = {}, now = Date.now()) {
  const t = plain(text), W = f.w || {};
  if (TIME.test(t)) {
    const d = new Date(now);
    return `Son las ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")} del ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}.`;
  }
  // «¿está caído Plex?», «¿cómo va Jellyfin?»: un servicio por su nombre
  const one = svcNamed(t, W.svc);
  if (one) return one.up === false ? `${one.name} no responde ahora mismo.` : one.up ? `${one.name} funciona${one.ms != null ? ` (${one.ms} ms)` : ""}.` : `Aún no sé si ${one.name} responde.`;
  const ids = topics(text);
  if (!ids.length && SOME.test(t) && !ALL.test(t)) {
    const ok = ["fm", "svc", "wx", "todo", "srv", "cal", "gh", "dp", "ha", "im"].filter((k) => W[k] && W[k].ok !== false && !W[k].state && (!Array.isArray(W[k]) || W[k].length));
    for (let i = ok.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ok[i], ok[j]] = [ok[j], ok[i]]; }
    const said = ok.slice(0, 3).map((id) => report(id, "", W, f)).filter(Boolean);
    if (said.length) return said.join("\n"); // una burbuja por widget
  }
  if (!ids.length) {
    if (!ALL.test(t)) return null;
    const o = [];
    o.push(f.alerts?.length ? `Hay ${f.alerts.length === 1 ? "un aviso" : f.alerts.length + " avisos"}: ${f.alerts.slice(0, 2).join("; ")}.` : "Todo en orden, sin avisos.");
    if (f.services?.total && !f.services.down?.length) o.push(`Los ${f.services.total} servicios responden.`);
    if (f.weather) o.push(`Fuera, ${f.weather.t}° en ${f.weather.city}.`);
    if (f.todos?.length) o.push(`Te ${f.todos.length === 1 ? "queda una tarea" : `quedan ${f.todos.length} tareas`}.`);
    return o.join(" ");
  }
  return ids.map((id) => report(id, t, W, f, now)).filter(Boolean).join(" ") || null;
}

const SVC_ASK = /\b(caid[oa]s?|funciona|va|anda|responde|activo|arriba|vivo|ping|online|offline|down|bien|mal|abajo|esta|estado)\b/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function svcNamed(t, S) {
  if (!S?.length || !SVC_ASK.test(t)) return null;
  return S.find((x) => {
    const n = plain(x.name).trim();
    return n.length >= 3 && new RegExp(`(?:^|[^a-z0-9])${esc(n)}(?:$|[^a-z0-9])`).test(t);
  }) || null;
}

// el día (o días) por el que pregunta: «mañana», «el viernes», «el 15», «esta semana», «el finde»…
// → { from, to, k (días desde hoy), label } o null
const WD = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export function askedDay(text, now = Date.now()) {
  const t = plain(text), d0 = new Date(now);
  const day = (k) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k).getTime();
  const dow = d0.getDay();
  if (/\b(?:fin de semana|finde)\b/.test(t)) {
    const k = dow === 0 ? -1 : 6 - dow; // el domingo, el que está en curso
    return { from: day(Math.max(k, 0)), to: day(k + 2), k: Math.max(k, 0), label: "este fin de semana" };
  }
  if (/\besta semana\b/.test(t)) return { from: day(0), to: day((8 - dow) % 7 || 7), k: 0, label: "esta semana" };
  if (/\bhoy\b|\besta (?:manana|tarde|noche)\b/.test(t)) return { from: day(0), to: day(1), k: 0, label: "hoy" };
  const w = parseWhen(t, now);
  if (!w) return null;
  const a = new Date(w.at), from = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const k = Math.round((from - day(0)) / 864e5);
  const label = k === 0 ? "hoy" : k === 1 ? "mañana" : k === 2 ? "pasado mañana"
    : `el ${WD[a.getDay()]}${k < 7 ? "" : ` ${a.getDate()}`}`;
  return { from, to: day(k + 1), k, label };
}

// Lo que se sabe de un widget, dicho en una o dos frases (con matices según la pregunta)
function report(id, t, W, f, now = Date.now()) {
  const d = W[id];
  const off = { srv: "el servidor", cal: "el calendario", gh: "GitHub", dp: "DiscoPanel", ha: "Home Assistant", im: "Immich" }[id];
  if (off) {
    if (!d) return `Aún estoy leyendo ${off}.`;
    if (!d.ok) return d.auth ? `Para ver ${off} tienes que iniciar sesión en Editar.` : d.error === "sin configurar" ? `No tengo ${off} configurado. Se hace en Editar → Conexiones.` : `${off.charAt(0).toUpperCase() + off.slice(1)} no responde ahora mismo, así que no sé.`;
  }
  const pc = (a, b) => Math.round((a / b) * 100);
  switch (id) {
    case "wx": {
      if (!d) return "Todavía no sé qué tiempo hace.";
      // otro día: «¿lloverá mañana?», «¿qué tiempo hará el sábado?», «el finde»
      const ask = askedDay(t, now);
      if (ask && (ask.k >= 1 || ask.to - ask.from > 864e5)) {
        const n = Math.round((ask.to - ask.from) / 864e5), D = (d.days || []).map((x, i) => ({ ...x, i })).filter((x) => x.i >= ask.k && x.i < ask.k + n);
        if (!D.length) return `Solo tengo la previsión de los próximos ${d.days?.length || 1} días.`;
        const name = (x) => (x.i === 0 ? "hoy" : x.i === 1 ? "mañana" : x.i === 2 && n === 1 ? "pasado mañana" : `el ${WD[(new Date(now).getDay() + x.i) % 7]}`);
        const rainQ = /llov|lluvi|paraguas/.test(t);
        const parts = D.map((x) => {
          const sk = sky(x.c), r = x.rain;
          if (rainQ) return `${name(x)}, ${r != null ? `un ${r}% de lluvia` : sk === "lluvia" || sk === "tormenta" ? "lluvia" : "no parece que llueva"}`;
          return `${name(x)} de ${Math.round(x.lo)}° a ${Math.round(x.hi)}°${sk ? `, ${sk}` : ""}${r != null && r >= 20 ? ` (${r}% de lluvia)` : ""}`;
        });
        const s = parts.join("; ");
        return `${s[0].toUpperCase() + s.slice(1)} en ${d.city}.`;
      }
      if (/llov|lluvi|paraguas/.test(t)) return `Hoy hay un ${d.rain ?? 0}% de lluvia en ${d.city}.${(d.rain ?? 0) >= 50 ? " Coge paraguas." : " Yo no lo cogería."}`;
      if (/viento/.test(t) && d.wind != null) return `Sopla a ${Math.round(d.wind)} km/h en ${d.city}.`;
      const night = /noche|luego|mas tarde|al salir|esta tarde/.test(t), low = d.night ?? d.lo;
      // ¿chaqueta? se decide con la sensación de ahora o con la mínima de esta noche
      if (/chaquet|abrig|jersey|sudadera|bufanda|que me pongo|manga|ropa|frio|calor/.test(t)) {
        const v = Math.round(night ? low : d.feels ?? d.t);
        const when = night ? `Esta noche bajará a ${v}°` : `Ahora se sienten ${v}°`;
        const tip = v <= 10 ? "Sí, abrigo de los buenos." : v <= 15 ? "Sí, coge chaqueta." : v <= 19 ? "Una chaqueta fina o una sudadera, por si acaso." : "No hace falta chaqueta.";
        return `${when} en ${d.city}. ${tip}${(d.rain ?? 0) >= 50 ? ` Y paraguas: ${d.rain}% de lluvia.` : ""}`;
      }
      if (night) return `Esta noche en ${d.city} bajará a ${Math.round(low)}°${(d.rain ?? 0) >= 40 ? `, con un ${d.rain}% de lluvia hoy` : ""}.`;
      return `Ahora ${Math.round(d.t)}° en ${d.city}${d.feels != null && Math.abs(d.feels - d.t) >= 2 ? ` (se sienten ${Math.round(d.feels)}°)` : ""}. Hoy entre ${Math.round(d.lo)}° y ${Math.round(d.hi)}°, ${d.rain ?? 0}% de lluvia.`;
    }
    case "fm": {
      if (!d || d.state) return d?.state === "login" ? "FinanceMaster está sin sesión: pulsa el widget de Patrimonio para conectarlo." : d?.state === "offline" ? "FinanceMaster no responde, así que no veo tus cuentas." : "Aún estoy leyendo FinanceMaster.";
      if (/gast/.test(t)) return `Este ciclo has gastado ${eu(d.exp)}${d.inc ? ` de ${eu(d.inc)} que han entrado` : ""}.`;
      if (/ingres|sueldo/.test(t)) return `Este ciclo han entrado ${eu(d.inc)}.`;
      if (/ahorr/.test(t)) return `Este ciclo llevas ${eu(d.s)} ahorrados${d.inc > 0 ? ` (un ${pc(d.s, d.inc)}% de lo que entra)` : ""}.`;
      if (/invers/.test(t)) return d.inv ? `Tienes ${eu(d.inv)} invertidos.` : "No veo inversiones en FinanceMaster.";
      return `Tu patrimonio neto es de ${eu(d.nw)}${d.first != null ? `, ${d.nw >= d.first ? "+" : "−"}${eu(Math.abs(d.nw - d.first))} en el periodo` : ""}. Este ciclo: ${eu(d.inc)} de ingresos, ${eu(d.exp)} de gastos.`;
    }
    case "svc": {
      const S = W.svc;
      if (!S?.length) return "Todavía estoy comprobando los servicios.";
      const down = S.filter((x) => x.up === false);
      if (down.length) return `No responde${down.length > 1 ? "n" : ""}: ${down.map((x) => x.name).join(", ")}. El resto, bien.`;
      const fast = S.filter((x) => x.ms != null).sort((a, b) => a.ms - b.ms);
      return `Los ${S.length} servicios responden.${fast.length > 1 ? ` El más rápido, ${fast[0].name} (${fast[0].ms} ms); el más lento, ${fast[fast.length - 1].name} (${fast[fast.length - 1].ms} ms).` : ""}`;
    }
    case "srv": {
      const o = [];
      if (d.cpu != null) o.push(`CPU al ${d.cpu}%`);
      if (d.temp != null) o.push(`a ${Math.round(d.temp)} °C`);
      if (d.ramTotal) o.push(`memoria al ${pc(d.ramUsed, d.ramTotal)}%`);
      if (d.disk?.total) o.push(`disco al ${pc(d.disk.used, d.disk.total)}%`);
      if (d.watts != null) o.push(`gastando ${Math.round(d.watts)} W`);
      return `El servidor va con ${o.join(", ") || "datos que no entiendo"}.${d.uptime ? ` Lleva ${pl(Math.floor(d.uptime / 86400), "día", "días")} encendido.` : ""}`;
    }
    case "cal": {
      const ev = (d.events || []).filter((e) => +new Date(e.end) > now);
      const hm = (s) => s.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      const ask = askedDay(t, now);
      if (ask) {
        // el calendario llega con los próximos 8 días
        if (ask.k >= 8) return `Solo veo los próximos 8 días del calendario, y ${ask.label} queda más lejos.`;
        const many = ask.to - ask.from > 864e5;
        const L = ev.filter((e) => +new Date(e.start) < ask.to && +new Date(e.end) > Math.max(ask.from, now));
        if (!L.length) return `No tienes nada ${ask.label}.`;
        const one = (e) => { const s = new Date(e.start); return `«${e.title}»${many ? ` el ${WD[s.getDay()]}` : ""}${e.allDay ? (many ? "" : " (todo el día)") : ` a las ${hm(s)}`}`; };
        const shown = L.slice(0, 4).map(one), more = L.length > 4 ? ` y ${L.length - 4} más` : "";
        const label = ask.label[0].toUpperCase() + ask.label.slice(1);
        return `${label} tienes ${shown.length > 1 ? shown.slice(0, -1).join(", ") + " y " + shown.at(-1) : shown[0]}${more}.`;
      }
      const list = ev.slice(0, 3);
      if (!list.length) return "No tienes nada próximo en el calendario.";
      const when = (e) => { const s = new Date(e.start); return (s.toDateString() === new Date(now).toDateString() ? "hoy" : s.toLocaleDateString("es-ES", { weekday: "long" })) + (e.allDay ? "" : " a las " + hm(s)); };
      return `${list.length === 1 ? "Tienes" : "Lo próximo:"} ${list.map((e) => `«${e.title}» ${when(e)}`).join("; ")}.`;
    }
    case "gh":
      return `Racha de ${pl(d.streak ?? 0, "día", "días")}, ${d.total ?? 0} contribuciones este año, ${pl(d.prs?.count ?? 0, "PR abierta", "PRs abiertas")} y ${pl(d.issues?.count ?? 0, "issue", "issues")}.${d.failing?.length ? ` El CI falla en ${d.failing.join(", ")}.` : ""}`;
    case "dp": {
      const S = d.servers || [];
      if (!S.length) return "No hay servidores de Minecraft en DiscoPanel.";
      return S.map((x) => `${x.name}: ${x.running ? `encendido, ${pl(x.players || 0, "jugador", "jugadores")}` : x.starting ? "arrancando" : "apagado"}`).join("; ") + ".";
    }
    case "ha": {
      const o = [];
      if (d.temp != null) o.push(`En casa hay ${Math.round(d.temp * 10) / 10} ${d.tempUnit || "°C"}`);
      if (d.boiler) o.push(`${d.boiler.name || "la caldera"} está ${d.boiler.on ? "encendida" : "apagada"}`);
      if (d.roomba) o.push(`${d.roomba.name || "la Roomba"} está ${ROOMBA[d.roomba.state] || d.roomba.state}${d.roomba.battery != null ? ` (${d.roomba.battery}%)` : ""}`);
      return o.length ? o.join(", ") + "." : "Home Assistant no me da datos.";
    }
    case "im":
      return `Hoy ${d.today ? `has subido ${pl(d.today, "foto", "fotos")}` : "no hay fotos nuevas"}. En total, ${(d.photos ?? 0).toLocaleString("es-ES")} fotos y ${(d.videos ?? 0).toLocaleString("es-ES")} vídeos.`;
    case "todo": {
      const L = f.todos ?? W.todo;
      if (!L) return "El widget de tareas no está activado.";
      if (!L.length) return "No tienes tareas pendientes.";
      return `Te ${L.length === 1 ? "queda una" : `quedan ${L.length}`}: ${L.slice(0, 4).map((x) => `«${x}»`).join(", ")}${L.length > 4 ? "…" : "."}`;
    }
  }
  return null;
}

// ¿Hay que buscar en internet? Devuelve qué buscar, o null.
// «busca X» siempre; si no, preguntas de cultura o de actualidad que no van de tus datos ni de la página.
const ASK_WEB = /^(?:oye\s+|lunares\s*,?\s*)?(?:(?:busca(?:me)?|buscar|googlea|investiga)(?:\s+en\s+(?:internet|google|la web|la red))?|mira en (?:internet|google|la web))\s+(?:sobre\s+|qu[eé]\s+|a ver\s+)?(.+)/i;
const FACT = /\b(quien (es|fue|era|gano|invento|descubrio|escribio|dirigio|canta)|que (es|son|fue|significa|quiere decir|paso)\b|cuando (es|fue|sale|se estrena|empieza|murio|nacio)|donde (esta|queda|nacio)|cuant[oa]s? (mide|pesa|cuesta|vale|tiene|habitantes|anos)|como se (hace|dice|llama)|capital de|poblacion de|precio de|noticias?|actualidad|ultim[oa]s?|resultado|marcador|quien gano|estreno|en internet|wikipedia|por que)\b/;
export function webQuery(text) {
  const raw = String(text || "").trim();
  const m = raw.match(ASK_WEB);
  if (m && m[1].trim().length > 1) return m[1].replace(/[¿?¡!.]+$/g, "").trim();
  const t = plain(raw);
  if (topics(raw).length || TIME.test(t) || ALL.test(t) || SOME.test(t)) return null;
  // sobre él mismo o la página ya contesta la IA con lo que sabe
  if (/\b(eres|te llamas|tu nombre|esta pagina|la pagina|lunares)\b/.test(t)) return null;
  return FACT.test(t) ? raw.replace(/^(oye|lunares)[\s,]+/i, "").replace(/[¿?¡!]+/g, "").trim() : null;
}

// Resumen compacto de los datos de los widgets para el contexto de la IA (`only`: un solo widget).
export function brief(f = {}, only) {
  const W = f.w || {}, o = [];
  const want = (id) => !only || only === id;
  const pc = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "?");
  const bad = (id, label) => {
    const d = W[id];
    if (!d) return `${label}: cargando.`;
    if (!d.ok) return `${label}: ${d.auth ? "bloqueado hasta iniciar sesión" : d.error === "sin configurar" ? "sin configurar" : "no responde"}.`;
    return null;
  };
  if (want("fm") && W.fm) {
    const d = W.fm;
    if (d.state) o.push(`Patrimonio: ${d.state === "login" ? "FinanceMaster sin sesión" : d.state === "offline" ? "FinanceMaster no responde" : "cargando"}.`);
    else o.push(`Patrimonio (FinanceMaster): neto ${eu(d.nw)}${d.first != null ? ` (${d.nw >= d.first ? "+" : "−"}${eu(Math.abs(d.nw - d.first))} en el periodo)` : ""}; este ciclo: ingresos ${eu(d.inc)}, gastos ${eu(d.exp)}, ahorro ${eu(d.s)}${d.inv ? `; invertido ${eu(d.inv)}` : ""}.`);
  }
  if (want("svc") && W.svc?.length) o.push(`Servicios (ping): ${W.svc.map((x) => `${x.name} ${x.up === false ? "CAÍDO" : x.up ? (x.ms != null ? x.ms + " ms" : "ok") : "?"}`).join(", ")}.`);
  if (want("wx") && W.wx) {
    const d = W.wx, tm = d.days?.[1];
    o.push(`Clima en ${d.city}: ${Math.round(d.t)}°${d.feels != null ? ` (sensación ${Math.round(d.feels)}°)` : ""}, hoy de ${Math.round(d.lo)}° a ${Math.round(d.hi)}°, lluvia ${d.rain ?? 0}%${d.wind != null ? `, viento ${Math.round(d.wind)} km/h` : ""}${tm ? `; mañana de ${Math.round(tm.lo)}° a ${Math.round(tm.hi)}°` : ""}.`);
  }
  if (want("todo") && W.todo) o.push(W.todo.length ? `Tareas pendientes: ${W.todo.slice(0, 6).join("; ")}.` : "Tareas: ninguna pendiente.");
  if (want("srv") && W.srv) {
    const d = W.srv;
    o.push(bad("srv", "Servidor") || `Servidor: CPU ${d.cpu ?? "?"}%, RAM ${pc(d.ramUsed, d.ramTotal)}, disco ${d.disk ? pc(d.disk.used, d.disk.total) : "?"}${d.temp != null ? `, ${Math.round(d.temp)} °C` : ""}${d.uptime ? `, encendido ${Math.floor(d.uptime / 86400)} días` : ""}${d.watts != null ? `, ${Math.round(d.watts)} W` : ""}.`);
  }
  if (want("cal") && W.cal) {
    const now = Date.now(), ev = (W.cal.events || []).filter((e) => +new Date(e.end) > now).slice(0, 4);
    o.push(bad("cal", "Calendario") || (ev.length ? `Calendario: ${ev.map((e) => `«${e.title}» ${new Date(e.start).toLocaleString("es-ES", e.allDay ? { weekday: "short", day: "numeric" } : { weekday: "short", hour: "2-digit", minute: "2-digit" })}`).join("; ")}.` : "Calendario: nada próximo."));
  }
  if (want("gh") && W.gh) { const d = W.gh; o.push(bad("gh", "GitHub") || `GitHub: racha ${d.streak ?? 0} días, ${d.total ?? 0} contribuciones este año, ${d.prs?.count ?? 0} PRs abiertas, ${d.issues?.count ?? 0} issues.`); }
  if (want("dp") && W.dp) { const S = W.dp.servers || []; o.push(bad("dp", "DiscoPanel") || `DiscoPanel (Minecraft): ${S.length ? S.map((x) => `${x.name} ${x.running ? `encendido, ${x.players || 0} jugadores` : x.starting ? "arrancando" : "apagado"}`).join("; ") : "sin servidores"}.`); }
  if (want("ha") && W.ha) {
    const d = W.ha, p = [];
    if (d.temp != null) p.push(`${Math.round(d.temp * 10) / 10} ${d.tempUnit || "°C"} en casa`);
    if (d.boiler) p.push(`caldera ${d.boiler.on ? "encendida" : "apagada"}`);
    if (d.roomba) p.push(`Roomba ${ROOMBA[d.roomba.state] || d.roomba.state}${d.roomba.battery != null ? ` (${d.roomba.battery}%)` : ""}`);
    o.push(bad("ha", "Casa") || `Casa (Home Assistant): ${p.join(", ") || "sin datos"}.`);
  }
  if (want("im") && W.im) { const d = W.im; o.push(bad("im", "Immich") || `Immich: ${d.today ?? 0} fotos hoy, ${d.photos ?? 0} fotos y ${d.videos ?? 0} vídeos en total.`); }
  const al = only ? W.alert?.[only] : Object.values(W.alert || {}).join("; ");
  if (al) o.push(`ALERTA: ${al}.`);
  return o.join("\n");
}
