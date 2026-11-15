import Link from "next/link";
import { requireUser } from "@/lib/auth";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "DCCW Golf";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links: [string, string][] = [
    ["/", "Home"],
    ["/my-trips", "My Trips"],
    ["/profile", "Profile"],
  ];
  if (user.isAdmin) links.push(["/admin", "Admin"]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-brand text-white">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-3">
          <Link href="/" className="mr-3 shrink-0 font-serif text-lg font-semibold tracking-tight">
            {siteName}
          </Link>
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
            >
              {label}
            </Link>
          ))}
          <form action="/auth/signout" method="post" className="ml-auto shrink-0">
            <button className="rounded-md px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
