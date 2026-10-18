import type { Mission } from "../mission.js";
import { WEAPONS } from "../crew.js";
import { KHARSAANS_PROMISE, taiidanDestroyer, taiidanInterceptor } from "../ships.js";

/**
 * "Cold Harbour": an original one-session mission set during the Exodus.
 * A rescue against the clock, with a Taiidan officer who may want out of the war.
 */
export const COLD_HARBOUR: Mission = {
  id: "cold-harbour",
  title: "Cold Harbour",
  blurb:
    "The fleet's refinery in the Hollow Reach has gone silent inside an ion storm, with forty miners aboard. Something else answered the last distress call: a Taiidan voice, asking questions about the fleet.",
  recommendedPlayers: "2-6 players, about two hours",
  primer: [
    "The Kushan fleet is fleeing across the galaxy towards Hiigara, the home their ancestors lost. They have just met the Taiidan Empire, which wants them gone, and nobody yet knows why.",
    "You are the crew of Kharsaan's Promise, a heavy corvette. The fleet's refinery has gone silent inside an ion storm with forty miners aboard, and a Taiidan voice answered its last call. Get the miners home; learn what you can.",
  ],
  art: "/art/scenes/refinery-exterior.webp",
  voices: { "Sub-Lieutenant Ressa Vaal": "bf_alice" },
  startNode: "briefing",
  gmNotes: [
    "Setting: the Exodus, soon after the fleet first met the Taiidan. The Kushan don't yet know why the Taiidan hate them.",
    "The refinery is the resource controller Teraan Seven, anchored in the Hollow Reach asteroid field and mining it. An ion storm has swallowed the field.",
    "A Taiidan scout corvette sheltering from the same storm found the refinery and boarded it. Sub-Lieutenant Ressa Vaal leads four marines. Her orders are to interrogate the miners about the Kushan fleet's route.",
    "Vaal has seen what the Taiidan Empire does to worlds that defy it, and she is looking for a way out. If the crew talk instead of shoot, she'll trade the miners' lives for passage with the fleet.",
    "The storm has wrecked the refinery's life support: the miners sealed in the ore hold have hours of air at most.",
    "Tone: claustrophobic, cold, desperate; then a glimmer of humanity in an enemy.",
  ].join("\n"),
  nodes: {
    briefing: {
      id: "briefing",
      type: "narration",
      scene: {
        title: "Resource Operations",
        mood: "briefing",
        location: "Mothership, resourcing deck",
        art: "/art/scenes/mothership-briefing.webp",
        truths: [{ id: "fleet-support", label: "Fleet Command on the line", kind: "advantage", strength: 1, scope: "location" }],
      },
      speaker: "Fleet Command",
      tone: "fleet",
      text:
        "Kharsaan's Promise, stand by. Eleven hours ago the refinery Teraan Seven stopped reporting from the Hollow Reach. An ion storm moved over the field and took every channel with it. Forty miners are aboard.",
      next: "briefing-2",
    },
    "briefing-2": {
      id: "briefing-2",
      type: "narration",
      speaker: "Fleet Command",
      tone: "fleet",
      text:
        "One fragment of their last transmission got through. It isn't a miner's voice. It's Taiidan, and it's asking for the fleet's heading. Get our people out. If you can learn what the Taiidan want, better still.",
      next: "storm-choice",
    },
    "storm-choice": {
      id: "storm-choice",
      type: "choice",
      scene: {
        title: "The Hollow Reach",
        mood: "tension",
        location: "Ion storm front",
        art: "/art/scenes/ion-storm.webp",
        truths: [{ id: "ion-storm", label: "Ion storm", kind: "complication", strength: 1, scope: "location" }],
      },
      prompt: "The storm is a wall of violet lightning across the asteroid field. The refinery is somewhere inside it.",
      options: [
        { id: "ride", label: "Ride the storm front straight in", hint: "Fast, but it'll shake the ship apart", next: "storm-ride" },
        { id: "lee", label: "Creep through the lee of the big asteroids", hint: "Slower and safer, if you can find the path", next: "storm-lee" },
      ],
    },
    "storm-ride": {
      id: "storm-ride",
      type: "test",
      prompt: "Lightning crawls over the hull and every screen fills with static. Keep her flying.",
      reason: "Ride the ion storm",
      approaches: [
        { label: "Fly through it", attribute: "coordination", skill: "flight", difficulty: 1 },
        { label: "Shield the systems as they surge", attribute: "reason", skill: "engineering", difficulty: 2 },
      ],
      focusHint: "Small Craft, Power Systems, Flight Systems",
      pass: {
        text: "Kharsaan's Promise bursts out of the storm front in record time, steaming with ionised frost. The refinery hangs ahead.",
        effects: { addTruths: [{ id: "ahead", label: "Ahead of the clock", kind: "advantage", strength: 1, scope: "situation" }] },
        next: "refinery",
      },
      fail: {
        text: "A surge blows half the sensor array. You make it through, half-blind and rattled.",
        effects: { stressParty: 2, addTruths: [{ id: "half-blind", label: "Sensors half-blind", kind: "complication", strength: 1, scope: "situation" }] },
        next: "refinery",
      },
    },
    "storm-lee": {
      id: "storm-lee",
      type: "test",
      prompt: "Somewhere among the tumbling asteroids is a path the storm can't reach. Find it.",
      reason: "Find the lee of the asteroids",
      approaches: [
        { label: "Read the field on the sensors", attribute: "insight", skill: "exploration", difficulty: 1 },
        { label: "Feel your way through by hand", attribute: "coordination", skill: "flight", difficulty: 2 },
      ],
      focusHint: "Navigation, Signal Analysis",
      pass: {
        text: "You thread the shadows between asteroids while the storm rages overhead. When the refinery comes into view, nothing aboard has seen you.",
        effects: { addTruths: [{ id: "unseen", label: "Unseen", kind: "advantage", strength: 1, scope: "situation" }] },
        next: "refinery",
      },
      fail: {
        text: "A wrong turn costs you precious time, and you have to break cover to get back on course.",
        effects: { threat: 2 },
        next: "refinery",
      },
    },
    refinery: {
      id: "refinery",
      type: "choice",
      scene: {
        title: "Teraan Seven",
        mood: "tension",
        location: "Hollow Reach, refinery anchorage",
        art: "/art/scenes/refinery-exterior.webp",
        truths: [{ id: "ion-storm", label: "Ion storm", kind: "complication", strength: 1, scope: "location" }],
      },
      prompt:
        "The refinery is dark except for its navigation strobes. A sleek red-and-black corvette is clamped to its cargo bay: Taiidan. How do you get aboard?",
      options: [
        { id: "bay", label: "Dock at the second cargo bay", hint: "Quick, but close to their ship", next: "dock-bay" },
        { id: "eva", label: "Spacewalk to a maintenance hatch", hint: "Quiet, if nobody slips", next: "dock-eva" },
      ],
    },
    "dock-bay": {
      id: "dock-bay",
      type: "test",
      prompt: "The bay doors are jammed half open, and the refinery is turning slowly. Match its spin and slide in.",
      reason: "Dock in a spinning bay",
      approaches: [
        { label: "Match the spin and dock", attribute: "coordination", skill: "flight", difficulty: 1 },
        { label: "Override the bay doors remotely", attribute: "reason", skill: "engineering", difficulty: 2 },
      ],
      pass: {
        text: "A perfect, silent docking. The deck plates are cold enough to frost your breath.",
        next: "control-room",
      },
      fail: {
        text: "The corvette's flank scrapes the bay with a scream of metal that rings through the whole refinery.",
        effects: { threat: 2 },
        next: "control-room",
      },
    },
    "dock-eva": {
      id: "dock-eva",
      type: "test",
      prompt: "Tethered and alone in the storm's glow, you cross thirty metres of open space to the hatch.",
      reason: "Spacewalk to the hatch",
      approaches: [
        { label: "Make the crossing", attribute: "agility", skill: "exploration", difficulty: 1 },
        { label: "Steady the team over the open link", attribute: "will", skill: "command", difficulty: 2 },
      ],
      focusHint: "Zero-G Movement, Composure",
      pass: {
        text: "You slip through the hatch one by one. Nobody aboard knows you're here.",
        effects: { momentum: 1 },
        next: "control-room",
      },
      fail: {
        text: "A tether snaps. Someone tumbles away for three long seconds before the line catches. You're all shaking by the time you're inside.",
        effects: { stressRoller: 4 },
        next: "control-room",
      },
    },
    "control-room": {
      id: "control-room",
      type: "narration",
      scene: {
        title: "Refinery Control",
        mood: "tension",
        location: "Teraan Seven, control deck",
        art: "/art/scenes/refinery-interior.webp",
        truths: [
          { id: "cold", label: "Bitter cold", kind: "complication", strength: 1, scope: "location" },
          { id: "consoles", label: "Live control consoles", kind: "advantage", strength: 1, scope: "location" },
        ],
      },
      speaker: "Narrator",
      tone: "gm",
      text:
        "The control deck is empty and freezing. On the life-support board one panel is still lit: the ore hold, forty heat signatures, air at nine per cent and falling. Somewhere below, Taiidan voices argue in a language none of you speak.",
      next: "air",
    },
    air: {
      id: "air",
      type: "extended",
      scene: {
        title: "The Ore Hold",
        mood: "tension",
        location: "Teraan Seven, life support",
        art: "/art/scenes/ore-hold.webp",
        truths: [{ id: "failing-air", label: "Failing air", kind: "threat", strength: 1, scope: "location" }],
      },
      prompt:
        "The storm fried the scrubbers feeding the ore hold. Forty miners are breathing the last of the air behind a sealed door. Get the air flowing before it runs out.",
      label: "Restore air to the ore hold",
      work: 6,
      magnitude: 1,
      resistance: 0,
      attempts: 5,
      approaches: [
        { label: "Rebuild the scrubber feed", attribute: "reason", skill: "engineering", difficulty: 1 },
        { label: "Force the emergency valves by hand", attribute: "brawn", skill: "engineering", difficulty: 2 },
        { label: "Talk the miners through slowing their breathing", attribute: "insight", skill: "medical", difficulty: 1 },
      ],
      pressure: [
        "Air in the hold: seven per cent. Someone inside is banging on the door.",
        "The banging stops. The heat signatures are clustering together for warmth.",
        "A Taiidan voice, much closer now: they've noticed the life-support board waking up.",
        "Four per cent. You hear coughing over the hold's intercom.",
      ],
      complete: {
        text: "The scrubbers catch with a roar of clean air. Over the intercom: cheering, crying, forty people breathing. Then the lights in the corridor behind you go red.",
        effects: { ru: 2, giveItem: { name: "Miner's cutting charges", origin: "Pressed on you by the grateful miners", uses: 2, size: "small" } },
        next: "standoff",
      },
      timeout: {
        text: "You get the air flowing as the last reserves run dry. Not everyone in the hold is conscious. The corridor lights go red behind you.",
        effects: { threat: 2 },
        next: "standoff",
      },
    },
    standoff: {
      id: "standoff",
      type: "combat",
      scene: {
        title: "Standoff on the Ore Deck",
        mood: "tension",
        location: "Teraan Seven, ore deck",
        art: "/art/scenes/taiidan-standoff.webp",
        truths: [{ id: "ore-crates", label: "Stacked ore crates for cover", kind: "advantage", strength: 1, scope: "location" }],
      },
      intro:
        "Taiidan marines in red-black armour fan out between the ore crates. Their officer is young, her helmet off, her rifle steady. \"Kushan,\" she says, in careful, accented words. \"You should not have come. Neither should we.\"",
      npcs: ["vaal", "marine", "marine", "marine"],
      parley: {
        label: "Hear her out",
        approach: { label: "Lower your weapon and listen", attribute: "will", skill: "command", difficulty: 2 },
        pass: {
          speaker: "Sub-Lieutenant Ressa Vaal",
          text:
            "\"I have seen the Empire burn a world for less than you have done,\" Vaal says quietly. \"Take your miners. Take me, and my people, to your fleet. I will tell you why we hunt you.\" Behind her, the marines lower their rifles one by one.",
          effects: { momentum: 2, ru: 2, giveItem: { name: "Vaal's Taiidan sidearm", origin: "Handed over by Sub-Lieutenant Vaal", size: "small" } },
          next: "escape",
        },
        failText: "\"Words,\" Vaal says, and she sounds almost sorry. \"I cannot go home with only words.\"",
      },
      reinforcementText: "A hatch bangs open overhead. Two more marines drop onto the ore deck.",
      moraleText: "With their officer down, the marines look at one another, then slowly set their rifles on the deck.",
      victory: {
        text: "The last marine falls. Vaal's scout corvette tears free of the bay and runs for the storm, leaving her people behind.",
        next: "escape",
      },
      defeat: {
        text: "Pinned behind the crates, you drag the miners back to your corvette under fire and seal the hatch as rounds hammer the hull.",
        effects: { threat: 2 },
        next: "escape",
      },
    },
    escape: {
      id: "escape",
      type: "space",
      scene: {
        title: "Out of the Storm",
        location: "Hollow Reach, storm's edge",
        art: "/art/scenes/taiidan-destroyer.webp",
        truths: [{ id: "ion-storm", label: "Ion storm", kind: "complication", strength: 1, scope: "location" }],
      },
      intro:
        "With forty miners crammed into every corner of the corvette, you clear the refinery and the storm breaks open ahead. Waiting there is a Taiidan destroyer, its ion cannon already glowing, and its interceptors peel away to run you down. Everyone to your stations.",
      ship: KHARSAANS_PROMISE,
      enemies: [taiidanDestroyer("destroyer", "Taiidan destroyer"), taiidanInterceptor("int-1", "Interceptor Red One"), taiidanInterceptor("int-2", "Interceptor Red Two")],
      breakaway: { difficulty: 2 },
      victory: {
        text: "The second interceptor comes apart in a blossom of fire. Without its fighters the destroyer can't catch a corvette in a storm, and you slip into the violet dark. Then: the fleet's beacon.",
        next: "end-home",
      },
      escaped: {
        text: "Jaal-quick and storm-blind, Kharsaan's Promise dives back into the lightning and the Taiidan lose you. An hour later, the fleet's beacon.",
        next: "end-home",
      },
      defeat: {
        text: "A broadside from the destroyer tears through the hull. Emergency bulkheads slam down, and you limp into the storm on one engine with miners screaming in the dark. Somehow, you make it home.",
        effects: { stressParty: 3 },
        next: "end-scarred",
      },
    },
    "end-home": {
      id: "end-home",
      type: "end",
      scene: { title: "Forty Lives", location: "Mothership, hangar bay", art: "/art/scenes/mothership-hangar.webp", mood: "victory" },
      text:
        "Fleet Command: \"Kharsaan's Promise, we count forty miners. Well done.\" On the hangar deck, families find each other in the crowd. Whatever the Taiidan wanted, today they didn't get it.",
      ru: 3,
    },
    "end-scarred": {
      id: "end-scarred",
      type: "end",
      scene: { title: "Home in Pieces", location: "Mothership, hangar bay", art: "/art/scenes/mothership-hangar.webp", mood: "loss" },
      text:
        "Fleet Command: \"Kharsaan's Promise, medical teams are standing by.\" The corvette settles on the deck with one engine dead and a hull full of exhausted, living people. It's enough.",
      ru: 2,
    },
  },
  npcs: {
    vaal: {
      id: "vaal",
      name: "Sub-Lieutenant Ressa Vaal",
      tier: "notable",
      portrait: "/art/portraits/vaal.webp",
      detail: "Helmet off, rifle steady, eyes tired",
      attributes: { agility: 10, brawn: 9, coordination: 10, insight: 10, reason: 9, will: 10 },
      skills: { combat: 3, command: 3, engineering: 1, exploration: 2, flight: 2, medical: 1 },
      maxStress: 12,
      armour: 1,
      weapon: WEAPONS.compositeRifle,
      attackAttribute: "coordination",
    },
    marine: {
      id: "marine",
      name: "Taiidan marine",
      tier: "minor",
      portrait: "/art/portraits/taiidan-marine.webp",
      detail: "Red-black armour and a sealed helmet",
      attributes: { agility: 9, brawn: 10, coordination: 10, insight: 8, reason: 7, will: 9 },
      skills: { combat: 2, command: 0, engineering: 1, exploration: 1, flight: 1, medical: 0 },
      maxStress: 6,
      armour: 1,
      weapon: WEAPONS.compositeRifle,
      attackAttribute: "coordination",
    },
  },
};
