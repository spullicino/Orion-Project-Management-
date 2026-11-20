"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/remember";
import { maybeBootstrapAdmin } from "@/lib/auth/bootstrap";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/utils";
import {
  emailSchema,
  forgotPasswordSchema,
  loginSchema,
  safeNextPath,
  setPasswordSchema,
  signupSchema,
} from "@/lib/validation/auth";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  needsConfirmation?: string; // email that still needs confirming
};

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

export async function signInWithPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };
  const { email, password } = parsed.data;

  const ip = await clientIp();
  if (!(await rateLimit("login", `${ip}:${email}`))) return { error: TOO_MANY };

  // "Keep me signed in on this device" (ticked by default).
  const remember = formData.get("remember") === "on";
  const cookieStore = await cookies();
  if (remember) cookieStore.delete(SESSION_ONLY_COOKIE);
  else cookieStore.set(SESSION_ONLY_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });

  const supabase = await createClient({ sessionOnly: !remember });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Please confirm your email address first. Check your inbox for the link we sent you.",
        needsConfirmation: email,
      };
    }
    if (error.code === "user_banned") return { error: "This account has been deactivated. Please contact your administrator." };
    return { error: "Wrong email or password." };
  }
  await maybeBootstrapAdmin(data.user);
  redirect(safeNextPath(formData.get("next")));
}

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const site = await getSiteUrl();
  const next = safeNextPath(formData.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent("Google sign-in is not available right now.")}`);
  redirect(data.url);
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };
  const { email, password, firstName, lastName } = parsed.data;

  if (!(await rateLimit("signup", await clientIp()))) return { error: TOO_MANY };

  const supabase = await createClient();
  const site = await getSiteUrl();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${site}/auth/confirm?next=/home`,
      data: { first_name: firstName, last_name: lastName },
    },
  });
  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: error.message } };
    if (error.code === "over_email_send_rate_limit") return { error: TOO_MANY };
    console.error("sign-up failed", error.code, error.status, error.message);
    if (error.code === "signup_disabled") {
      return { error: "New sign-ups are switched off. Ask an administrator for an invitation." };
    }
    if (error.code === "email_address_not_authorized" || /sending (confirmation )?email/i.test(error.message)) {
      return {
        error:
          "We couldn't send the confirmation email. Email sending isn't fully set up yet — please tell your administrator. " +
          `(Details: ${error.message})`,
      };
    }
    if (/database error/i.test(error.message)) {
      return { error: `We couldn't create your account because of a database problem. (Details: ${error.message})` };
    }
    return { error: `We couldn't create your account. Please try again. (Details: ${error.message || error.code || "unknown"})` };
  }
  redirect(`/check-email?email=${encodeURIComponent(email)}`);
}

export async function resendConfirmation(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address" };
  if (!(await rateLimit("signup", `resend:${await clientIp()}`))) return { error: TOO_MANY };
  const supabase = await createClient();
  const site = await getSiteUrl();
  await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${site}/auth/confirm?next=/home` },
  });
  return { message: "If that account still needs confirming, a new link is on its way." };
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };
  if (!(await rateLimit("passwordReset", `${await clientIp()}:${parsed.data.email}`))) return { error: TOO_MANY };

  const supabase = await createClient();
  const site = await getSiteUrl();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${site}/auth/confirm?next=/auth/set-password`,
  });
  // Same answer whether or not the account exists (doesn't reveal who has an account).
  return { message: "If an account exists for that email, we've sent a link to reset your password." };
}

export async function setNewPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Your link has expired. Please request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Choose a password you haven't used before." } };
    return { error: error.message };
  }
  redirect("/home");
}
