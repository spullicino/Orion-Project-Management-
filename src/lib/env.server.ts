import "server-only";

/** Server-only secrets. Never import this file from a client component. */
export const serverEnv = {
  supabaseSecretKey: (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
  /** The first person to sign in with this email becomes the Administrator (only while no admin exists). */
  bootstrapAdminEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase(),
};
