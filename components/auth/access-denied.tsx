import Link from "next/link";

type AccessDeniedProps = {
  title?: string;
  message?: string;
};

export function AccessDenied({
  title = "Access denied",
  message = "You do not have permission to access this developer tool.",
}: AccessDeniedProps) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-charcoal">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/portal"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted/60"
        >
          Go to client portal
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground hover:text-charcoal"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
