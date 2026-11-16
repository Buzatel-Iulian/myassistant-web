import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { CircleAlert } from "lucide-react";
import { toast } from "sonner";

import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/useHydrated";
import { login, register } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/store/useAuthStore";

export function RegisterPage() {
  const hydrated = useHydrated();
  const token = useAuthStore(state => state.token);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (hydrated && token) return <Navigate to="/chat" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const user = await register({ email, password, displayName });
      toast.success(`Welcome, ${user.displayName}! Your account is ready.`);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setSubmitting(false);
      // 409 is about the email ("An account with this email already exists."), so it goes next to that field.
      if (error.status === 409) setFieldErrors({ email: error.detail });
      else if (Object.keys(error.fieldErrors).length > 0) setFieldErrors(error.fieldErrors);
      else setFormError(error.detail);
      return;
    }

    // The API's register does not log in. Logging in right away with the same credentials lands the new user on
    // the chat page; the token change redirects (see the Navigate above).
    try {
      useAuthStore.getState().login(await login({ email, password }));
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setSubmitting(false);
      setFormError(`Your account was created, but logging in failed: ${error.detail} Log in to continue.`);
    }
  }

  return (
    <AuthCard
      title="Create an account"
      description="Your assistants and templates are saved to your account. Your chats stay in this browser."
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Log in
          </Link>
        </span>
      }
    >
      {/* noValidate: the API's rules are the only rules, and its messages appear next to the fields. */}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <FormField
          id="displayName"
          label="Name"
          autoComplete="name"
          value={displayName}
          onChange={event => setDisplayName(event.target.value)}
          error={fieldErrors.displayName}
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          error={fieldErrors.email}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          error={fieldErrors.password}
          placeholder="At least 8 characters"
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
