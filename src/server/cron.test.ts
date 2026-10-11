import { afterEach, describe, expect, it, vi } from "vitest";
import { isCronRequest } from "./cron";

const request = (authorization?: string) =>
  new Request("https://motorsportsinfo.app/api/cron/alerts", {
    headers: authorization === undefined ? {} : { authorization },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isCronRequest", () => {
  it("accepts the exact bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronRequest(request("Bearer s3cret"))).toBe(true);
  });

  it("rejects a missing, wrong or differently sized header", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronRequest(request())).toBe(false);
    expect(isCronRequest(request("Bearer s3creT"))).toBe(false);
    expect(isCronRequest(request("Bearer s3cret2"))).toBe(false);
    expect(isCronRequest(request("s3cret"))).toBe(false);
  });

  it("rejects everything while CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronRequest(request("Bearer "))).toBe(false);
    expect(isCronRequest(request("Bearer undefined"))).toBe(false);
  });
});
