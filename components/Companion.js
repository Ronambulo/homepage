"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EXPR, COLORS, ALERT, host } from "@/lib/lunares";
import { createEngine } from "./lunares/engine";
import { Eye, Mouth } from "./lunares/Face";
import Menu from "./lunares/Menu";
import { SkyBack, SkyFront } from "./lunares/Sky";

// Kero: la mascota de la página. Este archivo solo pinta; el motor (física, guiones, charla,
// recordatorios, avisos y ánimo) vive en components/lunares/ y lo que no es del navegador, en lib/lunares/.

export const DEFAULTS = { enabled: true, name: "Kero", side: "right", size: "m", color: "tema", roam: "bottom", energy: 55, chatter: "low", follow: true, drag: true, goofy: true, sleep: true, round: 35, comments: true, reacts: true, nudges: true, daily: true, sound: true, ai: false, model: "qwen3:0.6b" };

const Companion = forwardRef(function Companion({ settings, facts, accent, embedded = false, onTweak, onTodo }, ref) {
  const s = { ...DEFAULTS, ...(settings || {}) };
  const P = useRef(null);
  P.current = { s, facts: facts || {}, embedded, onTweak, onTodo };

  const refs = {
    layer: useRef(null), char: useRef(null), grp: useRef(null), body: useRef(null), eyes: useRef(null), lids: useRef(null),
    talk: useRef(null), bub: useRef(null), stk: useRef(null), fx: useRef(null),
  };
  const chatIn = useRef(null);
  const api = useRef(null);
  const [expr, setExpr] = useState(null);
  const [mood, setMood] = useState("ok"); // ok | alert | sleep
  const [face, setFace] = useState(null); // cara de reposo según el ánimo
  const [moodK, setMoodK] = useState(null); // contento, aburrido, gruñón…
  const [bubble, setBubble] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [chat, setChat] = useState(false);
  const [thinking, setThinking] = useState(false); // contestando: el campo de texto espera
  const [trail, setTrail] = useState([]); // burbujas anteriores de la respuesta en curso
  const [menu, setMenu] = useState(null); // clic derecho: { x, y } dentro de la capa
  const [party, setParty] = useState(0); // estrellitas de fiesta
  const [sky, setSky] = useState(null); // efecto del tiempo: { k, n }
  const [burst, setBurst] = useState(0); // al despertar explota la pompa
  const [rems, setRems] = useState([]); // recordatorios pendientes
  const [mem, setMem] = useState([]); // lo que sabe de ti

  useImperativeHandle(ref, () => ({ play: (n) => api.current?.play(n) }), []);
  useEffect(() => { if (chat) chatIn.current?.focus(); }, [chat]);

  useEffect(() => {
    const set = { expr: setExpr, mood: setMood, face: setFace, moodK: setMoodK, bubble: setBubble, dragging: setDragging, chat: setChat, thinking: setThinking, trail: setTrail, menu: setMenu, burst: setBurst, party: setParty, sky: setSky, rems: setRems, mem: setMem };
    const eng = createEngine({ P, refs, set });
    api.current = eng;
    return () => { eng.destroy(); api.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  const cur = expr || (mood === "alert" ? "worried" : mood === "sleep" ? "sleep" : face || "idle");
  const e = EXPR[cur] || EXPR.idle;
  const fill = mood === "alert" ? ALERT : COLORS[s.color] || "var(--accent)";
  const ink = mood === "alert" ? "#2a1414" : "#14201a";
  const closeMenu = useCallback(() => setMenu(null), []);
  const status = mood === "sleep" ? "dormido" : thinking ? "pensando" : moodK || "despierto";
  const submit = (ev) => {
    ev.preventDefault();
    if (thinking) return;
    const v = chatIn.current?.value.trim() || "";
    if (chatIn.current) chatIn.current.value = "";
    if (v) api.current?.send(v.slice(0, 300));
  };
  const src = !chat && bubble?.src?.length ? bubble.src : null;
  const acts = !chat && bubble?.acts?.length ? bubble.acts : null;

  return (
    <div ref={refs.layer} className={"lun-layer" + (embedded ? " embedded" : "")} style={accent ? { "--accent": accent } : undefined}>
      {menu && (
        <Menu
          at={menu} layer={refs.layer} s={s} fill={fill} status={status} rems={rems} facts={mem} onTweak={onTweak} onClose={closeMenu}
          onAct={(n) => { setMenu(null); api.current?.play(n); }} onDelRem={(id) => api.current?.delRem(id)} onDelFact={(id) => api.current?.delFact(id)}
        />
      )}
      {(bubble || chat) && (
        <>
        {trail.length > 0 && <div ref={refs.stk} className="lun-stack">{trail.map((t) => <div key={t.k} className="lun-old">{t.text}</div>)}</div>}
        <div ref={refs.bub} className={"lun-bub" + (bubble?.think && !chat ? " think" : "") + (chat ? " chat" : "")} key={chat ? "chat" : bubble.k} role="status" onClick={chat || src || acts ? undefined : () => setBubble(null)}>
          {bubble && (bubble.think ? <span className="lun-dots"><i /><i /><i /></span> : <span className="lun-txt">{bubble.text}</span>)}
          {bubble?.src?.length > 0 && (
            <span className="lun-src">
              {bubble.src.slice(0, 3).map((x) => <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer" title={x.url}>{x.site || host(x.url)}</a>)}
            </span>
          )}
          {acts && (
            <span className="lun-acts">
              {acts.map((a) => <button key={a.k} type="button" className={a.k === "ok" ? "ok" : undefined} onClick={(ev) => { ev.stopPropagation(); api.current?.act(a.k); }}>{a.label}</button>)}
            </span>
          )}
          {chat && (
            <form onSubmit={submit}>
              <input
                ref={chatIn} className="lun-in" maxLength={300} placeholder={thinking ? `${s.name} está contestando…` : `Habla con ${s.name}…`} aria-label={`Habla con ${s.name}`} autoComplete="off"
                readOnly={thinking} aria-busy={thinking} style={thinking ? { opacity: 0.55 } : undefined}
                onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === "Escape") api.current?.closeChat(); }}
              />
            </form>
          )}
        </div>
        </>
      )}
      <div ref={refs.char} className={"lun" + (dragging ? " drag" : "")} role="button" tabIndex={0} aria-label={s.ai ? `${s.name} (doble clic o Mayús+Intro para hablar)` : s.name}>
        <svg viewBox="14 14 92 92" aria-hidden className={sky ? "sky-" + sky.k : undefined}>
          <g ref={refs.fx} style={{ display: "none" }}>
            <g data-k="pud">
              <path d="M24 96C20 96 18 92 22 90C24 85 32 84 37 86C42 81 52 81 57 84C63 80 74 80 80 84C86 82 95 84 97 89C102 90 101 96 96 96Z" fill={fill} style={{ transition: "fill .5s" }} />
              <ellipse cx="66" cy="85.5" rx="4" ry="1.4" fill="#fff" opacity=".35" />
              {["l", "r"].map((k) => <path key={k} data-k="sp" d="M0 0a1.1 1.1 0 0 1 2.2 0a2.2 2.2 0 0 1-4.4 0a3.3 3.3 0 0 1 6.6 0" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />)}
            </g>
            {[0, 1, 2].map((i) => <path key={i} data-k="star" d="M0-3L.9-.9 3 0 .9.9 0 3-.9.9-3 0-.9-.9Z" fill="#f0c992" />)}
            {[0, 1, 2, 3].map((i) => <circle key={i} data-k="drop" r="2" fill={fill} />)}
            <path data-k="spark" d="M0-4L1.2-1.2 4 0 1.2 1.2 0 4-1.2 1.2-4 0-1.2-1.2Z" fill="#f0c992" />
          </g>
          {sky && <SkyBack key={sky.n} k={sky.k} />}
          <g ref={refs.grp}>
            <path ref={refs.body} className="lun-bodyp" fill={fill} style={{ transition: "fill .5s" }} />
            {e.blush && (
              <g fill="#f07f8f" opacity=".45">
                <ellipse cx="41" cy="71" rx="5" ry="3" />
                <ellipse cx="79" cy="71" rx="5" ry="3" />
              </g>
            )}
            <g ref={refs.eyes} fill={ink} color={ink}>
              <g ref={refs.lids} className="lun-lids">
                <Eye kind={e.l} side="l" e={e} />
                <Eye kind={e.r} side="r" e={e} />
              </g>
              <g transform="translate(0 1)">{!e.mouth && <ellipse ref={refs.talk} cx="60" cy="76" rx="3.2" ry="0" />}</g>
              {e.mouth && <Mouth kind={e.mouth} />}
              {e.mouth && <ellipse ref={refs.talk} cx="60" cy="76" rx="0" ry="0" />}
            </g>
            {e.tear && <path className="lun-tear" d="M79 62c1.6 2.4 2.4 3.8 2.4 5a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.6 2.4-5z" fill="#9fd3ec" />}
            {cur === "sleep" && (
              <g aria-hidden>
                <circle className="lun-snot" cx="67.5" cy="73" r="4.4" fill="#fff" fillOpacity=".25" stroke="#fff" strokeOpacity=".7" strokeWidth=".9" />
                <g className="lun-z" fill={ink}>
                  <text x="84" y="40" fontSize="10">z</text>
                  <text x="84" y="40" fontSize="10">z</text>
                  <text x="84" y="40" fontSize="10">z</text>
                </g>
              </g>
            )}
            {burst > 0 && (
              <g key={burst} className="lun-burst" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" onAnimationEnd={() => setBurst(0)}>
                {[0, 60, 120, 180, 240, 300].map((a) => <path key={a} d="M67.5 66.5v-3" transform={`rotate(${a} 67.5 73)`} />)}
              </g>
            )}
            {party > 0 && (
              <g key={party} className="lun-party" onAnimationEnd={(ev) => { if (ev.target === ev.currentTarget.lastChild) setParty(0); }}>
                {[[0, "#ffd166"], [45, "#ff6b9a"], [90, "#7bdff2"], [135, "#b8f27b"], [180, "#ffd166"], [225, "#c79bff"], [270, "#ff9f5a"], [315, "#7bdff2"]].map(([a, c], i) => (
                  <path key={a} d="M60 22l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z" fill={c} style={{ "--a": a + "deg", animationDelay: (i % 3) * 60 + "ms" }} />
                ))}
              </g>
            )}
            {cur === "think" && <circle className="lun-dot" cx="92" cy="30" r="3" fill={ink} />}
          </g>
          {sky && <SkyFront key={sky.n} k={sky.k} />}
        </svg>
      </div>
    </div>
  );
});

export default Companion;
