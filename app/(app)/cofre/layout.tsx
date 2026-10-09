import { AppShell } from '@/components/vault/AppShell';

export default function CofreLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
