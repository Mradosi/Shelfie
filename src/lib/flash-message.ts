import type { AstroCookies } from "astro";

const FLASH_COOKIE_NAME = "shelfie_flash";
const FLASH_MAX_AGE_SECONDS = 60;

export type FlashMessageKind = "error" | "success";

export interface FlashMessage {
  kind: FlashMessageKind;
  message: string;
}

export function setFlashMessage(cookies: AstroCookies, flash: FlashMessage) {
  cookies.set(FLASH_COOKIE_NAME, JSON.stringify(flash), {
    httpOnly: true,
    maxAge: FLASH_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
  });
}

export function consumeFlashMessage(cookies: AstroCookies): FlashMessage | null {
  const cookie = cookies.get(FLASH_COOKIE_NAME);
  cookies.delete(FLASH_COOKIE_NAME, { path: "/" });

  if (!cookie) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(cookie.value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "kind" in parsed &&
      "message" in parsed &&
      (parsed.kind === "error" || parsed.kind === "success") &&
      typeof parsed.message === "string"
    ) {
      return parsed;
    }
  } catch {
    // Ignore a malformed, stale cookie and continue without a message.
  }

  return null;
}
