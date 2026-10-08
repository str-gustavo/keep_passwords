import { Baby, BookUser, Car, CreditCard, Database, HeartPulse, IdCard, KeyRound, Landmark, MapPin, Package, Paperclip, Server, StickyNote, Terminal, UserRound, Wifi, type LucideIcon } from 'lucide-react';
import { getRecordType, type RecordTypeId } from '@/lib/record-types/catalog';

const ICONS: Record<string, LucideIcon> = {
  'key-round': KeyRound,
  'credit-card': CreditCard,
  landmark: Landmark,
  'map-pin': MapPin,
  'user-round': UserRound,
  'sticky-note': StickyNote,
  'book-user': BookUser,
  car: Car,
  baby: Baby,
  'heart-pulse': HeartPulse,
  'id-card': IdCard,
  package: Package,
  terminal: Terminal,
  database: Database,
  server: Server,
  wifi: Wifi,
  paperclip: Paperclip,
};

export function TypeIcon({ type, className }: { type: RecordTypeId; className?: string }) {
  const Icon = ICONS[getRecordType(type).icon] ?? KeyRound;
  return <Icon className={className} aria-hidden="true" />;
}
