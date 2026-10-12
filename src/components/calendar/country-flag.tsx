// Only the flags of countries with a Circuit are imported, so the bundle carries ~40 small SVGs, not 250.
import {
  AE, AT, AU, AZ, BE, BH, BR, CA, CL, CN, CZ, DE, EE, ES, FI, FR, GB, GR, HR, HU, ID, IT, JP, KE, MC, MX, MY, NL, PT, PY, QA, SA, SE, SG, TH, TR, US,
} from "country-flag-icons/react/3x2";
import { FlagIcon } from "lucide-react";
import type { CountryCode } from "@/lib/country-code";
import { cn } from "@/lib/utils";

const FLAGS: Record<CountryCode, typeof GB> = {
  AE, AT, AU, AZ, BE, BH, BR, CA, CL, CN, CZ, DE, EE, ES, FI, FR, GB, GR, HR, HU, ID, IT, JP, KE, MC, MX, MY, NL, PT, PY, QA, SA, SE, SG, TH, TR, US,
};

/** A 3:2 country flag, or a plain flag icon when the country is unknown. */
export function CountryFlag({ code, country, className }: { code: CountryCode | null; country: string; className?: string }) {
  const Flag = code ? FLAGS[code] : null;
  if (!Flag) {
    return (
      <span role="img" aria-label={country} className={cn("grid aspect-[3/2] place-items-center rounded-[3px] bg-muted", className)}>
        <FlagIcon aria-hidden className="size-1/2 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span role="img" aria-label={country} className={cn("block aspect-[3/2] overflow-hidden rounded-[3px] ring-1 ring-foreground/10", className)}>
      <Flag aria-hidden className="block size-full" />
    </span>
  );
}
