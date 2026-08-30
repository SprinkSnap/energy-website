"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Plus, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/roles";

export function PortalHeader() {
  const { user, logout, isStaff } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const inAdmin = pathname?.startsWith("/portal/admin");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLogo layout="auto" size="md" />
        <nav className="hidden items-center gap-4 text-sm font-medium md:flex" aria-label="Portal">
          <Link
            className={inAdmin ? "text-charcoal font-semibold" : "text-muted-foreground hover:text-charcoal"}
            href={isStaff ? "/portal/admin" : "/portal"}
          >
            {isStaff ? "Clients" : "Dashboard"}
          </Link>
          {!inAdmin ? (
            <Link className="text-muted-foreground hover:text-charcoal" href="/portal">
              My projects
            </Link>
          ) : null}
          <Link className="text-muted-foreground hover:text-charcoal" href="/services">
            Services
          </Link>
          <Link className="text-muted-foreground hover:text-charcoal" href="/contact">
            Support
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline">
            {user?.name}
            {isStaff ? ` · ${ROLE_LABEL[user?.role ?? "employee"]}` : ""}
          </span>
          {isStaff ? (
            <LinkButton
              href="/portal/admin"
              variant={inAdmin ? "brand" : "outline"}
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Users className="size-4" />
              Clients
            </LinkButton>
          ) : null}
          {!inAdmin ? (
            <LinkButton href="/portal/projects/new" variant="brand" size="sm" className="hidden sm:inline-flex">
              <Plus className="size-4" />
              New project
            </LinkButton>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void logout().then(() => router.push("/"));
            }}
          >
            <LogOut className="size-4" />
            <span className="sr-only sm:not-sr-only">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
