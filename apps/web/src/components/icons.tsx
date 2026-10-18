import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-5.5h4V21h4a1 1 0 0 0 1-1V9.8" />
  </Base>
);

export const IconScissors = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="2.6" />
    <circle cx="6" cy="18" r="2.6" />
    <path d="M20 4 8.6 15.4M20 20 8.6 8.6" />
  </Base>
);

export const IconCalendar = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </Base>
);

export const IconWallet = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19a2 2 0 0 1 2 2v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17z" />
    <path d="M3 9h18" />
    <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </Base>
);

export const IconUser = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c.7-3.6 3.8-5.6 7.5-5.6s6.8 2 7.5 5.6" />
  </Base>
);

export const IconGift = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="9" width="18" height="12" rx="2" />
    <path d="M3 13h18M12 9v12" />
    <path d="M12 9S10.5 3.5 8 4.2C6 4.8 6.5 9 8.6 9H12zM12 9s1.5-5.5 4-4.8C18 4.8 17.5 9 15.4 9H12z" />
  </Base>
);

export const IconChart = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <rect x="5" y="11" width="3.4" height="6" rx="1" />
    <rect x="10.3" y="7" width="3.4" height="10" rx="1" />
    <rect x="15.6" y="13" width="3.4" height="4" rx="1" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M2.8 19.5c.6-3.2 3.2-5 6.2-5s5.6 1.8 6.2 5" />
    <path d="M16.5 6.2a3 3 0 0 1 0 5.6M18 14.6c2 .5 3.3 1.9 3.7 4.4" />
  </Base>
);

export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10.2 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1z" />
  </Base>
);

export const IconStore = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9.5" />
    <path d="M2.6 9.5 4 4h16l1.4 5.5a3 3 0 0 1-5.6 1.2 3 3 0 0 1-5.6 0 3 3 0 0 1-5.6-1.2z" />
    <path d="M9.5 20.5v-5.8h5v5.8" />
  </Base>
);

export const IconBell = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 4-2 5.5-2 5.5h16s-2-1.5-2-5.5" />
    <path d="M10.3 18.5a2 2 0 0 0 3.4 0" />
  </Base>
);

export const IconLogout = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 4.5h3A2.5 2.5 0 0 1 20.5 7v10a2.5 2.5 0 0 1-2.5 2.5h-3" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 13 4.5 4.5L19 7" />
  </Base>
);

export const IconX = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconTrend = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 17l5.5-5.5 4 4L21 7" />
    <path d="M15 7h6v6" />
  </Base>
);

export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
  </Base>
);

export const IconShare = (p: IconProps) => (
  <Base {...p}>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4" />
  </Base>
);

export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v11M7.5 11 12 15.5 16.5 11" />
    <path d="M5 19.5h14" />
  </Base>
);

export const IconSparkle = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4l1.7 4.6L18 10.3l-4.3 1.7L12 16.6l-1.7-4.6L6 10.3l4.3-1.7z" />
    <path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
  </Base>
);

export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 19 6v6c0 4.3-2.9 7.4-7 8.5-4.1-1.1-7-4.2-7-8.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
);

export const IconReceipt = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3.5h12v17l-2.5-1.6L13 20.5l-2.5-1.6L8 20.5 6 19z" />
    <path d="M9 8.5h6M9 12h6" />
  </Base>
);

export const IconArrowLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Base>
);

export const IconChevron = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 5 7 7-7 7" />
  </Base>
);

export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4.5 21 20H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Base>
);

export const IconFilter = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Base>
);

export const IconPhone = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 0 0 6.1 6.1l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
  </Base>
);

export const IconLock = (p: IconProps) => (
  <Base {...p}>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </Base>
);

/** Three-dot "more" affordance for bottom navigation. */
export const IconMore = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Base>
);

/** Bell-on-a-card used for the notification centre heading. */
export const IconSparkles = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8z" />
    <path d="M18.5 15.5 19.3 17.7 21.5 18.5 19.3 19.3 18.5 21.5 17.7 19.3 15.5 18.5 17.7 17.7z" />
  </Base>
);
