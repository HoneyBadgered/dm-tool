import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "#", label: "Combat" },
  { href: "#", label: "NPCs & Encounters" },
  { href: "#", label: "World Board" },
  { href: "#", label: "Story" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-border bg-forest text-white md:w-56 md:border-b-0 md:border-r">
        <div className="px-4 py-3 text-lg font-semibold">DM Tool</div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="whitespace-nowrap rounded px-3 py-1.5 text-sm hover:bg-forest-dark"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
