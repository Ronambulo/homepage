"use client";

import { MODULES } from "@/lib/defaults";

const num1 = (n) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
const gb = (b) => (b >= 1e12 ? num1(b / 1e12) + " TB" : num1(b / 1073741824) + " GB");
const hm = (ms) => { const m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? h + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min"; };
const hhmm = (d) => new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const dayKey = (d) => { d = new Date(d); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); };
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? "hace " + Math.max(1, m) + " min" : m < 1440 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " d"; };

const rate = (b) => (b >= 1e6 ? num1(b / 1e6) + " MB/s" : num1(b / 1e3) + " KB/s");
const fmtVal = (k, v) => (typeof v === "number" && v > 1e7 && /total|used|free|avail|size|bytes|cache|buffer/i.test(k) ? gb(v) + " · " + v : String(v));

const ICONS = {
  cpu: "M7 7h10v10H7z M10 10h4v4h-4z M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4",
  ram: "M3 8h18v8H3z M7 11v2 M11 11v2 M15 11v2 M6 16v2 M10 16v2 M14 16v2 M18 16v2",
  disk: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 14h16 M16.5 16.5h.01",
  temp: "M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z",
};

function Ring({ icon, v, p }) {
  const C = 2 * Math.PI * 28, pp = Math.max(0, Math.min(100, p || 0));
  return (
    <div className="ring">
      <div>
        <svg viewBox="0 0 68 68" width="100%" height="100%" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="34" cy="34" r="28" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
          <circle cx="34" cy="34" r="28" fill="none" stroke={pp >= 90 ? "#f0c987" : "var(--accent)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={(C * pp / 100).toFixed(1) + " " + C.toFixed(1)} />
        </svg>
        <svg className="ri" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[icon]} /></svg>
      </div>
      <span>{v}</span>
    </div>
  );
}

// Tarjeta común: cabecera + contenido; si falla o falta configurar, enlaza al panel.
function Shell({ id, d, right, cls, children, panel, alert }) {
  const ok = d?.ok;
  return (
    <div className="mw">
      {ok ? (
        <div className={"gc mod xc wc " + (cls || "")}>
          <div className="wxtop"><span className="label">{MODULES[id].label}{alert && <i className="adot" title={alert} />}</span>{right && <span className="mono wxhl">{right}</span>}</div>
          {children}
        </div>
      ) : (
        <a className="gc mod xc wc" href="/admin#conexiones">
          <div className="wxtop"><span className="label">{MODULES[id].label}</span></div>
          <div><div className="big num">—</div><div className="sub mono">{!d ? "" : d.error === "sin configurar" ? "Sin configurar" : d.error}</div></div>
        </a>
      )}
      {ok && panel && <div className="xdet"><div className="xin"><div className="xpad">{panel}</div></div></div>}
    </div>
  );
}

