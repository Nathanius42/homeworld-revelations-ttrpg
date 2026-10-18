import type { Mission } from "../mission.js";
import { WEAPONS } from "../crew.js";

/**
 * "The Silent Beacon": an original one-session mission set during the Exodus.
 * Plays in about two hours with 3-6 players.
 */
export const SILENT_BEACON: Mission = {
  id: "silent-beacon",
  title: "The Silent Beacon",
  blurb:
    "Three jumps out from the Great Nebula, the Mothership hears a heartbeat: a Hiigaran-pattern beacon buried in the rings of a dead giant. Fleet Intelligence wants it. So, it seems, does someone else.",
  recommendedPlayers: "3-6 players, about two hours",
  primer: [
    "The Kushan have left their dying desert world, Kharak, in a single great Mothership, searching for the home their ancestors lost: Hiigara. The fleet jumps from system to system, hunted and alone.",
    "You are the crew of Kharsaan's Promise, a heavy corvette sent ahead of the fleet. Fleet Command has picked up an ancient Hiigaran beacon in the rings of a dead gas giant. Whatever it guards could show the fleet a safer way home, if you reach it before anyone else does.",
  ],
  art: "/art/scenes/derelict-exterior.webp",
  startNode: "briefing",
  gmNotes: [
    "Setting: the Exodus. The Kushan fleet is between jumps on the long road to Hiigara.",
    "The derelict is the Aranai-Sa, a Hiigaran survey ship lost during the Exile thousands of years ago. Its data core holds partial star charts of the Inner Rim: a safer route home.",
    "Turanic raiders under Captain Varek of the Red Wake reached the wreck first and are stripping it. Varek is greedy, not suicidal; a strong enough show of force or a good offer makes him back off.",
    "The wreck's reactor is unstable. Every attempt on the core risks waking it.",
    "Tone: wonder at the ancient ship, tension in the dark, a desperate escape. Everyone is human; the raiders have families too.",
  ].join("\n"),
  nodes: {
    briefing: {
      id: "briefing",
      type: "narration",
      scene: {
        title: "Fleet Intelligence",
        mood: "briefing",
        location: "Mothership, intelligence deck",
        art: "/art/scenes/mothership-briefing.webp",
        truths: [{ id: "fleet-support", label: "Fleet Command on the line", kind: "advantage", strength: 1, scope: "location" }],
      },
      speaker: "Fleet Command",
      tone: "fleet",
      text:
        "Crew of the corvette Kharsaan's Promise, report to the intelligence deck. We have detected a signal in the rings of the gas giant designated Tevaar. It repeats every eleven seconds. Its carrier pattern matches the Guidestone. It is Hiigaran.",
      next: "briefing-2",
    },
    "briefing-2": {
      id: "briefing-2",
      type: "narration",
      speaker: "Fleet Command",
      tone: "fleet",
      text:
        "Long-range scans show a derelict in the outer ring, older than any record we hold. A fleet cannot pass through that debris. A corvette can. Your orders: reach the wreck, recover whatever is broadcasting, and return before the fleet jumps in six hours. The Mothership will not wait.",
      next: "approach-choice",
    },
    "approach-choice": {
      id: "approach-choice",
      type: "choice",
      scene: {
        title: "The Rings of Tevaar",
        mood: "exploring",
        location: "Outer ring, debris field",
        art: "/art/scenes/debris-ring.webp",
        truths: [{ id: "debris", label: "Dense debris field", kind: "complication", strength: 1, scope: "location" }],
      },
      prompt: "Kharsaan's Promise drops out of the Mothership's bay into the ring's glittering dark. How do you go in?",
      options: [
        { id: "silent", label: "Run silent, engines cold, drifting between the rocks", hint: "Harder flying, but no one sees you coming", next: "approach-silent" },
        { id: "direct", label: "Burn straight for the wreck", hint: "Easy and fast, but loud", next: "approach-direct" },
      ],
    },
    "approach-silent": {
      id: "approach-silent",
      type: "test",
      prompt: "Thread the corvette through tumbling ice and rock on thrusters alone.",
      reason: "Fly silent through the debris",
      approaches: [
        { label: "Fly it by hand", attribute: "coordination", skill: "flight", difficulty: 2 },
        { label: "Plot a drift path on the sensors", attribute: "reason", skill: "exploration", difficulty: 2 },
      ],
      focusHint: "Small Craft, Navigation, Evasive Manoeuvres",
      pass: {
        text: "The corvette slides through the ring like a shadow. Nothing out here knows you exist.",
        effects: { addTruths: [{ id: "unseen", label: "Unseen", kind: "advantage", strength: 1, scope: "situation" }] },
        next: "scan",
      },
      fail: {
        text: "A slab of ice clips the hull. Alarms, a lurch, and every crew member is thrown against their straps. If anyone was listening, they heard that.",
        effects: { stressParty: 2, threat: 2 },
        next: "scan",
      },
    },
    "approach-direct": {
      id: "approach-direct",
      type: "test",
      prompt: "Punch through the ring at full burn, dodging the big rocks.",
      reason: "Burn hard through the debris",
      approaches: [
        { label: "Fly it by hand", attribute: "coordination", skill: "flight", difficulty: 1 },
        { label: "Push the engines past spec", attribute: "reason", skill: "engineering", difficulty: 2 },
      ],
      pass: {
        text: "The engines roar and the ring parts around you. The wreck swells ahead, huge and silent. Your exhaust plume must be visible for a thousand kilometres.",
        effects: { threat: 2 },
        next: "scan",
      },
      fail: {
        text: "A chunk of rock the size of a house tumbles across your path. You make it, just, with a scorched hull and a very loud arrival.",
        effects: { threat: 3, stressRoller: 2 },
        next: "scan",
      },
    },
    scan: {
      id: "scan",
      type: "test",
      scene: {
        title: "The Aranai-Sa",
        mood: "mystery",
        location: "Outer ring, alongside the derelict",
        art: "/art/scenes/derelict-exterior.webp",
      },
      prompt:
        "The derelict hangs before you: kilometres of ribbed hull, ancient and pale, its beacon still pulsing. Before you dock, someone should sweep it with the sensors.",
      reason: "Scan the derelict",
      approaches: [
        { label: "Run a full sensor sweep", attribute: "insight", skill: "exploration", difficulty: 1 },
        { label: "Read the hull like a ship-hand", attribute: "insight", skill: "flight", difficulty: 2 },
      ],
      focusHint: "Signal Analysis, Threat Assessment",
      pass: {
        text: "The sweep lights up a second heat signature at the aft docking ring: a Turanic corvette, crudely welded to the hull. Raiders. They're already inside.",
        effects: { addTruths: [{ id: "forewarned", label: "Forewarned about the raiders", kind: "advantage", strength: 1, scope: "situation" }] },
        next: "entry-choice",
      },
      fail: {
        text: "The old hull scatters your sensors into noise. Whatever's waiting inside, you'll meet it in the dark.",
        effects: { threat: 1 },
        next: "entry-choice",
      },
    },
    "entry-choice": {
      id: "entry-choice",
      type: "choice",
      prompt: "You mate the corvette to the hull near the beacon's source. How do you get in?",
      options: [
        { id: "cut", label: "Cut straight through the hull", hint: "Engineering muscle", next: "entry-cut" },
        { id: "code", label: "Wake the ancient airlock and coax it open", hint: "Brains and history", next: "entry-code" },
      ],
    },
    "entry-cut": {
      id: "entry-cut",
      type: "test",
      prompt: "The hull is some alloy no Kushan foundry ever made. The torch spits and the metal fights back.",
      reason: "Cut through the ancient hull",
      approaches: [
        { label: "Work the cutting torch", attribute: "coordination", skill: "engineering", difficulty: 1 },
        { label: "Brute-force the seam", attribute: "brawn", skill: "engineering", difficulty: 2 },
      ],
      focusHint: "Hull Cutting, Ship Repairs",
      pass: {
        text: "A neat circle of hull falls inward, glowing at the edges. You're in, and quietly.",
        next: "corridors",
      },
      fail: {
        text: "The cut goes wrong; a plume of molten alloy and a shriek of tearing metal echo through the whole wreck.",
        effects: { threat: 2, stressRoller: 2 },
        next: "corridors",
      },
    },
    "entry-code": {
      id: "entry-code",
      type: "test",
      prompt: "Faded glyphs circle the airlock. Some of them match the carvings from Khar-Toba.",
      reason: "Wake the ancient airlock",
      approaches: [
        { label: "Read the glyphs", attribute: "reason", skill: "exploration", difficulty: 1 },
        { label: "Hot-wire the lock", attribute: "reason", skill: "engineering", difficulty: 2 },
      ],
      focusHint: "Ancient Technology, Hiigaran History, Linguistics",
      pass: {
        text: "The glyphs glow at your touch. With a sigh of air thousands of years old, the outer door rolls open. On the inner wall: a mural of a blue-green world. Hiigara.",
        effects: { momentum: 1, giveItem: { name: "Hiigaran glyph key", origin: "Prised from the derelict's outer door", size: "small" } },
        next: "corridors",
      },
      fail: {
        text: "The lock wakes, then panics. Lights strobe along the corridor ahead and a tone sounds, deep in the ship. Someone else will have heard it.",
        effects: { threat: 2 },
        next: "corridors",
      },
    },
    corridors: {
      id: "corridors",
      type: "narration",
      scene: {
        title: "Inside the Aranai-Sa",
        mood: "mystery",
        location: "Derelict, central spine",
        art: "/art/scenes/derelict-interior.webp",
        truths: [
          { id: "darkness", label: "Darkness", kind: "complication", strength: 1, scope: "location" },
          { id: "zero-g", label: "Zero gravity", kind: "complication", strength: 1, scope: "location" },
        ],
      },
      speaker: "Narrator",
      tone: "gm",
      text:
        "Your helmet lights carve narrow paths through the dark. The spine of the ship is a long ribbed tunnel; you pull yourselves along by handholds made for Hiigaran hands. Ahead, the beacon's chamber glows faint blue. Then a voice crackles across an open channel: \"Kushan. You're a long way from your burning world.\"",
      next: "ambush",
    },
    ambush: {
      id: "ambush",
      type: "combat",
      scene: {
        title: "Ambush in the Spine",
        location: "Derelict, beacon antechamber",
        art: "/art/scenes/raider-ambush.webp",
        truths: [{ id: "cover-ribs", label: "Hull ribs for cover", kind: "advantage", strength: 1, scope: "location" }],
      },
      intro:
        "Raiders drift out from behind the ribs, scavenged rifles raised. Their leader wears a coat stitched from a dozen ships' colours. \"Captain Varek, Red Wake. This salvage is claimed. Turn around, or join it.\"",
      npcs: ["varek", "raider", "raider", "raider"],
      parley: {
        label: "Talk Varek down",
        approach: { label: "Face him down", attribute: "will", skill: "command", difficulty: 2 },
        pass: {
          text:
            "Varek studies you for a long moment, then laughs. \"Fine. Keep your ghosts, Kushan. The wreck's reactor is waking anyway; I'd rather not be here when it does.\" The raiders pull back to their ship.",
          effects: { momentum: 2 },
          next: "core",
        },
        failText: "Varek spits. \"Words. Kushan always have words.\" The rifles stay up.",
      },
      reinforcementText: "Boots clang on the hull ribs behind you. Two more raiders swing into the fight.",
      moraleText: "With their captain down, the raiders throw their weapons into the dark and raise their hands.",
      victory: {
        text: "The last raider drifts still. Somewhere aft, Varek's corvette tears itself free of the hull and flees into the ring.",
        next: "core",
      },
      defeat: {
        text: "The crew is driven back to the corvette, battered and bleeding. You seal the airlock as rounds spark off the door.",
        effects: { threat: 2 },
        next: "escape",
      },
    },
    core: {
      id: "core",
      type: "extended",
      scene: {
        title: "The Beacon Chamber",
        mood: "mystery",
        location: "Derelict, data core vault",
        art: "/art/scenes/data-core.webp",
        truths: [{ id: "reactor", label: "Unstable reactor", kind: "threat", strength: 1, scope: "location" }],
      },
      prompt:
        "The chamber holds a pillar of crystal and old metal, pulsing with the beacon's light. Data scrolls through it: star charts, stellar positions, a route. Getting it out without wrecking it will take patience, and the reactor is stirring.",
      label: "Recover the data core",
      work: 6,
      magnitude: 1,
      resistance: 0,
      attempts: 5,
      approaches: [
        { label: "Unseat the core's housings", attribute: "coordination", skill: "engineering", difficulty: 1 },
        { label: "Decode the data as it streams", attribute: "reason", skill: "exploration", difficulty: 2 },
        { label: "Reroute power from the corvette", attribute: "reason", skill: "flight", difficulty: 2 },
      ],
      pressure: [
        "Deep in the ship, the reactor groans. The deck shivers.",
        "Warning glyphs crawl red across the walls. The air is getting hot.",
        "A conduit bursts somewhere aft, venting plasma into the dark.",
        "The whole wreck lurches. You don't have long.",
      ],
      complete: {
        text: "The core slides free in your hands, still glowing. A thousand stars of the Inner Rim, mapped by the people who were here before. Then the reactor alarm becomes a scream.",
        effects: { ru: 2 },
        next: "escape",
      },
      timeout: {
        text: "Out of time. You rip the core out half-decoded, praying enough survives, as the reactor alarm becomes a scream.",
        effects: { threat: 1 },
        next: "escape",
      },
    },
    escape: {
      id: "escape",
      type: "test",
      scene: {
        title: "Run for the Mothership",
        mood: "tension",
        location: "Outer ring, at full burn",
        art: "/art/scenes/escape.webp",
        truths: [{ id: "debris", label: "Dense debris field", kind: "complication", strength: 1, scope: "location" }],
      },
      prompt: "The Aranai-Sa is coming apart behind you, its reactor blooming white. The Mothership's jump window is closing. Get everyone home.",
      reason: "Escape the dying wreck",
      approaches: [
        { label: "Fly like your life depends on it", attribute: "coordination", skill: "flight", difficulty: 2 },
        { label: "Call the run and keep the crew working", attribute: "will", skill: "command", difficulty: 1 },
      ],
      focusHint: "Small Craft, Evasive Manoeuvres, Leadership",
      pass: {
        text: "Kharsaan's Promise rides the shockwave out of the ring and drops into the Mothership's bay with seconds to spare. Behind you, Tevaar's rings burn.",
        next: "end-home",
      },
      fail: {
        text: "The blast catches the corvette and spins it like a coin. You limp into the bay on one engine, every one of you bruised and shaking, as the fleet jumps.",
        effects: { stressParty: 3 },
        next: "end-scarred",
      },
    },
    "end-home": {
      id: "end-home",
      type: "end",
      scene: { title: "Home, for now", location: "Mothership, hangar bay", art: "/art/scenes/mothership-hangar.webp", mood: "victory" },
      text:
        "Fleet Command: \"Data core received. Kharsaan's Promise, well done.\" A pause, then, softer: \"For the first time, we know the road ahead. Hiigara is closer tonight because of you.\" The hyperspace window opens, and the fleet moves on.",
      ru: 3,
    },
    "end-scarred": {
      id: "end-scarred",
      type: "end",
      scene: { title: "Home, at a cost", location: "Mothership, hangar bay", art: "/art/scenes/mothership-hangar.webp", mood: "loss" },
      text:
        "Fleet Command: \"Kharsaan's Promise, you are aboard. Medical teams are on their way.\" The corvette's hull ticks as it cools, scored with Tevaar's fire. Whatever you brought back, you paid for it. The fleet jumps, and Hiigara is a little closer.",
      ru: 2,
    },
  },
  npcs: {
    varek: {
      id: "varek",
      name: "Captain Varek of the Red Wake",
      tier: "notable",
      portrait: "/art/portraits/varek.webp",
      detail: "Patchwork coat of a dozen ships' colours",
      attributes: { agility: 9, brawn: 9, coordination: 10, insight: 9, reason: 8, will: 10 },
      skills: { combat: 3, command: 2, engineering: 1, exploration: 2, flight: 2, medical: 0 },
      maxStress: 12,
      armour: 1,
      weapon: WEAPONS.automaticPistol,
      attackAttribute: "coordination",
    },
    raider: {
      id: "raider",
      name: "Red Wake raider",
      tier: "minor",
      portrait: "/art/portraits/raider.webp",
      detail: "Scavenged rifle and a cracked visor",
      attributes: { agility: 10, brawn: 10, coordination: 9, insight: 7, reason: 7, will: 8 },
      skills: { combat: 2, command: 0, engineering: 1, exploration: 2, flight: 1, medical: 0 },
      maxStress: 6,
      armour: 1,
      weapon: WEAPONS.compositeRifle,
      attackAttribute: "coordination",
    },
  },
};
