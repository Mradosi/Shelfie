import type { APIRoute } from "astro";
import { setFlashMessage } from "@/lib/flash-message";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    setFlashMessage(context.cookies, { kind: "error", message: "Supabase nie jest skonfigurowane" });
    return context.redirect("/auth/signup");
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    setFlashMessage(context.cookies, { kind: "error", message: error.message });
    return context.redirect("/auth/signup");
  }

  return context.redirect("/auth/confirm-email");
};
