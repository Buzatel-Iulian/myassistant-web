// Outside the app layout: a visitor who is not logged in has no sidebar to use.
export function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-semibold">Log in</h1>
    </main>
  );
}
