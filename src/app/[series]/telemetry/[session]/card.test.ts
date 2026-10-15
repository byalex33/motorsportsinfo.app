import { describe, expect, it } from "vitest";
import { canonicalTelemetryQuery, canonicalTelemetryRedirect, canonicalTelemetryUrl, comparisonCardQuery, DATA_QUERY_KEYS, IMAGE_QUERY_KEYS } from "./card";

describe("comparisonCardQuery", () => {
  it("gives a bare link no comparison card, so its preview can't spoil the result", () => {
    expect(comparisonCardQuery({})).toBeNull();
    expect(comparisonCardQuery({ ch: "throttle", ca: "ff0000" })).toBeNull();
  });

  it("needs both drivers named", () => {
    expect(comparisonCardQuery({ a: "VER" })).toBeNull();
    expect(comparisonCardQuery({ b: "LEC" })).toBeNull();
  });

  it("ignores anything that isn't a driver code", () => {
    expect(comparisonCardQuery({ a: "VER", b: "LECLERC" })).toBeNull();
    expect(comparisonCardQuery({ a: ["VER", "NOR"], b: "LEC" })).toBeNull();
  });

  it("carries the pair, picked colours and a non-default channel into the share image's canonical query", () => {
    expect(comparisonCardQuery({ a: "VER", b: "LEC" })?.toString()).toBe("a=VER&b=LEC");
    expect(comparisonCardQuery({ a: "ver", b: "lec", ca: "FF00AA", cb: "nope", ch: "brake" })?.toString()).toBe("a=VER&b=LEC&ca=ff00aa&ch=brake");
    expect(comparisonCardQuery({ a: "VER", b: "LEC", ch: "speed" })?.toString()).toBe("a=VER&b=LEC");
  });
});

describe("canonicalTelemetryQuery", () => {
  it("lists the keys in a fixed order", () => {
    expect(canonicalTelemetryQuery({ ch: "gear", cb: "00ff00", b: "LEC", ca: "ff0000", a: "VER" }, IMAGE_QUERY_KEYS).toString()).toBe("a=VER&b=LEC&ca=ff0000&cb=00ff00&ch=gear");
  });

  it("uppercases driver codes and lowercases colours, without the #", () => {
    expect(canonicalTelemetryQuery({ a: "ver", b: "Lec", ca: "#FF00AA" }, IMAGE_QUERY_KEYS).toString()).toBe("a=VER&b=LEC&ca=ff00aa");
  });

  it("drops other keys, and keys it wasn't asked for", () => {
    expect(canonicalTelemetryQuery({ a: "VER", b: "LEC", x: "1", utm_source: "x" }, IMAGE_QUERY_KEYS).toString()).toBe("a=VER&b=LEC");
    expect(canonicalTelemetryQuery({ a: "VER", b: "LEC", ca: "ff0000", ch: "brake" }, DATA_QUERY_KEYS).toString()).toBe("a=VER&b=LEC");
  });

  it("drops invalid values and the default channel", () => {
    expect(canonicalTelemetryQuery({ a: "VERS", b: ["LEC", "NOR"], ca: "red", cb: "12345", ch: "rpm" }, IMAGE_QUERY_KEYS).toString()).toBe("");
    expect(canonicalTelemetryQuery({ a: "VER", ch: "speed" }, IMAGE_QUERY_KEYS).toString()).toBe("a=VER");
  });
});

describe("canonicalTelemetryUrl", () => {
  const url = (search: string) => new URL(`https://motorsportsinfo.app/f1/telemetry/race/image${search}`);

  it("leaves a canonical URL alone", () => {
    expect(canonicalTelemetryUrl(url("?a=VER&b=LEC&ch=brake"), IMAGE_QUERY_KEYS)).toBeNull();
    expect(canonicalTelemetryUrl(url(""), IMAGE_QUERY_KEYS)).toBeNull();
  });

  it("rewrites any other spelling of the same query", () => {
    expect(canonicalTelemetryUrl(url("?b=lec&a=VER&x=1"), IMAGE_QUERY_KEYS)?.search).toBe("?a=VER&b=LEC");
    expect(canonicalTelemetryUrl(url("?a=VER&b=LEC&"), IMAGE_QUERY_KEYS)?.search).toBe("?a=VER&b=LEC");
    expect(canonicalTelemetryUrl(url("?x=1"), IMAGE_QUERY_KEYS)?.search).toBe("");
    expect(canonicalTelemetryUrl(url("?a=VER&b=LEC&ch=throttle"), DATA_QUERY_KEYS)?.search).toBe("?a=VER&b=LEC");
  });
});

describe("canonicalTelemetryRedirect", () => {
  it("sends a non-canonical request to the canonical URL for good", () => {
    const res = canonicalTelemetryRedirect(new Request("https://motorsportsinfo.app/f1/telemetry/race/image?b=lec&a=VER&x=1"), IMAGE_QUERY_KEYS);
    expect(res?.status).toBe(308);
    expect(res?.headers.get("Location")).toBe("/f1/telemetry/race/image?a=VER&b=LEC");
    expect(res?.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("lets a canonical request through", () => {
    expect(canonicalTelemetryRedirect(new Request("https://motorsportsinfo.app/f1/telemetry/race/data?a=VER&b=LEC"), DATA_QUERY_KEYS)).toBeNull();
  });
});
