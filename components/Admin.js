"use client";

import { useEffect, useRef, useState } from "react";
import { MODULES, THEMES, SEARCH_ENGINES, ICON_NAMES, themeStyle } from "@/lib/defaults";
import Icon from "./Icon";
import { probeLink, probeHost, resolveUrl, geocode } from "@/lib/util";

const SECTIONS = [
  ["enlaces", "Enlaces", "Aparecen en la fila inferior de la página, en este orden."],
  ["servicios", "Servicios", "Los que comprueba el módulo Servicios de la fila inferior."],
  ["modulos", "Módulos", "Elige qué datos se muestran y en qué orden."],
  ["apariencia", "Apariencia", "Tema, fondo y buscador."],
  ["conexiones", "Conexiones", "FinanceMaster, clima y red."],
  ["copia", "Copia de seguridad", "Exporta o restaura toda la configuración."],
];

const Up = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 15l6-6 6 6" /></svg>;
const Down = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>;
const X = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
const Grip = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" /></svg>;

const move = (arr, i, j) => { const a = [...arr]; if (j < 0 || j >= a.length) return a; a.splice(j, 0, a.splice(i, 1)[0]); return a; };
const uid = () => "l" + Math.random().toString(36).slice(2, 9);
const isHttp = (u) => /^https?:\/\/\S+$/i.test(u);

export default function Admin({ initial, authEnabled }) {
  const [cfg, setCfg] = useState(initial);
  const [tab, setTab] = useState("enlaces");
  const [save, setSave] = useState("ok"); // ok | busy | bad
  const timer = useRef(null), first = useRef(true), latest = useRef(cfg);

  useEffect(() => {
    const h = location.hash.slice(1);
    if (SECTIONS.some(([id]) => id === h)) setTab(h);
  }, []);

  const flush = async () => {
    clearTimeout(timer.current); setSave("busy");
    try {
      const r = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(latest.current) });
      if (r.status === 401) return location.reload();
      setSave(r.ok ? "ok" : "bad");
    } catch { setSave("bad"); }
  };
  const flushRef = useRef(flush); flushRef.current = flush;

  useEffect(() => {
    latest.current = cfg;
    if (first.current) { first.current = false; return; }
    setSave("busy"); clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 600);
  }, [cfg]);

  useEffect(() => {
    const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); flushRef.current(); } };
    const leave = (e) => { if (save !== "ok") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("keydown", key); window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("beforeunload", leave); };
  }, [save]);

  const set = (fn) => setCfg((c) => { const n = structuredClone(c); fn(n); return n; });
  const sec = SECTIONS.find(([id]) => id === tab);
  const { tint, accent } = themeStyle(cfg.appearance.theme, cfg.appearance.intensity);

  return (
    <div className="adm" style={{ "--accent": accent }}>
      <aside className="adm-side">
        <div className="adm-brand">Homepage</div>
        <div className="adm-title">Panel</div>
        <nav className="adm-nav">
          {SECTIONS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); history.replaceState(null, "", "#" + id); }}>{label}</button>
          ))}
        </nav>
        <div className="adm-foot">
          <div className={"status " + save}><i />{save === "busy" ? "Guardando…" : save === "bad" ? <>Error al guardar · <button className="retry" onClick={flush}>reintentar</button></> : "Guardado automáticamente"}</div>
          <a href="/" className="back">← Volver al inicio</a>
          {authEnabled && <button onClick={async () => { await fetch("/api/logout", { method: "POST" }); location.reload(); }}>Cerrar sesión</button>}
        </div>
      </aside>

      <main className="adm-main">
        <div className="adm-head">
          <div><h1>{sec[1]}</h1><p>{sec[2]}</p></div>
          {tab === "servicios" && (
            <button className="pri" onClick={() => set((c) => { if (c.services.length < 24) c.services.push({ id: uid(), name: "", url: "http://" }); }) || focusLast()}>Añadir servicio</button>
          )}
          {tab === "enlaces" && (
            <button className="pri" onClick={() => set((c) => { if (c.links.length < 24) c.links.push({ id: uid(), name: "", url: "http://" }); }) || focusLast()}>Añadir enlace</button>
          )}
        </div>

        {tab === "enlaces" && <Links cfg={cfg} set={set} preview={<Preview cfg={cfg} tint={tint} />} />}
        {tab === "servicios" && <Services cfg={cfg} set={set} />}
        {tab === "modulos" && <Modules cfg={cfg} set={set} />}
        {tab === "apariencia" && <Appearance cfg={cfg} set={set} preview={<Preview cfg={cfg} tint={tint} />} />}
        {tab === "conexiones" && <Connections cfg={cfg} set={set} />}
        {tab === "copia" && <Backup cfg={cfg} setCfg={setCfg} />}
      </main>
    </div>
  );
}

