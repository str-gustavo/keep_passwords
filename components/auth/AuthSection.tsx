/** Heading, supporting text, body and footer links of an auth screen, loose on the layout's white column (no card). */
export function AuthSection({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="w-full text-fg">
      <h1 className="text-xl font-semibold text-fg-strong">{title}</h1>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 space-y-2 text-sm text-fg-muted">{footer}</div>}
    </section>
  );
}

/** Form-level error shown under the form; announced to screen readers. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p>;
}
