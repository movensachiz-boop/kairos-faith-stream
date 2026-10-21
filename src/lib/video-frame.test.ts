import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { landscapeFrame } from "./video-frame";
describe("automatic landscape framing", () => {
  test("landscape fills 1280 by 720", () => { assert.deepEqual(landscapeFrame(1920, 1080), { x: 0, y: 0, width: 1280, height: 720 }); });
  test("portrait stays upright without cropping", () => { assert.deepEqual(landscapeFrame(720, 1280), { x: 437.5, y: 0, width: 405, height: 720 }); });
  test("waits for dimensions", () => { assert.equal(landscapeFrame(0, 0), null); });
});
