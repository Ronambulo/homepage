"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MODULES, SEARCH_ENGINES, themeStyle } from "@/lib/defaults";
import Icon from "./Icon";
import { ServerCard, CalendarCard, GitHubCard, DiscoCard, HomeCard, ImmichCard } from "./Widgets";
import { ls, timeout, eur, signed, resolveUrl, probeHost, probeLinkTimed } from "@/lib/util";

const WX = [[0, "Despejado"], [2, "Poco nuboso"], [3, "Nublado"], [48, "Niebla"], [57, "Llovizna"], [67, "Lluvia"], [77, "Nieve"], [82, "Chubascos"], [86, "Nieve"], [99, "Tormenta"]];
const wxText = (c) => (WX.find(([max]) => c <= max) || [0, "—"])[1];

function WxIcon({ c, size = 24 }) {
  const cloud = "M8 19h9a3.5 3.5 0 0 0 .4-6.98A4.7 4.7 0 0 0 8.6 13.3 2.9 2.9 0 0 0 8 19z";
  const sun = <><circle cx="12" cy="12" r="3.6" /><path d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6M6 6l1.1 1.1M16.9 16.9L18 18M6 18l1.1-1.1M16.9 7.1L18 6" /></>;
  let body;
  if (c <= 1) body = sun;
  else if (c === 2) body = <><circle cx="8.5" cy="8.5" r="2.7" /><path d="M8.5 3v1.2M3 8.5h1.2M4.6 4.6l.9.9M12.4 4.6l-.9.9" /><path d="M9 20h8.5a3.3 3.3 0 0 0 .4-6.6A4.4 4.4 0 0 0 9.7 14.6 2.7 2.7 0 0 0 9 20z" /></>;
  else if (c === 3) body = <path d={cloud} />;
  else if (c <= 48) body = <><path d="M8 12h9a3.2 3.2 0 0 0 .3-6.4A4.3 4.3 0 0 0 9 6.8 2.7 2.7 0 0 0 8 12z" /><path d="M5 16h14M8 20h9" /></>;
  else if (c <= 82) body = <><path d="M8 14h9a3.2 3.2 0 0 0 .3-6.4A4.3 4.3 0 0 0 9 8.8 2.7 2.7 0 0 0 8 14z" /><path d="M9 17.5l-1 2.5M13 17.5l-1 2.5M17 17.5l-1 2.5" /></>;
  else if (c <= 86) body = <><path d="M8 13h9a3.2 3.2 0 0 0 .3-6.4A4.3 4.3 0 0 0 9 7.8 2.7 2.7 0 0 0 8 13z" /><path d="M9 17h.01M13 19h.01M17 17h.01M11 21h.01M15 21h.01" /></>;
  else body = <><path d="M8 13h9a3.2 3.2 0 0 0 .3-6.4A4.3 4.3 0 0 0 9 7.8 2.7 2.7 0 0 0 8 13z" /><path d="M12.5 14l-2 3.5h3l-2 3.5" /></>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{body}</svg>;
}

function Area({ data }) {
  const pts = (data || []).filter((n) => Number.isFinite(n));
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 100, 34 - ((v - min) / span) * 28]);
  const line = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2)).join(" ");
  return (
    <svg className="area" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="fmg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".35" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      <path d={line + " L100 40 L0 40 Z"} fill="url(#fmg)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function UpStrip({ cells, small }) {
  const n = cells.length || 30;
  return (
    <div className={"upstrip" + (small ? " sm" : "")} aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const c = cells[i], r = c && c[1] ? c[0] / c[1] : null;
        return <i key={i} className={r == null ? "" : r >= 0.995 ? "ok" : r >= 0.9 ? "warn" : "bad"} title={r == null ? "sin datos" : Math.round(r * 100) + " %"} />;
      })}
    </div>
  );
}

function Curve({ data }) {
  const pts = (data || []).filter((n) => Number.isFinite(n));
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const d = pts.map((v, i) => (i ? "L" : "M") + ((i / (pts.length - 1)) * 100).toFixed(2) + " " + (28 - ((v - min) / span) * 24).toFixed(2)).join(" ");
  return <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden><path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity=".9" /></svg>;
}

