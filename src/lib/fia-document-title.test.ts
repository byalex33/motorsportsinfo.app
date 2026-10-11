import { describe, expect, it } from "vitest";
import { CAR_NUMBER, hideCarNumbers, titleFromFile } from "./fia-document-title";

describe("hideCarNumbers", () => {
  it("hides every car number", () => {
    expect(hideCarNumbers("Infringement – Car 27 – Impeding of Car 55")).toBe("Infringement – Car # – Impeding of Car #");
    expect(hideCarNumbers("DECISION - car 15 - alleged yellow flag violation")).toBe("DECISION - Car # - alleged yellow flag violation");
  });

  it("leaves other titles alone", () => {
    expect(hideCarNumbers("Final Qualifying Classification")).toBe("Final Qualifying Classification");
  });
});

describe("CAR_NUMBER", () => {
  it("splits a title with the car numbers at the odd indexes", () => {
    expect("Infringement – Car 27 – Impeding of Car 55".split(CAR_NUMBER)).toEqual(["Infringement – ", "Car 27", " – Impeding of ", "Car 55", ""]);
  });
});

describe("titleFromFile", () => {
  it("makes a readable title from the file name", () => {
    expect(titleFromFile("2026_baku_event_-_entry_list.pdf")).toBe("Baku event – entry list");
  });
});
