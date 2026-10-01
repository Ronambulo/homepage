// Kero: menú rápido del clic derecho. Cambia ajustes al momento (se guardan solos) y lista los recordatorios.
import { useEffect, useRef, useState } from "react";
import { COLORS, shortWhen, shortRep, fmtRep } from "@/lib/lunares";
import { I, Ic, CHECK, CHEV } from "./Face";
import { chime } from "./sound";

// nombres de los colores
const CNAME = { tema: "Tema", menta: "Menta", ambar: "Ámbar", indigo: "Índigo", malva: "Malva", coral: "Coral", cielo: "Cielo" };

export default function Menu({ at, layer, s, fill, status, rems, onTweak, onAct, onDelRem, onClose }) {
  const ref = useRef(null);
  const [sub, setSub] = useState(null); // submenú abierto (hablar, tamaño, moverse)

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

  return (
    <div ref={ref} className="lun-menu" role="menu" aria-label={`Opciones de ${s.name}`} style={{ left: at.x, top: at.y, visibility: "hidden" }} onContextMenu={(ev) => ev.preventDefault()}>
      <div className="lun-mh"><i style={{ background: fill }} /><b>{s.name}</b><span>{status}</span></div>
      <div className="lun-msep" />
      {rems.length > 0 && (
        <>
          <div className="lun-mcap">Recordatorios</div>
          {rems.slice(0, 5).map((r) => (
            <div key={r.id} className="lun-mrem">
              <Ic d={r.kind === "timer" ? I.timer : r.rep ? I.repeat : I.bell} />
              <span className="lun-ml" title={r.rep ? `${r.text || "Aviso"} · ${fmtRep(r.rep)}` : r.text}>{r.text || (r.kind === "timer" ? "Temporizador" : "Aviso")}</span>
              <span className="lun-mv" title={r.rep ? `Próxima: ${shortWhen(r.at)}` : undefined}>{r.rep ? "↻ " + shortRep(r.rep) : shortWhen(r.at)}</span>
              <button className="lun-mx" aria-label={`Borrar «${r.text || "aviso"}»`} title="Borrar" onClick={() => onDelRem(r.id)}><Ic d={I.x} small /></button>
            </div>
          ))}
          {rems.length > 5 && <div className="lun-mcap more">y {rems.length - 5} más</div>}
          <div className="lun-msep" />
        </>
      )}
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
      <a className="lun-mit" role="menuitem" href="/admin#lunares"><Ic d={I.more} /><span className="lun-ml">Más ajustes…</span></a>
    </div>
  );
}
