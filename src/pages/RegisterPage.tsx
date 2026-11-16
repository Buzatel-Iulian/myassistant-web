// Outside the app layout: a visitor who is not logged in has no sidebar to use.
export function RegisterPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-semibold">Create an account</h1>
    </main>
  );
}
