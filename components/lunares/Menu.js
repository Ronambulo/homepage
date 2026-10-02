// Kero: menú rápido del clic derecho. Cambia ajustes al momento (se guardan solos), lista los recordatorios
// (y lo que vigila porque se lo has pedido: «avísame si la CPU pasa de 80»)
// y lo que sabe de ti (con buscador y para borrar cada cosa).
import { useEffect, useRef, useState } from "react";
import { COLORS, shortWhen, shortRep, fmtRep, searchFacts, planWhen } from "@/lib/lunares";
import { I, Ic, CHECK, CHEV } from "./Face";
import { chime } from "./sound";

// nombres de los colores
// los datos especiales llevan su etiqueta (lib/lunares/memory.js)
const kindTag = (f) => (f.kind === "episode" ? "Charla" : f.kind === "plan" ? `Plan · ${planWhen(f)}` : f.kind === "pref" ? "Cómo hablarte" : null);
const CNAME = { tema: "Tema", menta: "Menta", ambar: "Ámbar", indigo: "Índigo", malva: "Malva", coral: "Coral", cielo: "Cielo" };

export default function Menu({ at, layer, s, fill, status, rems, facts = [], onTweak, onAct, onDelRem, onDelFact, onClose }) {
  const ref = useRef(null);
  const [sub, setSub] = useState(null); // submenú abierto (hablar, tamaño, moverse, lo que sabe de ti)
  const [fq, setFq] = useState(""); // buscar en lo que sabe de ti

  // que no se salga de la pantalla y que se cierre al pulsar fuera, con Escape o al cambiar de ventana
  useEffect(() => {
    const m = ref.current, L = layer.current;
    if (m && L) {
      const x = Math.min(Math.max(8, at.x), L.clientWidth - m.offsetWidth - 8), y = Math.min(Math.max(8, at.y), L.clientHeight - m.offsetHeight - 8);
      m.style.left = x + "px"; m.style.top = y + "px"; m.style.visibility = "visible";
      // los submenús se abren hacia el lado en el que caben
      m.classList.toggle("flip", x + m.offsetWidth + 180 > L.clientWidth);
    }
    const off = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", esc);
    window.addEventListener("blur", onClose); window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", esc);
      window.removeEventListener("blur", onClose); window.removeEventListener("resize", onClose);
    };
  }, [at, layer, onClose]);

  const tweak = (k, v) => onTweak?.({ [k]: v });
  // fila con submenú: muestra el valor actual y al pasar por encima (o pulsar) despliega las opciones
  const pickRow = (k, icon, label, opts) => {
    const cur = opts.find(([v]) => s[k] === v) || opts[0];
    return (
      <div className="lun-mwrap" onPointerEnter={(ev) => ev.pointerType === "mouse" && setSub(k)} onPointerLeave={(ev) => ev.pointerType === "mouse" && setSub(null)}>
        <button className={"lun-mit" + (sub === k ? " open" : "")} role="menuitem" aria-haspopup="true" aria-expanded={sub === k} onClick={() => setSub(sub === k ? null : k)}>
          <Ic d={icon} /><span className="lun-ml">{label}</span><span className="lun-mv">{cur[2] || cur[1]}</span><Ic d={CHEV} small />
        </button>
        {sub === k && (
          <div className="lun-sub" role="menu" aria-label={label}>
            {opts.map(([v, l, , hint]) => (
              <button key={v} className={"lun-mit" + (s[k] === v ? " on" : "")} role="menuitemradio" aria-checked={s[k] === v} onClick={() => { tweak(k, v); setSub(null); }}>
                {s[k] === v ? <Ic d={CHECK} accent /> : <i className="lun-mi" />}<span className="lun-ml">{l}</span>{hint && <span className="lun-mv">{hint}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };
  const check = (k, label) => (
    <button className="lun-mit" role="menuitemcheckbox" aria-checked={!!s[k]} onClick={() => { tweak(k, !s[k]); if (k === "sound" && !s[k]) chime(); }}>
      {s[k] ? <Ic d={CHECK} accent /> : <i className="lun-mi" />}<span className="lun-ml">{label}</span>
    </button>
  );
  const asleep = status === "dormido";
  // lo que sabe de ti: lo más nuevo arriba; al buscar, lo que más se parece
  const shown = fq.trim() ? searchFacts(facts, fq, { k: 60 }).map((h) => h.fact) : [...facts].reverse();
  const memRow = (
    <div className="lun-mwrap">
      <button className={"lun-mit" + (sub === "mem" ? " open" : "")} role="menuitem" aria-haspopup="true" aria-expanded={sub === "mem"} onClick={() => { setSub(sub === "mem" ? null : "mem"); setFq(""); }}>
        <Ic d={I.heart} /><span className="lun-ml">Lo que sé de ti</span><span className="lun-mv">{facts.length || ""}</span><Ic d={CHEV} small />
      </button>
      {sub === "mem" && (
        <div className="lun-sub lun-memsub" role="dialog" aria-label="Lo que sé de ti">
          {facts.length > 4 && <input className="lun-mq" type="search" placeholder="Buscar…" aria-label="Buscar en lo que sé de ti" value={fq} autoFocus onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && fq) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setFq(""); } }} />}
          <div className="lun-mlist">
            {shown.map((f) => (
              <div key={f.id || f.text} className="lun-mrem lun-mfact">
                <span className="lun-ml" title={f.at ? `Desde el ${new Date(f.at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}` : undefined}>{kindTag(f) && <span className="lun-mtag">{kindTag(f)}</span>}{f.text[0].toUpperCase() + f.text.slice(1)}</span>
                <button className="lun-mx" aria-label={`Olvidar «${f.text}»`} title="Olvidar" onClick={() => onDelFact?.(f.id)}><Ic d={I.x} small /></button>
              </div>
            ))}
            {!facts.length && <div className="lun-mempty">Todavía nada. Cuéntame cosas: «me llamo…», «me encanta…», «recuerda que…».</div>}
            {facts.length > 0 && !shown.length && <div className="lun-mempty">Nada sobre «{fq.trim()}».</div>}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={ref} className="lun-menu" role="menu" aria-label={`Opciones de ${s.name}`} style={{ left: at.x, top: at.y, visibility: "hidden" }} onContextMenu={(ev) => ev.preventDefault()}>
      <div className="lun-mh"><i style={{ background: fill }} /><b>{s.name}</b><span>{status}</span></div>
      <div className="lun-msep" />
      {rems.length > 0 && (
        <>
          <div className="lun-mcap">{rems.every((r) => r.kind === "watch") ? "Avisos" : "Recordatorios"}</div>
          {rems.slice(0, 5).map((r) => (
            <div key={r.id} className="lun-mrem">
              <Ic d={r.kind === "watch" ? I.eye : r.kind === "timer" ? I.timer : r.rep ? I.repeat : I.bell} />
              <span className="lun-ml" title={r.rep ? `${r.text || "Aviso"} · ${fmtRep(r.rep)}` : r.text}>{r.text || (r.kind === "timer" ? "Temporizador" : "Aviso")}</span>
              <span className="lun-mv" title={r.kind === "watch" ? "Te aviso una vez, cuando pase" : r.rep ? `Próxima: ${shortWhen(r.at)}` : undefined}>{r.kind === "watch" ? "vigilo" : r.rep ? "↻ " + shortRep(r.rep) : shortWhen(r.at)}</span>
              <button className="lun-mx" aria-label={`Borrar «${r.text || "aviso"}»`} title="Borrar" onClick={() => onDelRem(r.id)}><Ic d={I.x} small /></button>
            </div>
          ))}
          {rems.length > 5 && <div className="lun-mcap more">y {rems.length - 5} más</div>}
          <div className="lun-msep" />
        </>
      )}
      {memRow}
      <div className="lun-msep" />
      {pickRow("chatter", I.talk, "Hablar", [["off", "Nada", "", "callado"], ["low", "Poco"], ["high", "Mucho", "", "charlatán"]])}
      {pickRow("size", I.size, "Tamaño", [["s", "Pequeño"], ["m", "Mediano"], ["l", "Grande"]])}
      {pickRow("roam", I.move, "Moverse", [["off", "Quieto"], ["bottom", "Por abajo"], ["free", "Por toda la página", "Libre"]])}
      <div className="lun-mrow">
        <Ic d={I.color} /><span className="lun-ml">Color</span>
        {Object.keys(COLORS).map((c) => <button key={c} className={"lun-msw" + (s.color === c ? " on" : "")} title={CNAME[c] || c} aria-label={CNAME[c] || c} aria-pressed={s.color === c} style={{ background: COLORS[c] || "var(--accent)" }} onClick={() => tweak("color", c)} />)}
      </div>
      <div className="lun-msep" />
      {check("goofy", "Hacer el tonto")}
      {check("comments", "Comentar lo que haces")}
      {check("nudges", "Avisos útiles")}
      {check("daily", "Resumen del día")}
      {check("sound", "Sonido en los avisos")}
      <div className="lun-msep" />
      {s.ai && <button className="lun-mit" role="menuitem" onClick={() => onAct("chat")}><Ic d={I.talk} /><span className="lun-ml">Charlar</span><kbd>doble clic</kbd></button>}
      {asleep
        ? <button className="lun-mit" role="menuitem" onClick={() => onAct("hello")}><Ic d={I.sun} /><span className="lun-ml">Despertar</span></button>
        : <button className="lun-mit" role="menuitem" onClick={() => onAct("sleep")}><Ic d={I.moon} /><span className="lun-ml">Echar la siesta</span></button>}
      <button className="lun-mit" role="menuitem" onClick={() => { onClose(); tweak("enabled", false); }}><Ic d={I.hide} /><span className="lun-ml">Ocultar</span></button>
      <div className="lun-msep" />
      <a className="lun-mit" role="menuitem" href="/kero" target="_blank" rel="noopener" onClick={onClose}><Ic d={I.flow} /><span className="lun-ml">Ver su cerebro</span></a>
      <a className="lun-mit" role="menuitem" href="/admin#lunares"><Ic d={I.more} /><span className="lun-ml">Más ajustes…</span></a>
    </div>
  );
}
