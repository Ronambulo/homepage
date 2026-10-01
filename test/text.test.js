import test from "node:test";
import assert from "node:assert/strict";
import { chunks, partial, parseAI, toYou, toThem, readMs } from "../lib/lunares/text.js";

test("chunks junta frases cortas y no pasa de 5 burbujas", () => {
  assert.deepEqual(chunks("Hola. ¿Qué tal?"), ["Hola. ¿Qué tal?"]);
  const long = Array.from({ length: 9 }, (_, i) => `Esta es la frase número ${i} y es bastante larga para ir sola.`).join(" ");
  assert.equal(chunks(long).length, 5);
});

test("parseAI y partial", () => {
  const p = parseAI("<think>hmm</think>[happy] [spin] **Hola** amigo");
  assert.equal(p.text, "Hola amigo");
  assert.equal(p.act, "spin");
  assert.equal(partial("Hola [hap"), "Hola");
});

test("toYou / toThem", () => {
  assert.equal(toYou("Mi madre vive en Lugo"), "Tu madre vive en Lugo");
  assert.equal(toThem("me gusta el fútbol"), "le gusta el fútbol");
});

test("readMs está acotado", () => {
  assert.equal(readMs(""), 3800);
  assert.equal(readMs("x".repeat(1000)), 11000);
});
