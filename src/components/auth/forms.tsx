"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  type FormState,
  requestPasswordReset,
  resendConfirmation,
  setNewPassword,
  signInWithPassword,
  signUp,
} from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";

const initial: FormState = {};

function FormMessages({ state }: { state: FormState }) {
  if (state.error)
    return (
      <Alert variant="destructive" aria-live="assertive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  if (state.message)
    return (
      <Alert variant="success" aria-live="polite">
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInWithPassword, initial);
  return (
    <>
      <form action={action} className="grid gap-4" noValidate>
        <FormMessages state={state} />
        <input type="hidden" name="next" value={next ?? "/home"} />
        <FormField id="email" label="Email" error={state.fieldErrors?.email}>
          <Input name="email" type="email" autoComplete="email" inputMode="email" required />
        </FormField>
        <FormField id="password" label="Password" error={state.fieldErrors?.password}>
          <PasswordInput name="password" autoComplete="current-password" required />
        </FormField>
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton size="lg" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
      {state.needsConfirmation && <ResendConfirmationForm email={state.needsConfirmation} />}
    </>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signUp, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessages state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="firstName" label="First name" error={state.fieldErrors?.firstName}>
          <Input name="firstName" autoComplete="given-name" required />
        </FormField>
        <FormField id="lastName" label="Surname" error={state.fieldErrors?.lastName}>
          <Input name="lastName" autoComplete="family-name" required />
        </FormField>
      </div>
      <FormField id="email" label="Email" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </FormField>
      <FormField
        id="password"
        label="Password"
        error={state.fieldErrors?.password}
        hint="At least 8 characters, with a letter and a number."
      >
        <PasswordInput name="password" autoComplete="new-password" required />
      </FormField>
      <FormField id="confirmPassword" label="Repeat password" error={state.fieldErrors?.confirmPassword}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" required />
      </FormField>
      <SubmitButton size="lg" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmation, initial);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="email" value={email} />
      <FormMessages state={state} />
      <SubmitButton variant="outline" pendingText="Sending…">
        Send the confirmation email again
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessages state={state} />
      <FormField id="email" label="Email" error={state.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" required />
      </FormField>
      <SubmitButton size="lg" pendingText="Sending…">
        Email me a reset link
      </SubmitButton>
    </form>
  );
}

export function SetPasswordForm() {
  const [state, action] = useActionState(setNewPassword, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessages state={state} />
      <FormField
        id="password"
        label="New password"
        error={state.fieldErrors?.password}
        hint="At least 8 characters, with a letter and a number."
      >
        <PasswordInput name="password" autoComplete="new-password" required />
      </FormField>
      <FormField id="confirmPassword" label="Repeat new password" error={state.fieldErrors?.confirmPassword}>
        <PasswordInput name="confirmPassword" autoComplete="new-password" required />
      </FormField>
      <SubmitButton size="lg" pendingText="Saving…">
        Save password
      </SubmitButton>
    </form>
  );
}
