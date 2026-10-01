import test from "node:test";
import assert from "node:assert/strict";
import { skyFx } from "../lib/lunares/sky.js";

test("skyFx: sin datos no hay animación", () => {
  assert.equal(skyFx(null), null);
  assert.equal(skyFx({}), null);
});

test("skyFx: lo que cae del cielo", () => {
  assert.equal(skyFx({ c: 95, t: 20 }, 12), "storm");
  assert.equal(skyFx({ c: 99, t: 35 }, 12), "storm");
  assert.equal(skyFx({ c: 73, t: -2 }, 12), "snow");
  assert.equal(skyFx({ c: 86, t: 0 }, 12), "snow");
  assert.equal(skyFx({ c: 61, t: 5 }, 12), "rain");
  assert.equal(skyFx({ c: 81, t: 15 }, 12), "rain");
  assert.equal(skyFx({ c: 53, t: 15 }, 12), "rain");
});

test("skyFx: temperatura extrema sin precipitación", () => {
  assert.equal(skyFx({ c: 0, t: 34 }, 12), "hot");
  assert.equal(skyFx({ c: 3, t: 3 }, 12), "cold");
  assert.equal(skyFx({ c: 0, t: 30 }, 12), "sun");
  assert.equal(skyFx({ c: 0, t: 8 }, 12), "sun");
});

test("skyFx: nubes, sol y noche", () => {
  assert.equal(skyFx({ c: 2, t: 18 }, 12), "cloud");
  assert.equal(skyFx({ c: 45, t: 12 }, 9), "cloud");
  assert.equal(skyFx({ c: 1, t: 20 }, 14), "sun");
  assert.equal(skyFx({ c: 0, t: 20 }, 23), "night");
  assert.equal(skyFx({ c: 0, t: 20 }, 3), "night");
});
