import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { CircleAlert, Clock } from "lucide-react";
import { toast } from "@/lib/toast";

import { AuthCard } from "@/components/auth/AuthCard";
import { returnPathFrom } from "@/components/auth/returnPath";
import { FormField } from "@/components/auth/FormField";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/useHydrated";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { reportUnexpected } from "@/lib/unexpected";
import { useAuthStore } from "@/store/useAuthStore";

const INVALID_CREDENTIALS = "Invalid email or password.";

export function LoginPage() {
  const hydrated = useHydrated();
  const token = useAuthStore(state => state.token);
  const sessionExpired = useAuthStore(state => state.logoutReason === "expired");
  const location = useLocation();
  const returnPath = returnPathFrom(location.state);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Logging in sets the token, and this redirect takes the user in: one path for "already logged in" and "just
  // logged in".
  if (hydrated && token) return <Navigate to={returnPath} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const session = await login({ email, password });
      toast.success("Welcome back!");
      useAuthStore.getState().login(session);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(reportUnexpected("Login failed:", error));
        return;
      }
      setFieldErrors(error.fieldErrors);
      // The API sends the same detail for a wrong password and an unknown email; the constant covers a 401 that
      // comes without it.
      if (error.status === 401) setFormError(error.detail || INVALID_CREDENTIALS);
      else if (Object.keys(error.fieldErrors).length === 0) setFormError(error.detail);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Log in"
      description="Welcome back. Log in to chat with your assistants."
      footer={
        <span>
          No account yet?{" "}
          {/* The return path goes along, so registering also ends on the page that was asked for (QA-7-3). */}
          <Link
            to="/register"
            state={location.state}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create one
          </Link>
        </span>
      }
    >
      {/* noValidate: the API's rules are the only rules, and its messages appear next to the fields. */}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {sessionExpired && !formError && (
          <Alert data-testid="session-expired">
            <Clock />
            <AlertTitle>Your session has expired</AlertTitle>
            <AlertDescription>For your security a login lasts a few hours. Log in again to continue.</AlertDescription>
          </Alert>
        )}
        {formError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
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
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthCard>
  );
}
