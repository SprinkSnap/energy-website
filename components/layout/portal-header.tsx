"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { useAuth } from "@/lib/auth-context";

export function PortalHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLogo layout="auto" size="md" />
        <nav className="hidden items-center gap-4 text-sm font-medium md:flex" aria-label="Portal">
          <Link className="text-muted-foreground hover:text-charcoal" href="/portal">
            Dashboard
          </Link>
          <Link className="text-muted-foreground hover:text-charcoal" href="/services">
            Services
          </Link>
          <Link className="text-muted-foreground hover:text-charcoal" href="/contact">
            Support
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground sm:inline">
            {user?.name}
          </span>
          <LinkButton href="/portal/projects/new" variant="brand" size="sm" className="hidden sm:inline-flex">
            <Plus className="size-4" />
            New project
          </LinkButton>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              router.push("/");
            }}
          >
            <LogOut className="size-4" />
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
