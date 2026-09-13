import { describe, expect, it } from "vitest";
import { getRootRedirectPath, getStartRedirectPath } from "@/lib/domain/app-navigation";

const completeProfile = {
  skinType: "normal" as const,
  skinAspects: {
    sensitivity: "low" as const,
    pigmentation: "none" as const,
    firmness: "low" as const,
    breakouts: "medium" as const,
    texture: "low" as const,
  },
};

describe("authenticated app entry", () => {
  it("keeps the public landing page available to anonymous visitors", () => {
    expect(getRootRedirectPath(false)).toBeNull();
  });

  it("sends an authenticated visitor through the profile-aware start route", () => {
    expect(getRootRedirectPath(true)).toBe("/start");
  });

  it("sends a completed profile to Today and an incomplete profile to onboarding", () => {
    expect(getStartRedirectPath(completeProfile)).toBe("/today");
    expect(getStartRedirectPath(null)).toBe("/onboarding/skin-profile");
  });
});
