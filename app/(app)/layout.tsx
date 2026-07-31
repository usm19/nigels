import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const nav = [
    ["Dashboard", "/dashboard"],
    ["Contracts", "/contracts"],
    ["Payers", "/payers"],
    ["Letters", "/letters"],
    ["Alerts", "/alerts"],
    ["Export", "/export"],
  ] as const;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              Moiety
            </Link>
            <nav className="flex gap-5 text-sm text-neutral-600">
              {nav.map(([label, href]) => (
                <Link key={href} href={href} className="hover:text-neutral-900">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-neutral-500">
            <span>{user.organisationName}</span>
            <form action={logout}>
              <button className="underline hover:text-neutral-900">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
