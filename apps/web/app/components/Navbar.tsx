"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/auth";
import NotificationsBell from "./NotificationsBell";
import { NAV_LINKS, ROLE_LABELS } from "../lib/rbac";

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MOON SERVICES";

export default function Navbar() {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const visibleLinks = user
    ? NAV_LINKS.filter((item) => item.roles.includes(user.role))
    : [];

  useEffect(() => {
    for (const link of visibleLinks) {
      router.prefetch(link.href);
    }
  }, [router, visibleLinks]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-10">
        <Link
          href="/dashboard"
          className="mr-2 inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-2.5 py-1.5"
        >
          <img src="/LOGO IMO.jpg" alt="Logo" className="h-6 w-6 rounded-md border border-teal-200 bg-white p-0.5" />
          <span className="text-sm font-semibold text-teal-900">{BRAND_NAME}</span>
        </Link>

        {visibleLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`rounded-lg border px-3 py-1 text-sm font-semibold transition-colors ${
              pathname === href
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-300 text-slate-800 hover:bg-slate-100"
            }`}
          >
            {label}
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-3">
          {isLoading ? null : user ? (
            <>
              <NotificationsBell />
              <span className="hidden text-xs text-slate-500 sm:block">
                {user.fullName}{" "}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Connexion
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
