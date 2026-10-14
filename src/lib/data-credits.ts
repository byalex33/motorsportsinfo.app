import type { SeriesId } from "@/domain/types";

export interface DataCredit {
  label: string;
  href: string;
}

const SPORTSTIMES: DataCredit = { label: "sportstimes/f1", href: "https://github.com/sportstimes/f1" };

/** Where each Series' schedule comes from (ADR 0001). */
export const DATA_CREDITS: Record<SeriesId, DataCredit> = {
  f1: { label: "OpenF1", href: "https://openf1.org" },
  f2: { label: "FIA Formula 2", href: "https://www.fiaformula2.com" },
  f3: { label: "FIA Formula 3", href: "https://www.fiaformula3.com" },
  wec: { label: "FIA WEC", href: "https://www.fiawec.com" },
  fe: SPORTSTIMES,
  indycar: SPORTSTIMES,
  motogp: SPORTSTIMES,
  "f1-academy": SPORTSTIMES,
  wrc: { label: "WRC", href: "https://www.wrc.com" },
  imsa: { label: "IMSA", href: "https://www.imsa.com" },
  nascar: { label: "NASCAR", href: "https://www.nascar.com" },
  "gtwc-europe": { label: "GT World Challenge Europe", href: "https://www.gt-world-challenge-europe.com" },
  dtm: { label: "DTM", href: "https://www.dtm.com" },
  "super-gt": { label: "Super GT", href: "https://supergt.net" },
};
