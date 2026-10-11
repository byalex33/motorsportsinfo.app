import { describe, expect, it } from "vitest";
import { SERIES_IDS } from "@/domain/types";
import { config } from "../vercel";

interface RedirectRoute {
  src: string;
  caseSensitive: boolean;
  status: number;
  headers: { Location: string };
}
const routes = (config.routes ?? []) as RedirectRoute[];

function redirectFor(path: string, flags = ""): string | null {
  for (const route of routes) {
    if (new RegExp(route.src, flags).test(path)) return route.headers.Location;
  }
  return null;
}

describe("Series case redirects (vercel.ts)", () => {
  it("is one permanent, case-sensitive redirect per Series", () => {
    expect(routes.map((r) => r.headers.Location)).toEqual(SERIES_IDS.map((id) => `/${id}`));
    for (const r of routes) expect(r).toMatchObject({ caseSensitive: true, status: 308 });
  });

  it("sends upper- and mixed-case spellings to the lowercase Series page", () => {
    expect(redirectFor("/F1")).toBe("/f1");
    expect(redirectFor("/F3/")).toBe("/f3");
    expect(redirectFor("/WEC")).toBe("/wec");
    expect(redirectFor("/Wec")).toBe("/wec");
    expect(redirectFor("/FE")).toBe("/fe");
    expect(redirectFor("/Fe")).toBe("/fe");
    expect(redirectFor("/IndyCar")).toBe("/indycar");
    expect(redirectFor("/INDYCAR")).toBe("/indycar");
    expect(redirectFor("/MotoGP")).toBe("/motogp");
    expect(redirectFor("/motoGP")).toBe("/motogp");
  });

  it("never matches the lowercase pages or other paths", () => {
    for (const id of SERIES_IDS) {
      expect(redirectFor(`/${id}`)).toBeNull();
      expect(redirectFor(`/${id}/`)).toBeNull();
    }
    for (const path of ["/", "/F1/documents", "/FES", "/fe2", "/Feed", "/F12", "/alerts", "/About", "/api/cron/sync"]) {
      expect(redirectFor(path)).toBeNull();
    }
  });

  it("matches nothing if case were ignored, so it can never loop", () => {
    for (const path of ["/f1", "/F1", "/MotoGP", "/fe", "/FE"]) expect(redirectFor(path, "i")).toBeNull();
  });
});
