"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { type ProfileState, updateProfile } from "@/app/(app)/profile/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Profile } from "@/types/database";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState<ProfileState, FormData>(updateProfile, {});
  useEffect(() => {
    if (state.ok) toast.success("Profile saved");
  }, [state]);

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="firstName" label="First name" error={state.fieldErrors?.firstName}>
          <Input name="firstName" defaultValue={profile.first_name} autoComplete="given-name" required />
        </FormField>
        <FormField id="lastName" label="Surname" error={state.fieldErrors?.lastName}>
          <Input name="lastName" defaultValue={profile.last_name} autoComplete="family-name" required />
        </FormField>
      </div>
      <FormField id="email" label="Email" hint="Your sign-in email. Ask an administrator to change it.">
        <Input value={profile.email} readOnly disabled />
      </FormField>
      <FormField id="phone" label="Phone (optional)" error={state.fieldErrors?.phone}>
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={profile.phone ?? ""} placeholder="+356 …" />
      </FormField>
      <div>
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
