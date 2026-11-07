import { describe, expect, it } from "vitest";
import { CAR_NUMBER } from "./fia-document-title";

describe("CAR_NUMBER", () => {
  it("splits a title with the car numbers at the odd indexes", () => {
    expect("Infringement – Car 27 – Impeding of Car 55".split(CAR_NUMBER)).toEqual(["Infringement – ", "Car 27", " – Impeding of ", "Car 55", ""]);
  });
});