export function ServerCard({ d, alert }) {
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  const up = d?.uptime ? (d.uptime >= 86400 ? "encendido " + Math.floor(d.uptime / 86400) + " d" : "encendido " + Math.floor(d.uptime / 3600) + " h") : d?.watts != null ? num1(d.watts) + " W" : "";
  return (
    <Shell id="srv" d={d} alert={alert} right={up}
      panel={d?.ok && (
        <>
        <div className="xsec">
          <div className="xhd"><span className="label">Servidor</span><span className="mono wxhl">{[d.cpuModel, d.cores && d.cores + " núcleos"].filter(Boolean).join(" · ")}</span></div>
          <div className="xln"><span className="xn">CPU{d.load != null && <small className="mono">carga {num1(d.load)}</small>}</span><b className="mono">{d.cpu ?? "—"} %</b></div>
          <div className="xln"><span className="xn">Memoria<small className="mono">{gb(d.ramUsed)} de {gb(d.ramTotal)}</small></span><b className="mono">{Math.round(pct(d.ramUsed, d.ramTotal))} %</b></div>
          {d.disk && <div className="xln"><span className="xn">Disco<small className="mono">{gb(d.disk.used)} de {gb(d.disk.total)}</small></span><b className="mono">{Math.round(pct(d.disk.used, d.disk.total))} %</b></div>}
          {d.temp != null && <div className="xln"><span className="xn">Temperatura</span><b className="mono">{Math.round(d.temp)} °C</b></div>}
          {d.watts != null && <div className="xln"><span className="xn">Consumo CPU</span><b className="mono">{num1(d.watts)} W</b></div>}
        </div>
        {d.net?.rx != null && (
          <div className="xsec">
            <div className="xln"><span className="xn">Red<small className="mono">{d.net.name}</small></span><b className="mono">↓ {rate(d.net.rx)} · ↑ {rate(d.net.tx)}</b></div>
          </div>
        )}
        </>
      )}>
      {d?.ok && (
        <div className="rings">
          <Ring icon="cpu" v={d.cpu == null ? "—" : d.cpu + " %"} p={d.cpu} />
          <Ring icon="ram" v={gb(d.ramUsed)} p={pct(d.ramUsed, d.ramTotal)} />
          {d.disk && <Ring icon="disk" v={Math.round(d.disk.used / 1073741824) + " GB"} p={pct(d.disk.used, d.disk.total)} />}
          {d.temp != null && <Ring icon="temp" v={Math.round(d.temp) + " °C"} p={d.temp} />}
        </div>
      )}
    </Shell>
  );
}

