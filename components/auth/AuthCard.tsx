export function AuthCard({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="w-full rounded-2xl border border-border bg-surface p-6 text-fg shadow-xl sm:p-8">
      <h1 className="text-xl font-semibold text-fg">{title}</h1>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 space-y-2 border-t border-border pt-4 text-center text-sm text-fg-muted">{footer}</div>}
    </section>
  );
}

/** Form-level error shown under the form; announced to screen readers. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p>;
}
