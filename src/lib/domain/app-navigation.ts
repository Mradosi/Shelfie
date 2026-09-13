import { isUserProfileComplete, type UserProfile } from "@/lib/domain/user-domain";

export function getRootRedirectPath(isAuthenticated: boolean) {
  return isAuthenticated ? "/start" : null;
}

export function getStartRedirectPath(profile: Pick<UserProfile, "skinType" | "skinAspects"> | null) {
  return isUserProfileComplete(profile) ? "/today" : "/onboarding/skin-profile";
}
