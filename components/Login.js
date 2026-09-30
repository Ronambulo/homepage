"use client";

import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) return location.reload();
    setErr((await r.json().catch(() => ({}))).error || "Error"); setBusy(false);
  };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="adm-brand">Homepage</div>
        <div className="adm-title" style={{ marginBottom: 12 }}>Panel</div>
        <input className="fld" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Contraseña" autoFocus autoComplete="current-password" />
        <button className="pri" style={{ justifyContent: "center" }} disabled={busy}>Entrar</button>
        <div className="err">{err}</div>
        <a href="/" className="note">← Volver al inicio</a>
      </form>
    </div>
  );
}
