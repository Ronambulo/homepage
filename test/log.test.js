import { test } from "node:test";
import assert from "node:assert/strict";
import { logEntry, rotate, rephrased, LOG_MAX } from "../lib/lunares/log.js";

test("logEntry: solo lo que vale, recortado", () => {
  assert.deepEqual(logEntry({ why: "wrong", q: "  ¿qué es   un agujero negro? ", route: "web" }, 5), { at: 5, why: "wrong", q: "¿qué es un agujero negro?", route: "web" });
  assert.equal(logEntry({ why: "otro", q: "hola" }), null);
  assert.equal(logEntry({ why: "dunno", q: "" }), null);
  const e = logEntry({ why: "rephrase", q: "x".repeat(500), next: "y", n: 3.4, f: { w: "datos" } }, 1);
  assert.equal(e.q.length, 200);
  assert.equal(e.route, "ai");
  assert.equal(e.next, "y");
  assert.equal(e.n, 3);
  assert.ok(!("f" in e)); // nada más que la pregunta y la ruta
});

test("rotate: las últimas 500", () => {
  const l = rotate(Array.from({ length: LOG_MAX }, (_, i) => ({ i })), [{ i: "nuevo" }]);
  assert.equal(l.length, LOG_MAX);
  assert.equal(l[0].i, 1);
  assert.equal(l[LOG_MAX - 1].i, "nuevo");
});

test("rephrased: la misma pregunta con otras palabras, no un seguimiento", () => {
  assert.ok(rephrased("¿cómo está la casa?", "la casa, ¿cómo está?"));
  assert.ok(rephrased("¿qué es un agujero negro?", "explícame qué es un agujero negro"));
  assert.ok(!rephrased("¿qué tiempo hace en Madrid?", "¿y en Barcelona?"));
  assert.ok(!rephrased("apunta comprar leche", "apunta llamar al fontanero"));
  assert.ok(!rephrased("", "hola"));
});

