// Kero: lo que pasa por su cabeza, para la página del cerebro (/kero). Va por un BroadcastChannel del navegador,
// así que no sale de tu ordenador. Solo se manda mientras /kero está abierta (cada pocos segundos dice «hola»);
// mientras tanto, se guardan los últimos pasos en memoria para enseñarlos al abrirla.
//   ev(k, datos)  → un paso: «in», «route», «cmd», «web», «llm», «mem», «choose», «mood»…
//   run()         → empieza un pensamiento nuevo (una pregunta); los pasos siguientes van con su número
//   state(fn)     → la foto del estado (ánimo, memoria, hábitos…) que se manda cada segundo
//   onAsk(texto)  → una frase escrita en el cerebro para probar (se contesta aquí, como si se la dijeras)
export const BRAIN = "kero-brain";
const KEEP = 200, LISTEN_MS = 8000;

export function makeTrace(on) {
  let bc = null, until = 0, seq = 0, runs = 0, stateFn = null, iv = null;
  const tab = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), buf = [];
  if (on) try { bc = new BroadcastChannel(BRAIN); } catch {}
  const live = () => !!bc && Date.now() < until;
  const post = (m) => { try { bc.postMessage({ ...m, tab }); } catch {} };
  const snap = () => { try { return stateFn?.() || null; } catch { return null; } };
  const T = {
    cur: null, // el pensamiento en curso (o null)
    live,
    ev(k, data = {}, run = T.cur) {
      if (!bc) return;
      const ev = { id: ++seq, at: Date.now(), k, ...(run ? { run } : {}), ...data };
      buf.push(ev); if (buf.length > KEEP) buf.shift();
      if (live()) post({ t: "ev", ev });
    },
    run() { T.cur = tab + ":" + ++runs; return T.cur; },
    end(run) { if (T.cur === run) T.cur = null; },
    state(fn) { stateFn = fn; },
    onAsk: null,
    close() { clearInterval(iv); try { bc?.close(); } catch {} bc = null; },
  };
  if (bc) {
    bc.onmessage = (e) => {
      const m = e.data;
      if (m?.t === "ask" && m.to === tab && typeof m.text === "string") return T.onAsk?.(m.text.trim().slice(0, 300));
      if (m?.t !== "hello") return;
      const fresh = !live() || m.full;
      until = Date.now() + LISTEN_MS;
      if (fresh) post({ t: "history", list: buf, state: snap() });
    };
    iv = setInterval(() => { if (live()) post({ t: "state", state: snap() }); }, 1000);
  }
  return T;
}
