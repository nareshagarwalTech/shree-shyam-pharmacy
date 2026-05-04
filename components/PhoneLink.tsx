'use client';

import { Phone } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/whatsapp';

interface Props {
  phone: string;
  /** When true (default), show a small phone icon before the number. */
  showIcon?: boolean;
  /** Override className for the link. */
  className?: string;
  /** Optional label to render instead of formatPhoneDisplay (rare). */
  children?: React.ReactNode;
  /** Compact = no icon, smaller padding. Used inside dense rows. */
  compact?: boolean;
}

/**
 * Tap-to-call wrapper for any phone number display.
 * On mobile this opens the dialer; on desktop most browsers also handle tel:.
 * Stops click propagation so it works inside clickable rows.
 */
export default function PhoneLink({ phone, showIcon = true, className, children, compact }: Props) {
  if (!phone) return null;
  const cls =
    className ??
    `inline-flex items-center gap-1 hover:text-purple-600 transition-colors ${
      compact ? '' : 'underline-offset-2 hover:underline'
    }`;
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => e.stopPropagation()}
      className={cls}
      title={`Call ${phone}`}
    >
      {showIcon && !compact && <Phone className="w-3 h-3 shrink-0" />}
      <span>{children ?? formatPhoneDisplay(phone)}</span>
    </a>
  );
}
