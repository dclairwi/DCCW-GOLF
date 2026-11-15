const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "DCCW Golf";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-brand px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center font-serif text-2xl font-semibold tracking-tight text-white">{siteName}</p>
        <div className="card">{children}</div>
        <p className="mt-6 text-center text-xs text-white/60">Private site — members by invitation only.</p>
      </div>
    </main>
  );
}
