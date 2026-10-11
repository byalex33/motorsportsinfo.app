import { describe, expect, it } from "vitest";
import { comparisonCardQuery } from "./card";

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

  it("carries the pair, picked colours and a non-default channel into the share image's query", () => {
    expect(comparisonCardQuery({ a: "VER", b: "LEC" })?.toString()).toBe("a=VER&b=LEC");
    expect(comparisonCardQuery({ a: "ver", b: "lec", ca: "FF00AA", cb: "nope", ch: "brake" })?.toString()).toBe("a=ver&b=lec&ca=ff00aa&ch=brake");
    expect(comparisonCardQuery({ a: "VER", b: "LEC", ch: "speed" })?.toString()).toBe("a=VER&b=LEC");
  });
});
