// ISO 3166-1 alpha-2 codes for the countries Circuits are in, keyed by the country name used in each
// Circuit's "City, Country" location. Every Circuit must resolve (see country-code.test.ts).
import { circuitCountry } from "@/data/circuits";
import type { Circuit } from "@/domain/types";

export const COUNTRY_CODES = {
  Australia: "AU",
  Austria: "AT",
  Azerbaijan: "AZ",
  Bahrain: "BH",
  Belgium: "BE",
  Brazil: "BR",
  Canada: "CA",
  Chile: "CL",
  China: "CN",
  Croatia: "HR",
  Czechia: "CZ",
  Estonia: "EE",
  Finland: "FI",
  France: "FR",
  Germany: "DE",
  Greece: "GR",
  Hungary: "HU",
  Indonesia: "ID",
  Italy: "IT",
  Japan: "JP",
  Kenya: "KE",
  Malaysia: "MY",
  Mexico: "MX",
  Monaco: "MC",
  Netherlands: "NL",
  Paraguay: "PY",
  Portugal: "PT",
  Qatar: "QA",
  "Saudi Arabia": "SA",
  Singapore: "SG",
  Spain: "ES",
  Sweden: "SE",
  Thailand: "TH",
  Turkey: "TR",
  "United Arab Emirates": "AE",
  "United Kingdom": "GB",
  "United States": "US",
} as const;

export type CountryCode = (typeof COUNTRY_CODES)[keyof typeof COUNTRY_CODES];

/** The Circuit's country as an ISO code, or null for a country not in the list. */
export function circuitCountryCode(circuit: Circuit): CountryCode | null {
  const country = circuitCountry(circuit);
  return Object.hasOwn(COUNTRY_CODES, country) ? COUNTRY_CODES[country as keyof typeof COUNTRY_CODES] : null;
}
