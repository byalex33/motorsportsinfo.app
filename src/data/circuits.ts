// Hand-maintained list of every Circuit used by F1, F2, F3, WEC, Formula E, IndyCar and MotoGP in 2026,
// plus published 2027 Rounds. Time zones are derived from lat/lon (never hand-typed). Add aliases for each
// source's naming: OpenF1 circuit_short_name / location, Jolpica circuitId / locality, F2/F3 page slug /
// circuitShortName, sportstimes location (F2, F3, FE) or Round name (IndyCar), WEC race name. MotoGP is
// matched by coordinates (nearestCircuit). A Round whose Circuit can't be matched is flagged and skipped.
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

  // Formula E (sportstimes `location`; also shared with F1: Mexico City, Miami, Jeddah, Monaco, Shanghai).
  {
    id: "sao-paulo-street",
    name: "São Paulo Street Circuit",
    location: "São Paulo, Brazil",
    lat: -23.5153,
    lon: -46.6394,
    // sportstimes gives only "Sao Paulo", which is Interlagos for every other Series, so the ePrix name
    // identifies this Circuit (like the WEC race-name aliases). Remove it if the ePrix moves to Interlagos.
    aliases: ["Anhembi", "São Paulo Street Circuit", "São Paulo ePrix", "Sao Paulo ePrix"],
  },
  {
    id: "jarama",
    name: "Circuito del Jarama",
    location: "San Sebastián de los Reyes, Spain",
    lat: 40.617,
    lon: -3.5856,
    aliases: ["Jarama", "Circuito del Jarama"],
  },
  {
    id: "tempelhof",
    name: "Tempelhof Airport Street Circuit",
    location: "Berlin, Germany",
    lat: 52.4736,
    lon: 13.4017,
    aliases: ["Tempelhof", "Berlin"],
  },
  {
    id: "sanya",
    name: "Sanya Street Circuit",
    location: "Sanya, China",
    lat: 18.355,
    lon: 109.73694,
    aliases: ["Sanya", "Haitang Bay"],
  },
  {
    id: "tokyo",
    name: "Tokyo Street Circuit",
    location: "Tokyo, Japan",
    lat: 35.63333,
    lon: 139.80056,
    aliases: ["Tokyo", "Tokyo Street Circuit", "Tokyo Big Sight"],
  },
  {
    id: "excel-london",
    name: "ExCeL London Circuit",
    location: "London, United Kingdom",
    lat: 51.5081,
    lon: 0.0298,
    aliases: ["ExCeL", "ExCeL London", "London"],
  },

  // IndyCar. sportstimes has no location and 0 lat/lon, so these match the Round name and slug.
  // A few Round names carry only a sponsor ("Good Ranchers 250"); their full names are aliases and must be
  // checked each season — a stale one fails loudly (unknown Circuit), it never matches a different venue.
  {
    id: "st-petersburg",
    name: "Streets of St. Petersburg",
    location: "St. Petersburg, United States",
    lat: 27.7663,
    lon: -82.6293,
    aliases: ["St. Petersburg", "St Petersburg", "Saint Petersburg"],
  },
  {
    id: "phoenix",
    name: "Phoenix Raceway",
    location: "Avondale, United States",
    lat: 33.3748,
    lon: -112.3112,
    aliases: ["Phoenix", "Phoenix Raceway", "Avondale", "Good Ranchers 250"],
  },
  {
    id: "arlington",
    name: "Streets of Arlington",
    location: "Arlington, United States",
    lat: 32.748,
    lon: -97.088,
    aliases: ["Arlington", "Streets of Arlington", "Arlington Street Circuit"],
  },
  {
    id: "barber",
    name: "Barber Motorsports Park",
    location: "Birmingham, United States",
    lat: 33.5323,
    lon: -86.6193,
    aliases: ["Barber", "Barber Motorsports Park", "Alabama", "Birmingham"],
  },
  {
    id: "long-beach",
    name: "Streets of Long Beach",
    location: "Long Beach, United States",
    lat: 33.765,
    lon: -118.189,
    aliases: ["Long Beach", "Streets of Long Beach"],
  },
  {
    // Road course (Sonsio Grand Prix) and oval (Indianapolis 500) are one Circuit.
    id: "indianapolis",
    name: "Indianapolis Motor Speedway",
    location: "Speedway, United States",
    lat: 39.795,
    lon: -86.2347,
    aliases: ["Indianapolis", "Indianapolis Motor Speedway", "Indy 500", "Sonsio Grand Prix"],
  },
  {
    id: "detroit",
    name: "Streets of Detroit",
    location: "Detroit, United States",
    lat: 42.329,
    lon: -83.04,
    aliases: ["Detroit", "Streets of Detroit"],
  },
  {
    id: "gateway",
    name: "World Wide Technology Raceway",
    location: "Madison, United States",
    lat: 38.6508,
    lon: -90.1362,
    aliases: ["World Wide Technology Raceway", "WWT Raceway", "Gateway", "Bommarito Automotive Group 500"],
  },
  {
    id: "road-america",
    name: "Road America",
    location: "Elkhart Lake, United States",
    lat: 43.7979,
    lon: -87.9897,
    aliases: ["Road America", "Elkhart Lake"],
  },
  {
    id: "mid-ohio",
    name: "Mid-Ohio Sports Car Course",
    location: "Lexington, United States",
    lat: 40.6893,
    lon: -82.6365,
    aliases: ["Mid-Ohio", "midohio", "Mid-Ohio Sports Car Course"],
  },
  {
    id: "nashville-superspeedway",
    name: "Nashville Superspeedway",
    location: "Lebanon, United States",
    lat: 36.045,
    lon: -86.412,
    aliases: ["Nashville Superspeedway", "Borchetta Bourbon Music City Grand Prix"],
  },
  {
    id: "portland",
    name: "Portland International Raceway",
    location: "Portland, United States",
    lat: 45.5953,
    lon: -122.6935,
    aliases: ["Portland", "Portland International Raceway"],
  },
  {
    id: "markham",
    name: "Streets of Markham",
    location: "Markham, Canada",
    lat: 43.856,
    lon: -79.309,
    aliases: ["Markham", "Streets of Markham"],
  },
  {
    id: "washington-dc",
    name: "Washington Street Circuit",
    location: "Washington, United States",
    lat: 38.8889,
    lon: -77.023,
    aliases: ["Washington DC", "Washington D.C.", "Washington Street Circuit"],
  },
  {
    id: "milwaukee",
    name: "Milwaukee Mile",
    location: "West Allis, United States",
    lat: 43.0195,
    lon: -88.0128,
    aliases: ["Milwaukee Mile", "Milwaukee", "West Allis", "Snap-on Makers and Fixers 250"],
  },
  {
    id: "laguna-seca",
    name: "WeatherTech Raceway Laguna Seca",
    location: "Monterey, United States",
    lat: 36.5844,
    lon: -121.7534,
    aliases: ["Laguna Seca", "Monterey"],
  },

  // MotoGP. Matched by sportstimes coordinates (nearestCircuit); the aliases cover its `track` text.
  // Also shared: COTA, Le Mans (MotoGP uses the Bugatti Circuit at the same venue), Catalunya, Silverstone,
  // Red Bull Ring, Sepang, Lusail, Portimão.
  {
    id: "buriram",
    name: "Chang International Circuit",
    location: "Buriram, Thailand",
    lat: 14.958,
    lon: 103.0847,
    aliases: ["Buriram", "Chang International Circuit"],
  },
  {
    id: "goiania",
    name: "Autódromo Internacional de Goiânia",
    location: "Goiânia, Brazil",
    lat: -16.7193,
    lon: -49.1923,
    aliases: ["Goiânia", "Goiania", "Autódromo Internacional de Goiânia"],
  },
  {
    id: "jerez",
    name: "Circuito de Jerez – Ángel Nieto",
    location: "Jerez de la Frontera, Spain",
    lat: 36.7083,
    lon: -6.0342,
    aliases: ["Jerez", "Circuito de Jerez"],
  },
  {
    id: "mugello",
    name: "Autodromo Internazionale del Mugello",
    location: "Scarperia e San Piero, Italy",
    lat: 43.9975,
    lon: 11.3719,
    aliases: ["Mugello"],
  },
  {
    id: "balaton-park",
    name: "Balaton Park Circuit",
    location: "Balatonfőkajár, Hungary",
    lat: 47.0076,
    lon: 18.1972,
    aliases: ["Balaton Park", "Balaton"],
  },
  {
    id: "brno",
    name: "Automotodrom Brno",
    location: "Brno, Czechia",
    lat: 49.2033,
    lon: 16.4444,
    aliases: ["Brno", "Automotodrom Brno"],
  },
  {
    id: "assen",
    name: "TT Circuit Assen",
    location: "Assen, Netherlands",
    lat: 52.9617,
    lon: 6.5236,
    aliases: ["Assen", "TT Circuit Assen"],
  },
  {
    id: "sachsenring",
    name: "Sachsenring",
    location: "Hohenstein-Ernstthal, Germany",
    lat: 50.7917,
    lon: 12.6889,
    aliases: ["Sachsenring"],
  },
  {
    id: "aragon",
    name: "MotorLand Aragón",
    location: "Alcañiz, Spain",
    lat: 41.0803,
    lon: -0.2044,
    aliases: ["MotorLand Aragón", "Aragón", "Aragon", "Alcañiz"],
  },
  {
    id: "misano",
    name: "Misano World Circuit Marco Simoncelli",
    location: "Misano Adriatico, Italy",
    lat: 43.9614,
    lon: 12.6833,
    aliases: ["Misano", "Misano World Circuit"],
  },
  {
    id: "motegi",
    name: "Mobility Resort Motegi",
    location: "Motegi, Japan",
    lat: 36.5328,
    lon: 140.2275,
    aliases: ["Motegi", "Twin Ring Motegi", "Mobility Resort Motegi"],
  },
  {
    id: "mandalika",
    name: "Pertamina Mandalika International Circuit",
    location: "Mandalika, Indonesia",
    lat: -8.89528,
    lon: 116.30583,
    hasRadarCoverage: false,
    aliases: ["Mandalika", "Pertamina Mandalika Circuit"],
  },
  {
    id: "phillip-island",
    name: "Phillip Island Grand Prix Circuit",
    location: "Phillip Island, Australia",
    lat: -38.50306,
    lon: 145.23639,
    aliases: ["Phillip Island"],
  },
  {
    id: "valencia",
    name: "Circuit Ricardo Tormo",
    location: "Cheste, Spain",
    lat: 39.485,
    lon: -0.6281,
    aliases: ["Ricardo Tormo", "Circuit Ricardo Tormo", "Valencia", "Cheste"],
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

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** The known Circuit closest to a point, with its distance. Callers decide how far is too far. */
export function nearestCircuit(lat: number, lon: number): { circuit: Circuit; km: number } | null {
  let best: { circuit: Circuit; km: number } | null = null;
  for (const circuit of CIRCUITS) {
    const km = distanceKm(lat, lon, circuit.lat, circuit.lon);
    if (!best || km < best.km) best = { circuit, km };
  }
  return best;
}

/** The country part of a Circuit's "City, Country" location. */
export function circuitCountry(circuit: Circuit): string {
  return circuit.location.split(", ").at(-1) ?? "";
}
