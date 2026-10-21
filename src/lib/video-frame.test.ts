import { describe, expect, test } from "bun:test";
import { landscapeFrame } from "./video-frame";
describe("automatic landscape framing", () => {
  test("landscape fills 1280 by 720", () => { expect(landscapeFrame(1920, 1080)).toEqual({ x: 0, y: 0, width: 1280, height: 720 }); });
  test("portrait stays upright without cropping", () => { expect(landscapeFrame(720, 1280)).toEqual({ x: 437.5, y: 0, width: 405, height: 720 }); });
  test("waits for dimensions", () => { expect(landscapeFrame(0, 0)).toBeNull(); });
});
