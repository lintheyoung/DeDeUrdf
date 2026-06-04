import { describe, expect, it } from "vitest";
import { APP_DESCRIPTION, APP_NAME, PRIVACY_SUMMARY } from "./app-info";

describe("app info", () => {
  it("uses DeDeUrdf as the public brand and documents browser-only privacy", () => {
    expect(APP_NAME).toBe("DeDeUrdf");
    expect(APP_DESCRIPTION).toContain("URDF");
    expect(APP_DESCRIPTION).toContain("MuJoCo");
    expect(PRIVACY_SUMMARY.toLowerCase()).toContain("browser");
  });
});