// Inicio del ciclo de nómina actual (misma heurística que FinanceMaster).
function cycleStart(typeItems, catItems) {
  const days = (a, b) => (new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 864e5;
  const amt = new Map(), cat = new Map();
  for (const t of typeItems) amt.set(t.date, Math.max(amt.get(t.date) ?? 0, Math.abs(t.amount)));
  for (const t of catItems) { amt.set(t.date, Math.max(amt.get(t.date) ?? 0, Math.abs(t.amount))); cat.set(t.date, true); }
  const dates = [...amt.keys()].sort(), groups = [];
  for (const d of dates) {
    const l = groups[groups.length - 1];
    if (l && days(d, l) <= 4) {
      const lc = cat.get(l) ?? false, dc = cat.get(d) ?? false;
      if (dc !== lc ? dc : (amt.get(d) ?? 0) > (amt.get(l) ?? 0)) groups[groups.length - 1] = d;
    } else groups.push(d);
  }
  const A = groups.filter((d) => cat.get(d)), B = groups.filter((d) => !cat.get(d));
  if (!A.length) {
    const out = [];
    for (const d of groups) {
      if (!out.length) { out.push(d); continue; }
      const l = out[out.length - 1];
      if (days(d, l) >= 20) out.push(d); else if ((amt.get(d) ?? 0) > (amt.get(l) ?? 0)) out[out.length - 1] = d;
    }
    return out.sort().pop() || null;
  }
  let gap = 20;
  if (A.length >= 2) {
    const g = []; for (let i = 1; i < A.length; i++) g.push(days(A[i], A[i - 1]));
    g.sort((x, y) => x - y); gap = Math.max(14, g[Math.floor(g.length / 2)] - 8);
  }
  const all = [...A];
  for (const d of B) if (Math.min(...all.map((z) => Math.abs(days(d, z)))) >= gap) all.push(d);
  return all.sort().pop() || null;
}

const fmtDur = (ms) => { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? h + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min"; };

export default function Home({ config }) {
  const { links, hosts, modules, appearance, fm: fmCfg, weather, name } = config;
  const { tint, accent } = themeStyle(appearance.theme, appearance.intensity);

  const [now, setNow] = useState(null);
  const [useAlt, setUseAlt] = useState(false);
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState(null); // "login" | "todo" | null
  const [status, setStatus] = useState(null); // [{name, up}]
  const [fm, setFm] = useState({ state: "idle", data: null });
  const [wx, setWx] = useState(null);
  const [todos, setTodos] = useState([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(-1);
  const [checkedAt, setCheckedAt] = useState(null);
  const [checking, setChecking] = useState(false);
  const [uptime, setUptime] = useState(null);
  const [wd, setWd] = useState({});
  const qRef = useRef(null);
  const [focus, setFocus] = useState(false); // modo enfoque: solo reloj y búsqueda
  useEffect(() => { setFocus(ls.get("focus", false) === true); }, []);
  const toggleFocus = useCallback(() => setFocus((v) => { ls.set("focus", !v); return !v; }), []);

  const enabled = modules.filter((m) => m.enabled).map((m) => m.id);
  const has = (id) => enabled.includes(id);
  const pages = Math.max(1, Math.ceil(enabled.length / 4)), pg = Math.min(page, pages - 1);
  const goPage = (p) => setPage(((p % pages) + pages) % pages);
  const [paused, setPaused] = useState(false); // botón de pausa: detiene el avance automático y el scroll
  const paused_ = useRef(false);
  useEffect(() => { const v = ls.get("pg_paused", false) === true; paused_.current = v; setPaused(v); }, []);
  const togglePause = () => { const v = !paused_.current; paused_.current = v; setPaused(v); ls.set("pg_paused", v); };
  const hold = useRef(false); // pausa el avance automático mientras el ratón está sobre los widgets
  useEffect(() => {
    if (pages < 2) return;
    const step = (d) => setPage((p) => (((Math.min(p, pages - 1) + d) % pages) + pages) % pages);
    const auto = setInterval(() => { if (!hold.current && !paused_.current && !document.hidden) step(1); }, 20000);
    let last = 0;
    const wheel = (e) => {
      if (e.target.closest?.(".xdet, .sheet, dialog, input, textarea")) return;
      if (window.innerWidth <= 900 || paused_.current) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(d) < 8 || Date.now() - last < 550) return;
      last = Date.now(); step(d > 0 ? 1 : -1);
    };
    const key = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("keydown", key);
    return () => { clearInterval(auto); window.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key); };
  }, [pages]);
  const holdOn = { onMouseEnter: () => { hold.current = true; }, onMouseLeave: () => { hold.current = false; }, onFocus: () => { hold.current = true; }, onBlur: () => { hold.current = false; } };
  const url = useCallback((u) => resolveUrl(u, hosts, useAlt), [hosts, useAlt]);
  const linksRef = useRef(links), urlRef = useRef(url);
  linksRef.current = links; urlRef.current = url;
  const matches = q.trim() ? links.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  /* reloj */
  useEffect(() => {
    const t = () => setNow(new Date());
    t(); const i = setInterval(t, 10000); return () => clearInterval(i);
  }, []);

  /* atajos */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); qRef.current?.focus(); }
      if (e.key === "Escape") setSheet(null);
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); toggleFocus(); }
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) {
        const l = linksRef.current[+e.key - 1]; if (l) location.href = urlRef.current(l.url);
      }
    };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* host alternativo */
  useEffect(() => { let ok = true; probeHost(hosts).then((v) => ok && setUseAlt(v)); return () => { ok = false; }; }, [hosts]);

  /* servicios */
  const services = config.services || links;
  const linksKey = JSON.stringify(services);

  /* alertas: servicios caídos > X min, temperaturas/disco pasados de umbral, CI rojo, integraciones que no responden */
  const al = config.alerts || { downMin: 10, temp: 75, driveTemp: 55, disk: 90 };
  const alerts = [];
  if (has("svc")) {
    for (const s of services) {
      const since = uptime?.incidents?.[s.id]?.since;
      if (since && now && now - since >= al.downMin * 60000) alerts.push({ mod: "svc", text: s.name + " caído desde hace " + fmtDur(now - since) });
    }
  }
  const S_ = wd.srv;
  if (has("srv") && S_?.ok) {
    if (S_.temp != null && S_.temp >= al.temp) alerts.push({ mod: "srv", text: "CPU a " + Math.round(S_.temp) + " °C" });
    for (const dr of S_.drives || []) if (dr.temp != null && dr.temp >= al.driveTemp) alerts.push({ mod: "srv", text: (dr.model || "Disco") + " a " + Math.round(dr.temp) + " °C" });
    if (S_.disk?.total && (S_.disk.used / S_.disk.total) * 100 >= al.disk) alerts.push({ mod: "srv", text: "Disco al " + Math.round((S_.disk.used / S_.disk.total) * 100) + " %" });
  }
  if (has("gh") && wd.gh?.ok && wd.gh.failing?.length) alerts.push({ mod: "gh", text: "CI fallando en " + wd.gh.failing.join(", ") });
  for (const k of ["srv", "cal", "gh", "dp", "ha", "im"]) {
    const w = wd[k]; if (has(k) && w && !w.ok && !w.auth && w.error && w.error !== "sin configurar") alerts.push({ mod: k, text: MODULES[k].label + ": " + w.error });
  }
  const alertBy = {};
  for (const a of alerts) alertBy[a.mod] = alertBy[a.mod] ? alertBy[a.mod] + " · " + a.text : a.text;
  const refreshServices = useCallback(async () => {
    setChecking(true);
    const res = await Promise.all(services.map(async (l) => ({ id: l.id, name: l.name, href: url(l.url), ...(await probeLinkTimed(url(l.url))) })));
    setStatus(res); setCheckedAt(new Date()); setChecking(false);
    fetch("/api/uptime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ results: res.map((r) => ({ id: r.id, up: r.up })) }) })
      .then((r) => (r.ok ? r.json() : null)).then((u) => u && setUptime(u)).catch(() => {});
  }, [linksKey, url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (has("svc")) refreshServices(); }, [refreshServices, has("svc")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* FinanceMaster */
  const fmBase = (fmCfg.url || "").replace(/\/+$/, "");
  const loadFM = useCallback(async () => {
    const token = ls.get("fm_token", "");
    if (!fmBase || !token || ls.get("fm_token_url", "") !== fmBase) { setFm({ state: "login", data: null }); return; }
    const cached = ls.get("fm_cache", null);
    if (cached) setFm({ state: "ok", data: cached });
    const api = async (p, ms = 8000) => {
      const r = await fetch(fmBase + "/api" + p, { headers: { Authorization: "Bearer " + token }, signal: timeout(ms) });
      if (r.status === 401) throw Object.assign(new Error("auth"), { auth: true });
      if (!r.ok) throw new Error(r.status);
      return r.json();
    };
    try {
      const n = new Date(), p2 = (v) => String(v).padStart(2, "0");
      let from = `${n.getFullYear()}-${p2(n.getMonth() + 1)}-01`;
      let cyc = null;
      try {
        const [cl, tp] = await Promise.all([api("/categories"), api("/transactions?type=CUSTOMER_INPAYMENT&account_category=CASH&page_size=100")]);
        const pc = (cl || []).find((c) => /n[oó]mina|salario|sueldo/i.test(c.name));
        const ct = pc ? await api(`/transactions?category_id=${pc.id}&page_size=100`) : null;
        const st = cycleStart(tp?.items || [], ct?.items || []);
        if (st) { from = st; cyc = { start: st }; }
      } catch (e) { if (e.auth) throw e; }
      if (cyc) {
        const sum = await api(`/transactions?date_from=${from}&page_size=1`).catch(() => null);
        if (sum) { cyc.income = Math.abs(sum.income_sum || 0); cyc.expenses = Math.abs(sum.expense_sum || 0); cyc.savings = cyc.income - cyc.expenses; } else cyc = null;
      }
      const [ov, nw, inv, up, tx] = await Promise.all([
        api("/dashboard/overview"),
        api("/dashboard/net-worth-history?months=24", 30000).catch(() => cached?.nw || []), // consulta lenta (precios de mercado): más tiempo y, si falla, el último dato bueno
        api("/portfolio/live").catch(() => api("/portfolio/performance")).catch(() => null),
        api("/dashboard/upcoming?days=30").catch(() => []),
        api("/transactions?page=1&page_size=5").catch(() => null),
      ]);
      const data = { ov, nw, inv, up, tx: tx?.items || [], cyc }; ls.set("fm_cache", data); setFm({ state: "ok", data });
    } catch (e) {
      if (e.auth) { ls.del("fm_token"); ls.del("fm_cache"); setFm({ state: "login", data: null }); }
      else if (!cached) setFm({ state: "offline", data: null });
    }
  }, [fmBase]);
  useEffect(() => { if (has("fm")) loadFM(); }, [loadFM, has("fm")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* clima */
  const wxKey = weather ? `${weather.lat},${weather.lon}` : "";
  const loadWx = useCallback(async () => {
    if (!weather) { setWx(null); return; }
    const c = ls.get("wx_cache", null);
    if (c && c.key === wxKey && c.days) setWx(c); else setWx(null);
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${weather.lat}&longitude=${weather.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=4&timezone=auto`, { signal: timeout(6000) });
      const j = await r.json();
      const h0 = Math.max(0, j.hourly.time.indexOf(j.current.time.slice(0, 13) + ":00"));
      const hT = j.hourly.temperature_2m, hC = j.hourly.weather_code, hh = (i) => j.hourly.time[i]?.slice(11, 13) + "h";
      const D = j.daily, dn = (s) => new Date(s + "T12:00").toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
      const v = {
        key: wxKey, t: Math.round(j.current.temperature_2m), c: j.current.weather_code, city: weather.name,
        feels: Math.round(j.current.apparent_temperature), wind: Math.round(j.current.wind_speed_10m), hum: j.current.relative_humidity_2m,
        rain: D.precipitation_probability_max[0],
        hi: Math.round(D.temperature_2m_max[0]), lo: Math.round(D.temperature_2m_min[0]),
        curve: hT.slice(h0, h0 + 25).map((n) => Math.round(n)),
        hours: [1, 2, 3, 4, 5, 6].map((k) => ({ h: hh(h0 + k), t: Math.round(hT[h0 + k]), c: hC[h0 + k] })).filter((x) => Number.isFinite(x.t)),
        days: D.time.map((d, i) => ({ n: i === 0 ? "Hoy" : dn(d), c: D.weather_code[i], hi: Math.round(D.temperature_2m_max[i]), lo: Math.round(D.temperature_2m_min[i]) })),
      };
      ls.set("wx_cache", v); setWx(v);
    } catch {}
  }, [wxKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (has("wx")) loadWx(); }, [loadWx, has("wx")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* integraciones (srv, cal, gh, dp, ha) */
  const wdKey = ["srv", "cal", "gh", "dp", "ha", "im"].filter((k) => modules.some((m) => m.id === k && m.enabled)).join(",");
  useEffect(() => {
    if (!wdKey) return;
    let live = true;
    const load = () => wdKey.split(",").forEach((k) => fetch("/api/widgets/" + k, { cache: "no-store", signal: timeout(15000) }).then((r) => r.json()).then((v) => live && setWd((o) => ({ ...o, [k]: v }))).catch(() => {}));
    load(); const i = setInterval(load, 60000);
    return () => { live = false; clearInterval(i); };
  }, [wdKey]);

  /* tareas */
  useEffect(() => { setTodos(ls.get("todos", [])); }, []);
  const saveTodos = (v) => { setTodos(v); ls.set("todos", v); };

  /* refresco periódico */
  useEffect(() => {
    const i = setInterval(() => { has("fm") && loadFM(); has("wx") && loadWx(); has("svc") && refreshServices(); }, 5 * 60 * 1000);
    return () => clearInterval(i);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const search = (e) => {
    e.preventDefault();
    const v = q.trim(); if (!v) return;
    if (sel >= 0 && matches[sel]) { location.href = url(matches[sel].url); return; }
    const looksUrl = /^(https?:\/\/|localhost|\d{1,3}(\.\d{1,3}){3})/i.test(v) || /^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(v);
    location.href = looksUrl ? (/^https?:\/\//i.test(v) ? v : "http://" + v) : SEARCH_ENGINES[appearance.searchEngine] + encodeURIComponent(v);
  };

  const h = now?.getHours();
  const hello = h == null ? "" : h < 6 ? "Buenas noches" : h < 16 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";

  return (
    <>
      <div className="bgimg" style={{ backgroundImage: `url(/api/background?v=${appearance.bgVersion})`, "--accent": accent }} />
      <div className="tint" style={{ background: tint }} />
      <div className="veil" />
      <div className={"page" + (focus ? " focus" : "")} style={{ "--accent": accent, "--n": Math.min(4, Math.max(1, enabled.length - pg * 4)) }}>
        <div className="top">
          <span className="mono">{now ? now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : ""}</span>
          <div className="topr">
            {alerts.length > 0 && (
              <div className="alerts" tabIndex={0}>
                <span className="alertbtn" aria-label={alerts.length + " alertas"}><i className="adot" />{alerts.length}</span>
                <div className="alertpop" role="status">
                  {alerts.map((a, i) => <div key={i}>{a.text}</div>)}
                </div>
              </div>
            )}
            <a href="/admin" className="pill">Editar</a>
          </div>
        </div>

        <div className="hero">
          <div className="time num">{now ? now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
          <h1 className="hello">{hello}{name ? `, ${name}` : ""}</h1>
        </div>

        {appearance.showSearch && (
          <form className="search" onSubmit={search}>
            <svg className="sicon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
            <input ref={qRef} value={q} type="text" placeholder="Buscar o escribir una dirección" autoComplete="off" spellCheck={false}
              onChange={(e) => { setQ(e.target.value); setSel(-1); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setSel((s) => (s + 1) % matches.length); }
                else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setSel((s) => (s <= 0 ? matches.length - 1 : s - 1)); }
                else if (e.key === "Escape") { setQ(""); setSel(-1); e.target.blur(); }
              }} />
            <kbd className="mono">/</kbd>
            {matches.length > 0 && (
              <div className="sugg">
                {matches.map((l, i) => (
                  <a key={l.id} href={url(l.url)} className={i === sel ? "on" : ""} onMouseEnter={() => setSel(i)}><Icon link={l} size={18} />{l.name}<span className="mono">↵</span></a>
                ))}
                <div className="note">↓ para elegir · Enter abre · sin elegir, busca en la web</div>
              </div>
            )}
          </form>
        )}

        {links.length > 0 && (
          <nav className="apps" aria-label="Aplicaciones">
            {links.map((l, i) => {
              const st = status?.find((r) => r.id === l.id || r.href === url(l.url));
              let host = ""; try { host = new URL(url(l.url)).host; } catch {}
              return (
                <a key={l.id} href={url(l.url)} className="gc app">
                  <span className="appicon"><Icon link={l} size={22} /></span>
                  <span className="appname">{l.name}</span>
                  <span className="apphost mono">{host}</span>
                  {st && <i className={"appdot " + (st.up ? "up" : "down")} title={st.up ? "En línea" : "Sin respuesta"} />}
                  {i < 9 && <kbd className="mono">{i + 1}</kbd>}
                </a>
              );
            })}
          </nav>
        )}

        <div className="mods" data-page={pg} style={{ marginTop: "auto" }} {...(pages > 1 ? holdOn : {})}>
          {enabled.map((id) => {
            if (id === "fm") {
              const d = fm.data, approx = !!d && !d.nw.length, nw = d && (d.nw.length ? d.nw[d.nw.length - 1].net_worth : d.ov.balance + (d.inv?.total_market_value || 0)), s = d?.cyc ? d.cyc.savings : d?.ov.savings_month;
              const inc = d?.cyc ? d.cyc.income : d?.ov.income_month, exp = d?.cyc ? d.cyc.expenses : d?.ov.expenses_month;
              const ok = fm.state === "ok" && d;
              const hist = ok ? d.nw.map((p) => p.net_worth).filter(Number.isFinite) : [];
              const delta = hist.length > 1 ? hist[hist.length - 1] - hist[0] : null;
              const iv = ok ? d.inv : null;
              const pos = (iv?.positions || []).filter((p) => p.market_value > 0).sort((x, y) => y.market_value - x.market_value).slice(0, 5);
              const txs = ok ? (d.tx || []).slice(0, 2) : [];
              const pct = inc > 0 ? Math.round((s / inc) * 100) : null;
              const cycLbl = d?.cyc ? new Date(d.cyc.start + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "") : "";
              return (
                <div key={id} className="mw">
                  <a className="gc mod xc fmc" href={ok ? fmBase : "#"} onClick={ok ? undefined : (e) => { e.preventDefault(); if (fmBase) setSheet("login"); }}>
                    <div className="wxtop">
                      <span className="label">{MODULES.fm.label}</span>
                      {ok && <span className="mono wxhl">{d.cyc ? "ciclo desde " + cycLbl : "este mes"}</span>}
                    </div>
                    <div className="fmrow">
                      <div className="fmnum">
                        <div className="big num" title={approx ? "Cuenta + inversiones; no incluye deudas" : undefined}>{ok ? eur(nw) : "—"}</div>
                        {ok ? (
                          <span className={"chip mono " + (s >= 0 ? "pos" : "neg")}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{s >= 0 ? <path d="M2 7l3-4 3 4" /> : <path d="M2 3l3 4 3-4" />}</svg>
                            {signed(s) + (d.cyc ? " este ciclo" : " este mes")}
                          </span>
                        ) : (
                          <div className="sub mono">{fm.state === "offline" ? "sin conexión" : fm.state === "login" ? (fmBase ? "Conectar" : "Sin configurar") : ""}</div>
                        )}
                      </div>
                      {ok && <Area data={hist} />}
                    </div>
                  </a>
                  {ok && (
                    <div className="xdet" aria-hidden><div className="xin"><div className="xpad">
                      <div className="xsec">
                        <div className="xhd"><span className="label">{d.cyc ? "Nómina · desde el " + cycLbl : "Este mes"}</span>{pct != null && s >= 0 && <span className="mono wxhl">{pct} % ahorrado</span>}</div>
                        <div className="xbar"><i style={{ flexGrow: Math.max(exp, 1), background: "rgba(242,242,240,.4)" }} />{s > 0 && <i style={{ flexGrow: s, background: "var(--accent)" }} />}</div>
                        <div className="xkpi">
                          <div><span className="mono">GASTADO</span><b>{eur(exp)}</b></div>
                          <div style={{ textAlign: "right" }}><span className="mono">INGRESADO</span><b>{eur(inc)}</b></div>
                        </div>
                      </div>
                      {pos.length > 0 && (
                        <div className="xsec">
                          <div className="xhd"><span className="label">Inversiones</span><span className="mono wxhl">{eur(iv.total_market_value)}</span></div>
                          {pos.map((p) => (
                            <div key={p.symbol} className="xln xpos">
                              <span className="xn">{p.name || p.symbol}<small className="mono">{p.shares.toLocaleString("es-ES", { maximumFractionDigits: 4 })} acc.{p.current_price != null ? " · " + eur(p.current_price) + " / acc." : ""}</small></span>
                              <span className="xv">
                                <b className="mono">{eur(p.market_value)}</b>
                                {p.unrealized_pnl != null && <small className={"mono " + (p.unrealized_pnl >= 0 ? "pos" : "neg")}>{(p.unrealized_pnl >= 0 ? "▲ " : "▼ ") + signed(p.unrealized_pnl)}</small>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const last = d.nw.length ? d.nw[d.nw.length - 1] : null;
                        const cash = last ? last.cash : d.ov.balance, inv = last ? last.portfolio : d.inv?.total_market_value || 0;
                        if (!(cash > 0) && !(inv > 0)) return null;
                        const tot = Math.max(cash, 0) + Math.max(inv, 0), pc = (v) => Math.round((Math.max(v, 0) / tot) * 100) + " %";
                        return (
                          <div className="xsec">
                            <div className="xhd"><span className="label">Cuenta y acciones</span>{last?.debt > 0 && <span className="mono wxhl">deudas −{eur(last.debt)}</span>}</div>
                            <div className="xbar"><i style={{ flexGrow: Math.max(cash, 0.001), background: "rgba(242,242,240,.4)" }} /><i style={{ flexGrow: Math.max(inv, 0.001), background: "var(--accent)" }} /></div>
                            <div className="xkpi">
                              <div><span className="mono">CUENTA · {pc(cash)}</span><b>{eur(cash)}</b></div>
                              <div style={{ textAlign: "right" }}><span className="mono">ACCIONES · {pc(inv)}</span><b>{eur(inv)}</b></div>
                            </div>
                          </div>
                        );
                      })()}
                      {txs.length > 0 && (
                        <div className="xsec">
                          <div className="xhd"><span className="label">Últimos movimientos</span></div>
                          {txs.map((t) => (
                            <div key={t.id} className="xln">
                              <span className="xn">{t.counterparty_name || t.name || t.description || t.type}</span>
                              <b className={"mono " + (t.amount >= 0 ? "pos" : "")}>{signed(t.amount)}</b>
                            </div>
                          ))}
                        </div>
                      )}
                    </div></div></div>
                  )}
                </div>
              );
            }
            if (id === "svc") {
              const up = status?.filter((r) => r.up).length, down = status?.filter((r) => !r.up) || [];
              const ud = uptime?.days || [], us = uptime?.services || {};
              const sum = (ids, dayFilter) => ids.reduce((t, sid) => { const c = us[sid]?.[dayFilter]; return c ? [t[0] + c[0], t[1] + c[1]] : t; }, [0, 0]);
              const ids = services.map((x) => x.id);
              const dayCells = ud.map((k) => sum(ids, k));
              const svcTot = (sid) => ud.reduce((t, k) => { const c = us[sid]?.[k]; return c ? [t[0] + c[0], t[1] + c[1]] : t; }, [0, 0]);
              const allTot = dayCells.reduce((t, c) => [t[0] + c[0], t[1] + c[1]], [0, 0]);
              const pctTxt = (t) => (t[1] ? (Math.floor((t[0] / t[1]) * 1000) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " %" : "—");
              return (
                <div key={id} className="mw">
                  <button className="gc mod xc svcc" onClick={() => { setStatus(null); refreshServices(); }}>
                    <div className="wxtop">
                      <span className="label">{MODULES.svc.label}{alertBy.svc && <i className="adot" title={alertBy.svc} />}</span>
                      <span className="mono wxhl">últimos 30 días</span>
                    </div>
                    <div className="svcn">
                      <div className="svcbig"><span className="big num">{pctTxt(allTot)}</span><span className="mono svcu">uptime</span></div>
                      <div className={"mono svcnow " + (status && down.length ? "neg" : "")}>
                        {status ? (<><i />{down.length ? "sin respuesta: " + down.map((d) => d.name).join(", ") : up + " / " + status.length + " en línea ahora"}</>) : "comprobando…"}
                      </div>
                    </div>
                    <UpStrip cells={dayCells} />
                  </button>
                  <div className="xdet"><div className="xin"><div className="xpad">
                    <div className="xhd"><span className="label">Por servicio</span><span className="mono wxhl">ahora · 30 días</span></div>
                    <div className="xlist">
                      {(status || []).map((r, i) => (
                        <div key={r.id} className="srow" style={{ "--i": i }}>
                          <div className="srt">
                            <i className={r.up ? "up" : "down"} />
                            <a href={r.href} className="pn">{r.name}</a>
                            <span className="mono pm">{r.up ? r.ms + " ms" : "sin respuesta"}</span>
                            <span className="mono su">{pctTxt(svcTot(r.id))}</span>
                          </div>
                          <UpStrip small cells={ud.map((k) => sum([r.id], k))} />
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const inc = uptime?.incidents || {}, nm = Object.fromEntries(services.map((x) => [x.id, x.name]));
                      const rows = Object.entries(inc).flatMap(([sid, v]) => nm[sid] ? [...(v.since ? [{ sid, s: v.since, e: null }] : []), ...v.list.map((x) => ({ sid, ...x }))] : []).sort((x, y) => y.s - x.s).slice(0, 6);
                      return (
                        <div className="svcinc">
                          <div className="xhd"><span className="label">Caídas recientes</span></div>
                          {rows.length === 0 && <div className="note">Sin caídas en 30 días.</div>}
                          {rows.map((r, i) => (
                            <div key={i} className="xln">
                              <span className="xn">{nm[r.sid]}<small className="mono">{new Date(r.s).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span>
                              <b className={"mono " + (r.e ? "" : "neg")}>{r.e ? fmtDur(r.e - r.s) : "caído · " + fmtDur((now || Date.now()) - r.s)}</b>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {!status && <div className="note">Comprobando…</div>}
                    <div className="note mono pf">
                      {"vía " + (useAlt ? hosts.alt : hosts.local)}
                      {checkedAt ? " · " + checkedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}
                      {" · clic en la tarjeta = actualizar"}{checking ? " …" : ""}
                    </div>
                  </div></div></div>
                </div>
              );
            }
            if (id === "srv") return <ServerCard key={id} d={wd.srv} alert={alertBy.srv} />;
            if (id === "cal") return <CalendarCard key={id} d={wd.cal} now={now} />;
            if (id === "gh") return <GitHubCard key={id} d={wd.gh} alert={alertBy.gh} />;
            if (id === "dp") return <DiscoCard key={id} d={wd.dp} alert={alertBy.dp} />;
            if (id === "ha") return <HomeCard key={id} d={wd.ha} alert={alertBy.ha} />;
            if (id === "im") return <ImmichCard key={id} d={wd.im} alert={alertBy.im} />;
            if (id === "wx") {
              const gmin = wx ? Math.min(...wx.days.map((d) => d.lo)) : 0, gmax = wx ? Math.max(...wx.days.map((d) => d.hi)) : 1, gs = gmax - gmin || 1;
              return (
                <div key={id} className="mw">
                  <a className="gc mod xc" href="/admin#conexiones">
                    <div className="wxtop">
                      <span className="label">{MODULES.wx.label}{wx ? " · " + wx.city : ""}</span>
                      {wx && <span className="mono wxhl">{`máx ${wx.hi}° · mín ${wx.lo}°`}</span>}
                    </div>
                    {wx ? (
                      <>
                        <div className="wxmain">
                          <span className="wxi"><WxIcon c={wx.c} size={40} /></span>
                          <span className="big num">{wx.t}°</span>
                          <span className="wxd">{wxText(wx.c)}<small>Sensación {wx.feels}°</small></span>
                        </div>
                        <Curve data={wx.curve} />
                        <div className="wxax mono"><span>ahora</span><span>+6 h</span><span>+12 h</span><span>+24 h</span></div>
                      </>
                    ) : (
                      <div className="big num">—</div>
                    )}
                    {!wx && <div className="sub">{weather ? "" : "Elegir ciudad"}</div>}
                  </a>
                  {wx && (
                    <div className="xdet" aria-hidden>
                      <div className="xin"><div className="xpad">
                        <div className="label">Próximas horas</div>
                        <div className="wxh">
                          {wx.hours.map((h, i) => (
                            <div key={h.h} style={{ "--i": i }}><span className="mono">{h.h}</span><WxIcon c={h.c} size={20} /><b>{h.t}°</b></div>
                          ))}
                        </div>
                        <div className="wxdays">
                          {wx.days.map((d, i) => (
                            <div key={d.n} className="wxday" style={{ "--i": i }}>
                              <span>{d.n}</span><span className="wxdc">{wxText(d.c)}</span>
                              <span className="mono">{d.lo}°</span>
                              <span className="wxbar"><i style={{ left: ((d.lo - gmin) / gs) * 100 + "%", right: (1 - (d.hi - gmin) / gs) * 100 + "%" }} /></span>
                              <span className="mono">{d.hi}°</span>
                            </div>
                          ))}
                        </div>
                        <div className="wxfoot mono"><span>Viento {wx.wind} km/h</span><span>Humedad {wx.hum} %</span><span>Lluvia {wx.rain ?? 0} %</span></div>
                      </div></div>
                    </div>
                  )}
                </div>
              );
            }
            const pending = todos.filter((t) => !t.done);
            const shown = todos.map((t, i) => ({ t, i })).filter((x) => !x.t.done).slice(0, 6);
            return (
              <div key={id} className="mw">
                <button className="gc mod xc" onClick={() => setSheet("todo")}>
                  <div className="label">{MODULES.todo.label}</div>
                  <div className="big num">{pending.length}</div>
                  <div className="sub">{pending[0] ? pending[0].text : todos.length ? "Todo hecho" : "Añadir una tarea"}</div>
                </button>
                <div className="xdet"><div className="xin"><div className="xpad">
                  <div className="label">Pendientes</div>
                  <div className="xlist">
                    {shown.map(({ t, i }, k) => (
                      <button key={i} className="xtask" style={{ "--i": k }} onClick={() => saveTodos(todos.map((x, j) => (j === i ? { ...x, done: true } : x)))}>
                        <span className="box" /><span>{t.text}</span>
                      </button>
                    ))}
                  </div>
                  {!shown.length && <div className="note">{todos.length ? "Todo hecho" : "Sin tareas todavía"}</div>}
                  {pending.length > 6 && <div className="note mono">+{pending.length - 6} más</div>}
                  <button className="xlink mono" onClick={() => setSheet("todo")}>Abrir lista →</button>
                </div></div></div>
              </div>
            );
          })}
        </div>
        {pages > 1 && (
          <div className="pgdots" role="tablist" aria-label="Páginas de widgets" {...holdOn} onClick={(e) => {
            // cualquier clic en la franja activa el control más cercano
            let best = null, bd = Infinity;
            e.currentTarget.querySelectorAll("button").forEach((b) => { const r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2)); if (d < bd) { bd = d; best = b; } });
            if (e.detail === 0) best = e.target.closest("button"); // activación con teclado
            const go = best?.dataset.go;
            if (go != null) goPage(go === "prev" ? pg - 1 : go === "next" ? pg + 1 : +go);
          }}>
            <button className="pgarr" data-go="prev" aria-label="Página anterior"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 2.5L4 6l3.5 3.5" /></svg></button>
            {Array.from({ length: pages }, (_, i) => <button key={i} role="tab" aria-selected={i === pg} aria-label={"Página " + (i + 1)} data-go={i} className={"pgdot" + (i === pg ? " on" : "")}><i /></button>)}
            <button className="pgarr" data-go="next" aria-label="Página siguiente"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2.5L8 6 4.5 9.5" /></svg></button>
            <span className="pgsep" aria-hidden />
            <button className={"pgpause" + (paused ? " on" : "")} aria-label={paused ? "Reanudar cambio automático" : "Pausar cambio automático"} aria-pressed={paused} title={paused ? "Reanudar" : "Pausar"} onClick={(e) => { e.stopPropagation(); togglePause(); }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">{paused ? <path d="M2 1l7 4-7 4z" /> : <path d="M2 1h2v8H2zM6 1h2v8H6z" />}</svg>
            </button>
          </div>
        )}

        <div className="foot">
          {has("fm") && fm.state === "ok" && (
            <button onClick={() => { ls.del("fm_token"); ls.del("fm_cache"); setFm({ state: "login", data: null }); }}>cerrar sesión FinanceMaster</button>
          )}
        </div>
      </div>

      {sheet === "login" && <LoginSheet base={fmBase} onClose={() => setSheet(null)} onDone={() => { setSheet(null); loadFM(); }} />}
      {sheet === "todo" && <TodoSheet todos={todos} save={saveTodos} onClose={() => setSheet(null)} />}
    </>
  );
}

function LoginSheet({ base, onClose, onDone }) {
  const [email, setEmail] = useState(""), [pass, setPass] = useState(""), [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    try {
      const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password: pass }), signal: timeout(8000) });
      if (!r.ok) throw new Error(r.status === 401 ? "Credenciales incorrectas" : "Error " + r.status);
      const { access_token } = await r.json();
      ls.set("fm_token", access_token); ls.set("fm_token_url", base); onDone();
    } catch (er) { setErr(/fetch|abort|timeout/i.test(er.message) ? "No se puede alcanzar esa URL" : er.message); }
  };
  return (
    <div className="sheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel">
        <h2>FinanceMaster</h2>
        <form onSubmit={submit}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="username" autoFocus />
          <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="Contraseña" autoComplete="current-password" />
          <button className="btn" type="submit">Conectar</button>
          <div className="err">{err}</div>
          <div className="note">Solo se guarda el token de sesión en este navegador, nunca la contraseña.</div>
        </form>
      </div>
    </div>
  );
}

function TodoSheet({ todos, save, onClose }) {
  const [v, setV] = useState("");
  return (
    <div className="sheet" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel">
        <h2>Tareas</h2>
        <div className="tasks">
          {todos.map((t, i) => (
            <div key={i} className={"task" + (t.done ? " done" : "")}>
              <button className="box" aria-label="Completar" onClick={() => save(todos.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
              <span onClick={() => save(todos.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}>{t.text}</span>
              <button className="x" aria-label="Borrar" onClick={() => save(todos.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) { save([...todos, { text: v.trim(), done: false }]); setV(""); } }}>
          <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Añadir tarea y pulsar Enter" autoComplete="off" autoFocus />
        </form>
      </div>
    </div>
  );
}

function Spark({ data }) {
  const pts = data.filter((n) => Number.isFinite(n));
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 100, 30 - ((v - min) / span) * 26]);
  const d = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2)).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity=".9" />
      <circle cx={lx} cy={ly} r="0" />
    </svg>
  );
}
