// Hand-maintained list of every Circuit used by F1, F2, F3 and WEC in 2026, plus published 2027 Rounds.
// Time zones are derived from lat/lon (never hand-typed). Add aliases for each source's naming:
// OpenF1 circuit_short_name / location, Jolpica circuitId / locality, F2/F3 page slug / circuitShortName,
// sportstimes location, WEC race name. A Round whose Circuit can't be matched is flagged and skipped.
import tzlookup from "@photostructure/tz-lookup";
import type { Circuit } from "@/domain/types";

interface CircuitEntry extends Omit<Circuit, "timeZone" | "hasRadarCoverage"> {
  hasRadarCoverage?: boolean;
  aliases: string[];
}

const ENTRIES: CircuitEntry[] = [
  {
    id: "albert-park",
    name: "Albert Park Circuit",
    location: "Melbourne, Australia",
    lat: -37.8497,
    lon: 144.968,
    aliases: ["Melbourne", "Albert Park", "albert_park"],
  },
  {
    id: "shanghai",
    name: "Shanghai International Circuit",
    location: "Shanghai, China",
    lat: 31.3389,
    lon: 121.22,
    aliases: ["Shanghai"],
  },
  {
    id: "suzuka",
    name: "Suzuka International Racing Course",
    location: "Suzuka, Japan",
    lat: 34.8431,
    lon: 136.541,
    aliases: ["Suzuka"],
  },
  {
    id: "sakhir",
    name: "Bahrain International Circuit",
    location: "Sakhir, Bahrain",
    lat: 26.0325,
    lon: 50.5106,
    // Never match on a Round name such as "Bahrain Grand Prix": in 2026 that Round ran at Sepang.
    aliases: ["Sakhir", "Bahrain International Circuit", "8 Hours of Bahrain"],
  },
  {
    id: "jeddah",
    name: "Jeddah Corniche Circuit",
    location: "Jeddah, Saudi Arabia",
    lat: 21.6319,
    lon: 39.1044,
    aliases: ["Jeddah", "Jeddah Corniche Circuit"],
  },
  {
    id: "miami",
    name: "Miami International Autodrome",
    location: "Miami Gardens, United States",
    lat: 25.9581,
    lon: -80.2389,
    aliases: ["Miami", "Miami Gardens"],
  },
  {
    id: "montreal",
    name: "Circuit Gilles Villeneuve",
    location: "Montréal, Canada",
    lat: 45.5,
    lon: -73.5228,
    aliases: ["Montreal", "Montréal", "villeneuve", "Gilles Villeneuve"],
  },
  {
    id: "monaco",
    name: "Circuit de Monaco",
    location: "Monte Carlo, Monaco",
    lat: 43.7347,
    lon: 7.42056,
    aliases: ["Monte Carlo", "Monte-Carlo", "Monaco"],
  },
  {
    id: "catalunya",
    name: "Circuit de Barcelona-Catalunya",
    location: "Montmeló, Spain",
    lat: 41.57,
    lon: 2.26111,
    aliases: ["Barcelona", "Catalunya", "Barcelona-Catalunya", "Montmelo"],
  },
  {
    id: "red-bull-ring",
    name: "Red Bull Ring",
    location: "Spielberg, Austria",
    lat: 47.2197,
    lon: 14.7647,
    aliases: ["Spielberg", "Red Bull Ring", "red_bull_ring"],
  },
  {
    id: "silverstone",
    name: "Silverstone Circuit",
    location: "Silverstone, United Kingdom",
    lat: 52.0786,
    lon: -1.01694,
    aliases: ["Silverstone"],
  },
  {
    id: "spa-francorchamps",
    name: "Circuit de Spa-Francorchamps",
    location: "Stavelot, Belgium",
    lat: 50.4372,
    lon: 5.97139,
    aliases: ["Spa-Francorchamps", "Spa"],
  },
  {
    id: "hungaroring",
    name: "Hungaroring",
    location: "Budapest, Hungary",
    lat: 47.5789,
    lon: 19.2486,
    aliases: ["Hungaroring", "Budapest"],
  },
  {
    id: "zandvoort",
    name: "Circuit Zandvoort",
    location: "Zandvoort, Netherlands",
    lat: 52.3888,
    lon: 4.54092,
    aliases: ["Zandvoort"],
  },
  {
    id: "monza",
    name: "Autodromo Nazionale Monza",
    location: "Monza, Italy",
    lat: 45.6156,
    lon: 9.28111,
    aliases: ["Monza"],
  },
  {
    id: "madring",
    name: "Madring",
    location: "Madrid, Spain",
    lat: 40.46528,
    lon: -3.61528,
    aliases: ["Madring", "Madrid"],
  },
  {
    id: "baku",
    name: "Baku City Circuit",
    location: "Baku, Azerbaijan",
    lat: 40.3725,
    lon: 49.8533,
    hasRadarCoverage: false,
    aliases: ["Baku", "Baku City Circuit"],
  },
  {
    id: "sepang",
    name: "Sepang International Circuit",
    location: "Sepang, Malaysia",
    lat: 2.76083,
    lon: 101.738,
    aliases: ["Sepang", "Kuala Lumpur"],
  },
  {
    id: "marina-bay",
    name: "Marina Bay Street Circuit",
    location: "Singapore, Singapore",
    lat: 1.2914,
    lon: 103.864,
    aliases: ["Marina Bay", "marina_bay", "Singapore"],
  },
  {
    id: "cota",
    name: "Circuit of the Americas",
    location: "Austin, United States",
    lat: 30.1328,
    lon: -97.6411,
    aliases: ["Austin", "americas", "Circuit of the Americas", "COTA", "Lone Star Le Mans"],
  },
  {
    id: "mexico-city",
    name: "Autódromo Hermanos Rodríguez",
    location: "Mexico City, Mexico",
    lat: 19.4042,
    lon: -99.0907,
    aliases: ["Mexico City", "rodriguez", "Hermanos Rodriguez"],
  },
  {
    id: "interlagos",
    name: "Autódromo José Carlos Pace",
    location: "São Paulo, Brazil",
    lat: -23.7036,
    lon: -46.6997,
    aliases: ["Interlagos", "São Paulo", "Sao Paulo"],
  },
  {
    id: "las-vegas",
    name: "Las Vegas Strip Circuit",
    location: "Las Vegas, United States",
    lat: 36.1147,
    lon: -115.173,
    aliases: ["Las Vegas", "vegas"],
  },
  {
    id: "lusail",
    name: "Lusail International Circuit",
    location: "Lusail, Qatar",
    lat: 25.49,
    lon: 51.4542,
    aliases: ["Lusail", "losail", "Doha", "Qatar 1812km"],
  },
  {
    id: "yas-marina",
    name: "Yas Marina Circuit",
    location: "Abu Dhabi, United Arab Emirates",
    lat: 24.4672,
    lon: 54.6031,
    aliases: ["Yas Marina", "Yas Marina Circuit", "yas_marina", "Abu Dhabi", "Yas Island"],
  },
  {
    id: "portimao",
    name: "Algarve International Circuit",
    location: "Portimão, Portugal",
    lat: 37.227,
    lon: -8.6267,
    aliases: ["Portimão", "Portimao", "Algarve", "Algarve International Circuit"],
  },
  {
    id: "istanbul",
    name: "Istanbul Park",
    location: "Istanbul, Turkey",
    lat: 40.9517,
    lon: 29.405,
    aliases: ["Istanbul", "Istanbul Park"],
  },
  {
    id: "imola",
    name: "Autodromo Enzo e Dino Ferrari",
    location: "Imola, Italy",
    lat: 44.3439,
    lon: 11.7167,
    aliases: ["Imola"],
  },
  {
    id: "le-mans",
    name: "Circuit de la Sarthe",
    location: "Le Mans, France",
    lat: 47.956,
    lon: 0.2076,
    aliases: ["Le Mans", "Circuit de la Sarthe"],
  },
  {
    id: "fuji",
    name: "Fuji Speedway",
    location: "Oyama, Japan",
    lat: 35.3717,
    lon: 138.9256,
    aliases: ["Fuji", "Fuji Speedway"],
  },
];

