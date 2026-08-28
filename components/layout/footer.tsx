import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { CONTACT, NAV_LINKS, SITE_NAME, SITE_SUPPORT_LINE } from "@/lib/constants";

const footerLinks = [
  ...NAV_LINKS,
  { href: "/login", label: "Client Login" },
  { href: "/create-account", label: "Create Account" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-charcoal text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <BrandLogo variant="light" />
          <p className="mt-4 max-w-md text-sm leading-6 text-white/70">
            HOT2000 energy modeling, SB-12 compliance, and EEDS permit packages
            for Ontario residential projects — delivered with clarity and care.
          </p>
          <p className="mt-3 text-xs font-semibold tracking-[0.16em] text-electric uppercase">
            {SITE_SUPPORT_LINE}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Explore</h2>
          <ul className="mt-4 grid gap-2 text-sm">
            {footerLinks.map((link) => (
              <li key={link.href}>
                <Link className="text-white/70 transition-colors hover:text-white" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Contact</h2>
          <ul className="mt-4 grid gap-3 text-sm text-white/70">
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 size-4 text-electric" aria-hidden />
              <a className="hover:text-white" href={`mailto:${CONTACT.email}`}>
                {CONTACT.email}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <Phone className="mt-0.5 size-4 text-electric" aria-hidden />
              <a className="hover:text-white" href={CONTACT.phoneHref}>
                {CONTACT.phoneDisplay}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 text-electric" aria-hidden />
              <span>{CONTACT.region}</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-white/50">{CONTACT.hours}</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
          <p>Ontario residential energy compliance specialists.</p>
        </div>
      </div>
    </footer>
  );
}
