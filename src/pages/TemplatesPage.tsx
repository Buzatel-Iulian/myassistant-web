export function TemplatesPage() {
  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold">Templates</h1>
      <p className="text-muted-foreground">Your reusable system prompts with {"{{variables}}"}.</p>
    </div>
  );
}