export function CalendarCard({ d, now }) {
  const ev = (d?.events || []).map((e) => ({ ...e, s: new Date(e.start), e: new Date(e.end) }));
  const t = now || new Date();
  const upcoming = ev.filter((e) => e.e > t && !(e.allDay && dayKey(e.s) > dayKey(t) ));
  const next = upcoming.find((e) => !e.allDay) || upcoming[0];
  const week = Array.from({ length: 7 }, (_, i) => { const x = new Date(t); x.setDate(t.getDate() + i); return x; });
  const has = (x) => ev.some((e) => dayKey(e.s) <= dayKey(x) && (dayKey(e.s) === dayKey(x) || (e.allDay && e.e > x && dayKey(new Date(+e.e - 1)) >= dayKey(x))));
  const when = (e) => (e.allDay ? "todo el día" : hhmm(e.s) + " – " + hhmm(e.e));
  const rel = (e) => (e.allDay ? (dayKey(e.s) <= dayKey(t) ? "HOY" : "") : e.s <= t ? "AHORA" : "en " + hm(e.s - t));
  const dl = (e) => { const k = dayKey(e.s) - dayKey(t); return k <= 0 ? "hoy" : k === 1 ? "mañana" : e.s.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }).replace(".", ""); };
  const list = ev.filter((e) => e.e > t && dayKey(e.s) - dayKey(t) <= 1).slice(0, 6);
  return (
    <Shell id="cal" d={d} right={t.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }).replace(".", "")}
      panel={d?.ok && (
        <div className="xsec">
          <div className="xhd"><span className="label">Hoy y mañana</span></div>
          {list.map((e, i) => (
            <div key={i} className="xln"><span className="xn">{e.title}<small className="mono">{dl(e)} · {when(e)}</small></span><b className="mono">{rel(e).toLowerCase()}</b></div>
          ))}
          {!list.length && <div className="note">Nada pendiente.</div>}
        </div>
      )}>
      {d?.ok && (
        <>
          <div className="calnext">
            {next ? (
              <>
                <span className="mono wxhl">SIGUIENTE{rel(next) ? " · " + rel(next) : ""}</span>
                <div className="caltitle">{next.title}</div>
                <span className="mono wxhl">{dayKey(next.s) - dayKey(t) > 0 ? dl(next) + " · " : ""}{when(next)}</span>
              </>
            ) : <div className="caltitle dimt">Sin eventos próximos</div>}
          </div>
          <div className="calweek">
            {week.map((x, i) => (
              <div key={i} className={i === 0 ? "today" : ""}><span className="mono">{"DLMXJVS"[x.getDay()]}</span><b>{x.getDate()}</b><i className={has(x) ? "on" : ""} /></div>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}

export function GitHubCard({ d, alert }) {
  const max = d?.counts ? Math.max(1, ...d.counts) : 1;
  return (
    <Shell id="gh" d={d} alert={alert} right="últimos 30 días"
      panel={d?.ok && (
        <>
          <div className="xsec">
            <div className="xhd"><span className="label">Pull requests</span><span className="mono wxhl">{d.prs.count} abiertas</span></div>
            {d.prs.items.map((p) => <div key={p.repo + p.n} className="xln"><span className="xn">{p.title}<small className="mono">{p.repo} · #{p.n}</small></span></div>)}
            {!d.prs.items.length && <div className="note">Ninguna abierta.</div>}
          </div>
          <div className="xsec">
            <div className="xhd"><span className="label">Issues asignadas</span><span className="mono wxhl">{d.issues.count}</span></div>
            {d.issues.items.map((p) => <div key={p.repo + p.n} className="xln"><span className="xn">{p.title}<small className="mono">{p.repo} · #{p.n}</small></span></div>)}
            {!d.issues.items.length && <div className="note">Ninguna.</div>}
          </div>
          <div className="xsec">
            <div className="xhd"><span className="label">CI</span><span className={"mono wxhl " + (d.failing.length ? "neg" : "")}>{d.failing.length ? "fallando" : "todo en verde"}</span></div>
            {d.failing.map((r) => <div key={r} className="xln"><span className="xn">{r}</span><b className="mono neg">falla</b></div>)}
            {d.last && <div className="note mono pf">último commit · {d.last.repo} · {ago(d.last.at)}</div>}
          </div>
        </>
      )}>
      {d?.ok && (
        <>
          <div className="ghrow">
            <span className="big num">{d.total}</span>
            <span className="mono wxhl">contribuciones<br />racha de {d.streak} {d.streak === 1 ? "día" : "días"}</span>
          </div>
          <div className="ghbars">{d.counts.map((c, i) => <i key={i} style={{ height: (c ? 12 + (c / max) * 88 : 6) + "%" }} className={c ? "on" : ""} />)}</div>
          <div className="mono wxhl">{d.prs.count} PRs abiertas · {d.issues.count} {d.issues.count === 1 ? "issue asignada" : "issues asignadas"}{d.failing.length ? <> · <span className="neg">CI fallando en {d.failing.length}</span></> : ""}</div>
        </>
      )}
    </Shell>
  );
}

export function DiscoCard({ d, alert }) {
  const S = d?.servers || [], run = S.filter((s) => s.running), players = run.reduce((t, s) => t + s.players, 0);
  const mem = (m) => (m >= 1024 ? num1(m / 1024) + " GB" : m + " MB");
  const line = (s) => (s.running ? `${s.players}/${s.max} · ${s.mem ? mem(s.mem) : ""}`.replace(/ · $/, "") : s.starting ? "iniciando" : "detenido");
  const order = [...S].sort((a, b) => b.running - a.running);
  return (
    <Shell id="dp" d={d} alert={alert} right={S.length ? run.length + " de " + S.length + " en marcha" : ""}
      panel={d?.ok && (
        <div className="xsec">
          <div className="xhd"><span className="label">Servidores</span><span className="mono wxhl">{players} {players === 1 ? "jugador" : "jugadores"}</span></div>
          {order.map((s) => (
            <div key={s.name} className="xln"><i className={"sdot " + (s.running ? "on" : "")} /><span className="xn">{s.name}<small className="mono">{s.version}</small></span><b className={"mono " + (s.running ? "" : "dimt")}>{line(s)}</b></div>
          ))}
          {!S.length && <div className="note">Sin servidores.</div>}
        </div>
      )}>
      {d?.ok && (
        <>
          <div className="dpbig"><span className="big num">{players}</span><span className="mono wxhl">{players === 1 ? "jugador conectado" : "jugadores conectados"}</span></div>
          <div className="dplist">
            {order.slice(0, 3).map((s) => (
              <div key={s.name}><i className={"sdot " + (s.running ? "on" : "")} /><span>{s.name}</span><b className={"mono " + (s.running ? "" : "dimt")}>{line(s)}</b></div>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}

const ROOMBA = { cleaning: "aspirando", docked: "en la base", returning: "volviendo", paused: "en pausa", idle: "parado", error: "error", charging: "cargando" };

export function HomeCard({ d, alert }) {
  const rb = d?.roomba, bl = d?.boiler;
  return (
    <Shell id="ha" d={d} alert={alert} right={d?.tempName || ""}
      panel={d?.ok && (
        <div className="xsec">
          <div className="xhd"><span className="label">Casa</span><span className="mono wxhl">Home Assistant</span></div>
          {d.temp != null && <div className="xln"><span className="xn">Temperatura de la zona</span><b className="mono">{num1(d.temp)} {d.tempUnit}</b></div>}
          {bl && <div className="xln"><span className="xn">{bl.name}<small className="mono">desde las {hhmm(bl.since)}</small></span><b className={"mono " + (bl.on ? "warnt" : "dimt")}>{bl.on ? "encendida" : "apagada"}</b></div>}
          {rb && <div className="xln"><span className="xn">{rb.name}<small className="mono">{rb.battery != null ? "batería " + rb.battery + " %" : ""}</small></span><b className="mono">{ROOMBA[rb.state] || rb.state}</b></div>}
        </div>
      )}>
      {d?.ok && (
        <>
          <div className="dpbig"><span className="big num">{d.temp != null ? num1(d.temp) : "—"}<small>{d.temp != null ? d.tempUnit : ""}</small></span><span className="mono wxhl">{d.temp != null ? "temperatura" : d.tempState === "unavailable" ? "sensor no disponible en HA" : "sin temperatura"}</span></div>
          <div className="hagrid">
            {rb && <div><span className="mono">ASPIRADORA</span><b>{ROOMBA[rb.state] || rb.state}</b><small className="mono">{rb.battery != null ? rb.battery + " %" : ""}</small></div>}
            {bl && <div><span className="mono">CALDERA</span><b className={bl.on ? "warnt" : ""}>{bl.on ? "encendida" : "apagada"}</b></div>}
          </div>
        </>
      )}
    </Shell>
  );
}

export function ImmichCard({ d, alert }) {
  const n = (v) => v.toLocaleString("es-ES");
  return (
    <Shell id="im" d={d} alert={alert} right={d?.last ? "última " + ago(d.last) : ""}
      panel={d?.ok && (
        <div className="xsec">
          <div className="xhd"><span className="label">Biblioteca</span><span className="mono wxhl">Immich</span></div>
          <div className="xln"><span className="xn">Subidas hoy<small className="mono">{d.todayVideos ? d.todayVideos + " vídeos" : ""}</small></span><b className="mono">{n(d.today)}{d.capped ? "+" : ""}</b></div>
          {d.photos != null && <div className="xln"><span className="xn">Fotos</span><b className="mono">{n(d.photos)}</b></div>}
          {d.videos != null && <div className="xln"><span className="xn">Vídeos</span><b className="mono">{n(d.videos)}</b></div>}
          {d.usage != null && <div className="xln"><span className="xn">Espacio usado</span><b className="mono">{gb(d.usage)}</b></div>}
          {d.last && <div className="xln"><span className="xn">Última subida</span><b className="mono">{ago(d.last)}</b></div>}
        </div>
      )}>
      {d?.ok && (
        <div className="dpbig"><span className="big num">{n(d.today)}{d.capped ? "+" : ""}</span><span className="mono wxhl">{d.today === 1 ? "subida hoy" : "subidas hoy"}</span></div>
      )}
      {d?.ok && d.photos != null && <div className="sub mono">{n(d.photos)} fotos · {n(d.videos ?? 0)} vídeos</div>}
    </Shell>
  );
}
