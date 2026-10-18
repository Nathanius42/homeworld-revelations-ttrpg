import { describe, expect, it } from "vitest";
import { MAX_TEXT, speak, ttsAvailable, validRequest } from "../src/tts.js";

describe("validRequest", () => {
  it("accepts a line, a known voice and a sensible speed", () => {
    expect(validRequest({ text: " Hello. ", voice: "bm_george", speed: 0.95 })).toEqual({ text: "Hello.", voice: "bm_george", speed: 0.95 });
  });

  it("falls back to normal speed when the speed is odd", () => {
    expect(validRequest({ text: "Hi.", voice: "bf_emma", speed: 5 })).toMatchObject({ speed: 1 });
  });

  it("refuses empty or overlong text and unknown voices", () => {
    expect(validRequest({ text: "", voice: "bm_george" })).toMatch(/No text/);
    expect(validRequest({ text: "a".repeat(MAX_TEXT + 1), voice: "bm_george" })).toMatch(/longer than/);
    expect(validRequest({ text: "Hi.", voice: "../../etc" })).toMatch(/Unknown voice/);
    expect(validRequest(undefined)).toMatch(/No text/);
  });
});

// Only on a PC with the Kokoro model in the private folder.
describe.skipIf(!ttsAvailable())("Kokoro on this PC", () => {
  it("speaks a line as WAV, and gives the same line back from the cache", async () => {
    const wav = await speak("The dunes are quiet tonight.", "bm_george", 1);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.length).toBeGreaterThan(24_000);
    const started = Date.now();
    expect(await speak("The dunes are quiet tonight.", "bm_george", 1)).toBe(wav);
    expect(Date.now() - started).toBeLessThan(50);
  }, 60_000);

  it("never holds up the game while it speaks", async () => {
    // A 10 ms timer stands in for votes and rolls: it must keep firing on time during generation.
    let worst = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      worst = Math.max(worst, now - last - 10);
      last = now;
    }, 10);
    await speak("Gaalsien patrols sweep the walkways while the breach team works at the door.", "bm_lewis", 1);
    clearInterval(timer);
    expect(worst).toBeLessThan(150);
  }, 60_000);
});
