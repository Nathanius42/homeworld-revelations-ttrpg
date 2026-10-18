import { describe, expect, it } from "vitest";
import { chooseKokoro } from "@hwr/protocol";

describe("narration voices", () => {
  it("uses a mission's voice for a named speaker, with an optional speed", () => {
    const voices = { "Captain Vohra Sek": "af_nicole", "Vash’Kora": "bm_fable@0.8", Odd: "am_adam@3" };
    expect(chooseKokoro({ speaker: "Captain Vohra Sek", tone: "npc" }, voices)).toEqual({ voice: "af_nicole", speed: 1 });
    expect(chooseKokoro({ speaker: "Vash’Kora", tone: "npc" }, voices)).toEqual({ voice: "bm_fable", speed: 0.8 });
    // A speed outside what the server accepts falls back to normal.
    expect(chooseKokoro({ speaker: "Odd", tone: "npc" }, voices)).toEqual({ voice: "am_adam", speed: 1 });
  });

  it("gives the Narrator and Fleet Command their own voices", () => {
    expect(chooseKokoro({ speaker: "Narrator", tone: "gm" }).voice).toBe("bm_george");
    expect(chooseKokoro({ speaker: "Fleet Command", tone: "fleet" }).voice).toBe("bf_emma");
  });
});