function Preview({ cfg, tint }) {
  const h = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  return (
    <div>
      <div className="cap" style={{ paddingBottom: 10 }}>Vista previa</div>
      <div className="pv" style={{ backgroundImage: `url(/api/background?v=${cfg.appearance.bgVersion})` }}>
        <div className="t" style={{ background: tint }} /><div className="v" />
        <div className="c num">{h}</div>
        <div className="a">+770 €</div>
        <div className="l">{cfg.links.map((l) => <span key={l.id}>{l.name || "—"}</span>)}</div>
      </div>
    </div>
  );
}

function useProbe(items, hosts) {
  const [status, setStatus] = useState({});
  const [alt, setAlt] = useState(false);
  const key = JSON.stringify([items.map((l) => l.url), hosts]);
  useEffect(() => {
    let ok = true;
    const t = setTimeout(async () => {
      const useAlt = await probeHost(hosts);
      if (!ok) return; setAlt(useAlt);
      const res = await Promise.all(items.map(async (l) => [l.id, isHttp(l.url) ? await probeLink(resolveUrl(l.url, hosts, useAlt)) : null]));
      if (ok) setStatus(Object.fromEntries(res));
    }, 500);
    return () => { ok = false; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [status, alt];
}

const focusLast = () => setTimeout(() => { const f = document.querySelectorAll(".lrow[data-r] .f-name"); f[f.length - 1]?.focus(); }, 30);

function Row({ l, i, list, set, kind, status, icon, onPick }) {
  const [drag, setDrag] = useState(false);
  const bad = !l.name.trim() || !isHttp(l.url);
  const dup = list.some((o, j) => j !== i && o.url && o.url === l.url);
  const st = status[l.id];
  const upd = (k, v) => set((c) => { c[kind][i][k] = v; });
  return (
    <div data-r className={"lrow" + (icon ? "" : " svc") + (drag ? " drag" : "")}
      draggable={drag}
      onDragStart={(e) => e.dataTransfer.setData("text", String(i))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const from = +e.dataTransfer.getData("text"); set((c) => { c[kind] = move(c[kind], from, i); }); setDrag(false); }}
      onDragEnd={() => setDrag(false)}>
      <span className="grip" title="Arrastrar para reordenar" onMouseDown={() => setDrag(true)} onMouseUp={() => setDrag(false)}><Grip /></span>
      {icon && <button className="ico ipick" title="Cambiar icono" aria-label="Cambiar icono" onClick={onPick}><Icon link={l} size={20} /></button>}
      <input className={"fld f-name" + (!l.name.trim() ? " bad" : "")} value={l.name} placeholder="Nombre" maxLength={40} aria-label="Nombre" onChange={(e) => upd("name", e.target.value)} />
      <input className={"fld m f-url" + (l.url && !isHttp(l.url) ? " bad" : "")} value={l.url} placeholder="http://…" aria-label="Dirección" onChange={(e) => upd("url", e.target.value)} />
      <span className={"st " + (st === true ? "up" : st === false ? "down" : "")}><i />{st === true ? "En línea" : st === false ? "Sin respuesta" : "—"}</span>
      <span className="acts">
        <button className="ico" disabled={i === 0} aria-label="Subir" onClick={() => set((c) => { c[kind] = move(c[kind], i, i - 1); })}><Up /></button>
        <button className="ico" disabled={i === list.length - 1} aria-label="Bajar" onClick={() => set((c) => { c[kind] = move(c[kind], i, i + 1); })}><Down /></button>
        <button className="ico" aria-label="Eliminar" onClick={() => set((c) => { c[kind].splice(i, 1); })}><X /></button>
      </span>
      {(bad || dup) && <div className="rowmsg">{bad ? "Falta el nombre o la dirección no es http(s): esta fila no se guardará." : "Dirección repetida."}</div>}
    </div>
  );
}

function Links({ cfg, set, preview }) {
  const [status, alt] = useProbe(cfg.links, cfg.hosts);
  const [pick, setPick] = useState(null);
  return (
    <div className="adm-grid">
      <div>
        <div className="lrow lhead cap"><span /><span /><span>Nombre</span><span>Dirección</span><span>Estado</span><span /></div>
        {cfg.links.map((l, i) => (
          <div key={l.id}>
            <Row l={l} i={i} list={cfg.links} set={set} kind="links" status={status} icon onPick={() => setPick(pick === l.id ? null : l.id)} />
            {pick === l.id && (
              <div className="picker">
                <button className={!l.icon ? "on" : ""} onClick={() => set((c) => { c.links[i].icon = ""; })}>Auto</button>
                {ICON_NAMES.map((n) => <button key={n} title={n} className={l.icon === n ? "on" : ""} onClick={() => set((c) => { c.links[i].icon = n; })}><Icon name={n} size={20} /></button>)}
              </div>
            )}
          </div>
        ))}
        {!cfg.links.length && <div className="hint">No hay enlaces. Añade el primero.</div>}
        {alt && <div className="hint">Red alternativa detectada: el estado se comprueba con {cfg.hosts.alt}.</div>}
        <div className="hint">Arrastra el asa o usa las flechas para reordenar. El número de la tarjeta (1–9) es su atajo de teclado.</div>
      </div>
      <div>{preview}</div>
    </div>
  );
}

function Services({ cfg, set }) {
  const [status] = useProbe(cfg.services, cfg.hosts);
  const missing = cfg.links.filter((l) => !cfg.services.some((s) => s.url === l.url));
  return (
    <div className="adm-grid one">
      <div>
        <div className="lrow svc lhead cap"><span /><span>Nombre</span><span>Dirección</span><span>Estado</span><span /></div>
        {cfg.services.map((l, i) => <Row key={l.id} l={l} i={i} list={cfg.services} set={set} kind="services" status={status} />)}
        {!cfg.services.length && <div className="hint">No hay servicios. Añade el primero.</div>}
        {missing.length > 0 && (
          <div className="hint"><button className="pri" onClick={() => set((c) => { for (const l of missing) if (c.services.length < 24) c.services.push({ id: l.id, name: l.name, url: l.url }); })}>Añadir {missing.length} enlace{missing.length > 1 ? "s" : ""} que faltan</button></div>
        )}
        <div className="hint">Puedes vigilar cualquier dirección http(s), aunque no sea un enlace de la página.</div>
      </div>
    </div>
  );
}

function Modules({ cfg, set }) {
  return (
    <div className="adm-grid one">
      <div>
        {cfg.modules.map((m, i) => (
          <div key={m.id} className="card">
            <div><b>{MODULES[m.id].label}</b><span className="d">{MODULES[m.id].desc}</span></div>
            <div className="mv">
              <button disabled={i === 0} aria-label="Subir" onClick={() => set((c) => { c.modules = move(c.modules, i, i - 1); })}><Up /></button>
              <button disabled={i === cfg.modules.length - 1} aria-label="Bajar" onClick={() => set((c) => { c.modules = move(c.modules, i, i + 1); })}><Down /></button>
            </div>
            <button className={"tog" + (m.enabled ? " on" : "")} role="switch" aria-checked={m.enabled} aria-label={MODULES[m.id].label} onClick={() => set((c) => { c.modules[i].enabled = !c.modules[i].enabled; })} />
          </div>
        ))}
        <div className="hint">El orden es de izquierda a derecha en la fila inferior.</div>
      </div>
    </div>
  );
}

function Appearance({ cfg, set, preview }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const a = cfg.appearance;
  const upload = async (file) => {
    if (!file) return; setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/background", { method: "POST", body: fd });
    if (r.ok) set((c) => { c.appearance.bgVersion = Date.now(); }); else setErr((await r.json().catch(() => ({}))).error || "Error al subir");
    setBusy(false);
  };
  const reset = async () => { await fetch("/api/background", { method: "DELETE" }); set((c) => { c.appearance.bgVersion = Date.now(); }); };
  return (
    <div className="adm-grid">
      <div>
        <div className="cap">Tema</div>
        <div className="sw" style={{ marginTop: 14 }}>
          {Object.entries(THEMES).map(([n, t]) => (
            <button key={n} title={n} aria-label={n} className={a.theme === n ? "on" : ""} style={{ background: t.alpha ? `rgb(${t.rgb})` : "#2a2a2c" }} onClick={() => set((c) => { c.appearance.theme = n; })} />
          ))}
        </div>
        <div className="hint">{a.theme}</div>

        <div className="group">
          <label className="lbl">Intensidad del tono · {a.intensity}%</label>
          <input className="range" type="range" min="0" max="100" value={a.intensity} onChange={(e) => set((c) => { c.appearance.intensity = +e.target.value; })} />
        </div>

        <div className="group">
          <div className="cap">Fondo</div>
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="sec" style={{ cursor: "pointer" }}>{busy ? "Subiendo…" : "Subir imagen"}
              <input type="file" accept="image/webp,image/jpeg,image/png,image/avif" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <button className="sec" onClick={reset}>Restaurar original</button>
          </div>
          <div className="err" style={{ marginTop: 8 }}>{err}</div>
          <div className="hint">WebP, JPG, PNG o AVIF · máx. 15 MB. Se convierte a blanco y negro con el tono del tema.</div>
        </div>

        <div className="group">
          <div className="two">
            <div><label className="lbl">Tu nombre (saludo)</label><input className="fld" value={cfg.name} maxLength={40} placeholder="Opcional" onChange={(e) => set((c) => { c.name = e.target.value; })} /></div>
            <div><label className="lbl">Buscador</label>
              <select className="fld" value={a.searchEngine} onChange={(e) => set((c) => { c.appearance.searchEngine = e.target.value; })}>
                {Object.keys(SEARCH_ENGINES).map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="card" style={{ marginTop: 18, gridTemplateColumns: "1fr auto" }}>
            <div><b>Mostrar barra de búsqueda</b></div>
            <button className={"tog" + (a.showSearch ? " on" : "")} role="switch" aria-checked={a.showSearch} aria-label="Búsqueda" onClick={() => set((c) => { c.appearance.showSearch = !c.appearance.showSearch; })} />
          </div>
        </div>
      </div>
      <div>{preview}</div>
    </div>
  );
}

// Campo de secreto: nunca se lee del servidor, solo se sabe si está guardado.
function Secret({ k, label, hint, saved, setSaved, placeholder, type = "password" }) {
  const [v, setV] = useState(""), [busy, setBusy] = useState(false);
  const put = async (val) => {
    setBusy(true);
    try {
      const r = await fetch("/api/secrets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [k]: val }) });
      if (r.status === 401) return location.reload();
      if (r.ok) { setSaved(await r.json()); setV(""); }
    } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 14 }}>
      <label className="lbl">{label}</label>
      <div style={{ display: "flex", gap: 12 }}>
        <input className="fld m" type={type} autoComplete="off" value={v} disabled={busy} placeholder={saved?.[k] ? "•••••••• guardado" : placeholder || ""} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.trim() && put(v)} />
        {v.trim() ? <button className="sec" disabled={busy} onClick={() => put(v)}>Guardar</button> : saved?.[k] && <button className="sec" onClick={() => put("")}>Quitar</button>}
      </div>
      <div className="hint">{saved?.[k] ? "Guardado en el servidor. Escribe uno nuevo para reemplazarlo." : "Sin guardar."}{hint ? " " + hint : ""}</div>
    </div>
  );
}

function Integrations({ cfg, set }) {
  const [saved, setSaved] = useState(null);
  useEffect(() => { fetch("/api/secrets", { cache: "no-store" }).then((r) => r.json()).then(setSaved).catch(() => {}); }, []);
  const it = cfg.integrations;
  const bad = (v) => (v && !isHttp(v) ? { borderColor: "var(--neg)" } : null);
  const S = (p) => <Secret {...p} saved={saved} setSaved={setSaved} />;
  return (
    <>
      <div className="group">
        <div className="cap">Servidor</div>
        <label className="lbl" style={{ marginTop: 16 }}>URL de ZimaOS (opcional)</label>
        <input className="fld m" value={it.srv.zima} placeholder="http://192.168.0.24" style={bad(it.srv.zima)} onChange={(e) => set((c) => { c.integrations.srv.zima = e.target.value.trim(); })} />
        {it.srv.zima && <>{S({ k: "zimaUser", label: "Usuario de ZimaOS", type: "text" })}{S({ k: "zimaPass", label: "Contraseña de ZimaOS" })}</>}
        <div className="hint">Si la rellenas, las métricas salen de ZimaOS (CPU, RAM, temperatura y almacenamiento reales). Si no, se mide la máquina donde corre la página.</div>
        <label className="lbl" style={{ marginTop: 16 }}>Ruta del disco a medir</label>
        <input className="fld m" value={it.srv.disk} placeholder="/" onChange={(e) => set((c) => { c.integrations.srv.disk = e.target.value.trim(); })} />
        <div className="hint">Se mide la máquina donde corre esta página. En Docker, monta el disco del host (p. ej. <span className="mono">-v /:/host:ro</span>) y pon <span className="mono">/host</span>; sin montarlo, verás el disco del contenedor.</div>
      </div>

      <div className="group">
        <div className="cap">Calendario</div>
        {S({ k: "icsUrl", label: "Enlace iCal (.ics)", type: "text", placeholder: "https://…/basic.ics", hint: "Google Calendar: Configuración → tu calendario → «Dirección secreta en formato iCal». Se guarda solo en el servidor." })}
      </div>

      <div className="group">
        <div className="cap">GitHub</div>
        {S({ k: "ghToken", label: "Token de acceso personal", hint: "Solo lectura: permisos «repo» (o fine-grained: Contents, Pull requests, Issues y Commit statuses en lectura)." })}
      </div>

      <div className="group">
        <div className="cap">DiscoPanel</div>
        <label className="lbl" style={{ marginTop: 16 }}>URL</label>
        <input className="fld m" value={it.dp.url} placeholder="http://192.168.0.24:8080" style={bad(it.dp.url)} onChange={(e) => set((c) => { c.integrations.dp.url = e.target.value.trim(); })} />
        {S({ k: "dpUser", label: "Usuario", type: "text" })}
        {S({ k: "dpPass", label: "Contraseña" })}
      </div>

      <div className="group">
        <div className="cap">Immich</div>
        <label className="lbl" style={{ marginTop: 16 }}>URL</label>
        <input className="fld m" value={it.im.url} placeholder="http://192.168.0.24:2283" style={bad(it.im.url)} onChange={(e) => set((c) => { c.integrations.im.url = e.target.value.trim(); })} />
        {S({ k: "immichKey", label: "Clave de API", hint: "Immich → Ajustes de la cuenta → Claves de API. Para ver el total de la biblioteca hace falta una clave de administrador; las subidas de hoy funcionan con cualquiera." })}
      </div>

      <div className="group">
        <div className="cap">Alertas</div>
        <div className="hint" style={{ marginTop: 12 }}>Aparece un punto junto a «Editar» y en la tarjeta afectada cuando se pasa alguno de estos límites, cuando falla el CI de GitHub o cuando una integración no responde.</div>
        <div className="two" style={{ marginTop: 14 }}>
          <div><label className="lbl">Servicio caído (min)</label><input className="fld m" type="number" min="1" max="1440" value={cfg.alerts.downMin} onChange={(e) => set((c) => { c.alerts.downMin = e.target.value; })} /></div>
          <div><label className="lbl">Disco lleno (%)</label><input className="fld m" type="number" min="50" max="100" value={cfg.alerts.disk} onChange={(e) => set((c) => { c.alerts.disk = e.target.value; })} /></div>
        </div>
        <div className="two" style={{ marginTop: 14 }}>
          <div><label className="lbl">Temperatura CPU (°C)</label><input className="fld m" type="number" min="30" max="120" value={cfg.alerts.temp} onChange={(e) => set((c) => { c.alerts.temp = e.target.value; })} /></div>
          <div><label className="lbl">Temperatura discos (°C)</label><input className="fld m" type="number" min="30" max="100" value={cfg.alerts.driveTemp} onChange={(e) => set((c) => { c.alerts.driveTemp = e.target.value; })} /></div>
        </div>
        <div className="hint">Las caídas se detectan solo mientras hay una pestaña con la página abierta (las comprobaciones se hacen desde el navegador).</div>
      </div>

      <div className="group">
        <div className="cap">Home Assistant</div>
        <label className="lbl" style={{ marginTop: 16 }}>URL</label>
        <input className="fld m" value={it.ha.url} placeholder="https://homeassistant.rodriguezdelreal.com" style={bad(it.ha.url)} onChange={(e) => set((c) => { c.integrations.ha.url = e.target.value.trim(); })} />
        {S({ k: "haToken", label: "Token de acceso de larga duración", hint: "Perfil de usuario en Home Assistant → Seguridad → Tokens de acceso de larga duración." })}
        <div className="two" style={{ marginTop: 14 }}>
          <div><label className="lbl">Sensor de temperatura</label><input className="fld m" value={it.ha.temp} placeholder="sensor.zona_temperatura" onChange={(e) => set((c) => { c.integrations.ha.temp = e.target.value.trim(); })} /></div>
          <div><label className="lbl">Roomba</label><input className="fld m" value={it.ha.roomba} placeholder="vacuum.roomba" onChange={(e) => set((c) => { c.integrations.ha.roomba = e.target.value.trim(); })} /></div>
        </div>
        <label className="lbl" style={{ marginTop: 14 }}>Interruptor de la caldera</label>
        <input className="fld m" value={it.ha.boiler} placeholder="switch.caldera" onChange={(e) => set((c) => { c.integrations.ha.boiler = e.target.value.trim(); })} />
        <div className="hint">Los ids de entidad están en Home Assistant → Ajustes → Dispositivos y servicios → Entidades.</div>
      </div>
    </>
  );
}

function Connections({ cfg, set }) {
  const [city, setCity] = useState(cfg.weather?.name || ""), [msg, setMsg] = useState("");
  const findCity = async () => {
    if (!city.trim()) return set((c) => { c.weather = null; });
    setMsg("Buscando…");
    try {
      const g = await geocode(city.trim());
      if (!g) return setMsg("No encuentro esa ciudad");
      set((c) => { c.weather = g; }); setCity(g.name); setMsg("");
    } catch { setMsg("No se pudo buscar la ciudad"); }
  };
  const bad = (v) => (v && !isHttp(v) ? { borderColor: "var(--neg)" } : null);
  return (
    <div className="adm-grid one">
      <div>
        <div className="cap">FinanceMaster</div>
        <label className="lbl" style={{ marginTop: 16 }}>URL del servidor</label>
        <input className="fld m" value={cfg.fm.url} placeholder="https://…" style={bad(cfg.fm.url)} onChange={(e) => set((c) => { c.fm.url = e.target.value.trim(); })} />
        <div className="hint">La sesión se inicia en la propia página de inicio; solo se guarda el token en cada navegador.</div>

        <div className="group">
          <div className="cap">Clima</div>
          <label className="lbl" style={{ marginTop: 16 }}>Ciudad</label>
          <div style={{ display: "flex", gap: 12 }}>
            <input className="fld" value={city} placeholder="p. ej. Madrid" onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findCity()} />
            <button className="sec" onClick={findCity}>Buscar</button>
          </div>
          <div className="hint">{msg || (cfg.weather ? `Usando ${cfg.weather.name} (${cfg.weather.lat.toFixed(2)}, ${cfg.weather.lon.toFixed(2)})` : "Sin ciudad: el módulo de clima queda vacío.")}</div>
        </div>

        <div className="group">
          <div className="cap">Red</div>
          <div className="two" style={{ marginTop: 16 }}>
            <div><label className="lbl">Host local</label><input className="fld m" value={cfg.hosts.local} onChange={(e) => set((c) => { c.hosts.local = e.target.value.trim(); })} /></div>
            <div><label className="lbl">Host alternativo</label><input className="fld m" value={cfg.hosts.alt} placeholder="Vacío = desactivado" onChange={(e) => set((c) => { c.hosts.alt = e.target.value.trim(); })} /></div>
          </div>
          <label className="lbl" style={{ marginTop: 14 }}>URL de comprobación</label>
          <input className="fld m" value={cfg.hosts.probe} style={bad(cfg.hosts.probe)} onChange={(e) => set((c) => { c.hosts.probe = e.target.value.trim(); })} />
          <div className="hint">Si la URL de comprobación no responde, los enlaces sustituyen el host local por el alternativo (mismo puerto).</div>
        </div>

        <Integrations cfg={cfg} set={set} />
      </div>
    </div>
  );
}

