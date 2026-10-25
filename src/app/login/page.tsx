export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form method="POST" action="/api/auth/login" className="card w-full max-w-sm space-y-3 p-6">
        <div>
          <div className="text-sm font-bold">CREATIVE INTELLIGENCE OS</div>
          <p className="sub">Enter the team access password.</p>
        </div>
        <input type="hidden" name="next" value={next ?? "/"} />
        <input type="password" name="password" required autoFocus className="input w-full" placeholder="Password" />
        {error && <p className="text-sm text-kill">Wrong password.</p>}
        <button className="btn-primary w-full">Sign in</button>
      </form>
    </div>
  );
}
