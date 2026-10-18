/** Ships in the Fleet Archive. Ids match folders in reference/ships (prepared by tools/ship-studio). */
export interface ArchiveShip {
  id: string;
  name: string;
  faction: "Kushan" | "Turanic Raiders" | "Derelict";
  role: string;
  blurb: string;
  /** Team colour override for the hull mask. */
  team?: string;
}

export const FLEET: ArchiveShip[] = [
  {
    id: "kus_mothership",
    name: "The Mothership",
    faction: "Kushan",
    role: "Colony ship and mobile shipyard",
    blurb: "Sixty years in the building above Kharak, she carries the sleeping hopes of a whole people and builds every ship in the fleet. She flies upright, a tower of light against the dark.",
  },
  {
    id: "kus_heavycorvette",
    name: "Kharsaan's Promise",
    faction: "Kushan",
    role: "Heavy corvette (the crew's ship)",
    blurb: "Small enough to slip through a debris ring, tough enough to come home from one. Your crew's ship for The Silent Beacon.",
  },
  {
    id: "kus_carrier",
    name: "Carrier",
    faction: "Kushan",
    role: "Forward base and fighter tender",
    blurb: "A slab-sided workhorse that builds and repairs strike craft far from the Mothership.",
  },
  {
    id: "kus_ioncannonfrigate",
    name: "Ion Cannon Frigate",
    faction: "Kushan",
    role: "Line-of-battle frigate",
    blurb: "A single heavy ion beam along its spine. Point it at a problem and the problem goes away.",
  },
  {
    id: "kus_assaultfrigate",
    name: "Assault Frigate",
    faction: "Kushan",
    role: "Escort frigate",
    blurb: "Fast-tracking turrets for knocking fighters and corvettes out of the sky around the fleet.",
  },
  {
    id: "kus_destroyer",
    name: "Destroyer",
    faction: "Kushan",
    role: "Capital ship",
    blurb: "Heavy guns and heavy plating, built once the fleet learned what waited beyond the Great Nebula.",
  },
  {
    id: "kus_heavycruiser",
    name: "Heavy Cruiser",
    faction: "Kushan",
    role: "Capital ship",
    blurb: "The fleet's heaviest warship: slow, deliberate, and nearly impossible to stop.",
  },
  {
    id: "kus_researchship",
    name: "Research Vessel",
    faction: "Kushan",
    role: "Science ship",
    blurb: "Linked modules where S'jet scholars turn salvage and stolen glimpses into new technology.",
  },
  {
    id: "kus_resourcecollector",
    name: "Resource Collector",
    faction: "Kushan",
    role: "Harvester",
    blurb: "It chews asteroids into raw material for the Mothership's yards. Unglamorous; indispensable.",
  },
  {
    id: "kus_interceptor",
    name: "Interceptor",
    faction: "Kushan",
    role: "Fighter",
    blurb: "A one-pilot dart, flown in tight formations of five.",
  },
  {
    id: "kus_scout",
    name: "Scout",
    faction: "Kushan",
    role: "Reconnaissance fighter",
    blurb: "All engine and sensors: the fleet's eyes in the dark.",
  },
  {
    id: "tur_p1mothership",
    name: "Red Wake Carrier",
    faction: "Turanic Raiders",
    role: "Raider mothership",
    blurb: "Captain Varek's ship, welded together from a dozen salvaged hulls and painted in stolen colours.",
  },
  {
    id: "tur_standardcorvette",
    name: "Raider Corvette",
    faction: "Turanic Raiders",
    role: "Gunboat",
    blurb: "Cheap, fast and mean. Raiders hunt in packs of these.",
  },
  {
    id: "tur_fighter",
    name: "Raider Fighter",
    faction: "Turanic Raiders",
    role: "Fighter",
    blurb: "Barely more than an engine with a gun bolted on.",
  },
  {
    id: "tur_ionarrayfrigate",
    name: "Ion Array Frigate",
    faction: "Turanic Raiders",
    role: "Raider frigate",
    blurb: "A cluster of ion emitters scavenged from better ships, aimed by people who don't care what they hit.",
  },
  {
    id: "der_ghostship",
    name: "The Aranai-Sa",
    faction: "Derelict",
    role: "Ancient vessel of unknown origin",
    blurb: "Older than any record the Kushan hold, still broadcasting after thousands of years. Something aboard is still awake.",
  },
  {
    id: "der_heavycruiser",
    name: "Derelict Cruiser",
    faction: "Derelict",
    role: "Wreck",
    blurb: "A dead warship drifting in the debris of some forgotten battle.",
  },
];