function Backup({ cfg, setCfg }) {
  const [msg, setMsg] = useState("");
  const exportIt = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" }));
    a.download = "homepage-config.json"; a.click(); URL.revokeObjectURL(a.href);
  };
  const importIt = async (file) => {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!j || !Array.isArray(j.links)) throw 0;
      setCfg({ ...cfg, ...j, appearance: { ...cfg.appearance, ...j.appearance, bgVersion: cfg.appearance.bgVersion } }); setMsg("Importado. Se guarda automáticamente.");
    } catch { setMsg("Archivo no válido"); }
  };
  const restoreAll = async (file) => {
    if (!file) return;
    if (!confirm("Esto sustituye toda la configuración, las claves y el fondo actuales por los de la copia. ¿Continuar?")) return;
    try {
      const r = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Error " + r.status);
      setMsg("Copia restaurada. Recargando…"); setTimeout(() => location.reload(), 700);
    } catch (e) { setMsg(e.message || "No se pudo restaurar"); }
  };
  return (
    <div className="adm-grid one">
      <div>
        <div className="cap" style={{ paddingBottom: 10 }}>Copia completa</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a className="pri" href="/api/backup" download style={{ textDecoration: "none" }}>Descargar copia completa</a>
          <label className="sec" style={{ cursor: "pointer" }}>Restaurar copia completa
            <input type="file" accept="application/json,.json" hidden onChange={(e) => { restoreAll(e.target.files[0]); e.target.value = ""; }} />
          </label>
        </div>
        <div className="hint">Incluye toda la configuración, las claves (tokens, contraseñas, clave de Immich…) y el fondo. Al restaurarla en otro servidor todo queda como aquí. El archivo contiene secretos: guárdalo como una contraseña.</div>
        <div className="cap" style={{ padding: "26px 0 10px" }}>Solo configuración</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="sec" onClick={exportIt}>Exportar JSON</button>
          <label className="sec" style={{ cursor: "pointer" }}>Importar JSON
            <input type="file" accept="application/json,.json" hidden onChange={(e) => { importIt(e.target.files[0]); e.target.value = ""; }} />
          </label>
        </div>
        <div className="hint">{msg || "La configuración vive en /data/config.json dentro del contenedor (volumen). El fondo subido queda en el mismo volumen."}</div>
      </div>
    </div>
  );
}