function normalise(text: string): string {
  return ` ${text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

export const CIRCUITS: Circuit[] = ENTRIES.map(({ aliases: _aliases, hasRadarCoverage, ...c }) => {
  void _aliases;
  return { ...c, timeZone: tzlookup(c.lat, c.lon), hasRadarCoverage: hasRadarCoverage ?? true };
});

const byId = new Map(CIRCUITS.map((c) => [c.id, c]));

const aliasIndex: { alias: string; circuitId: string }[] = ENTRIES.flatMap((e) =>
  [e.id, e.name, ...e.aliases].map((a) => ({ alias: normalise(a), circuitId: e.id })),
).sort((a, b) => b.alias.length - a.alias.length);

export function getCircuit(id: string): Circuit | undefined {
  return byId.get(id);
}

/**
 * Finds the Circuit named by any of `hints` (circuit names, localities, page slugs).
 * Matches whole words; the longest matching alias wins ("Lone Star Le Mans" beats "Le Mans").
 * Returns null when nothing matches — callers must flag the Round and skip it, never guess.
 */
export function matchCircuit(hints: (string | null | undefined)[]): Circuit | null {
  const candidates = hints.filter((h): h is string => !!h && h.trim() !== "").map(normalise);
  let best: { alias: string; circuitId: string } | null = null;
  for (const candidate of candidates) {
    for (const entry of aliasIndex) {
      if (best && entry.alias.length <= best.alias.length) break;
      if (candidate.includes(entry.alias)) {
        best = entry;
        break;
      }
    }
  }
  return best ? (byId.get(best.circuitId) ?? null) : null;
}
