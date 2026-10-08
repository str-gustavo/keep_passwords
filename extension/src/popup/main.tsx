// Placeholder popup (Task 4 scaffold); the real popup replaces it.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/tokens.css';

function Placeholder() {
  return (
    <main className="bg-surface p-4">
      <h1 className="text-lg font-semibold text-navy">Nexus Passwords</h1>
      <p className="mt-1 text-sm text-fg-muted">Gerenciador de senhas zero-knowledge da Nexus Logtec.</p>
      <div className="mt-3 h-1 w-12 rounded-full bg-primary" />
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><Placeholder /></StrictMode>);
