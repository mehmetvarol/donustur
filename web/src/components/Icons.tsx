// Çizgi simgeler (24×24, currentColor). Hepsi dekor: aria-hidden.

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, strokeWidth = 1.75, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconLogo = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M5 8h13l-3.5-3.5" />
    <path d="M19 16H6l3.5 3.5" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4" />
    <path d="M7.5 8.5 12 4l4.5 4.5" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);
export const IconImage = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m21 15-4.5-4.5L7 20" />
  </Svg>
);
export const IconFilm = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M7.5 5v14" />
    <path d="M16.5 5v14" />
    <path d="M3 12h4.5" />
    <path d="M16.5 12H21" />
  </Svg>
);
export const IconMusic = (p: P) => (
  <Svg {...p}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
);
export const IconFile = (p: P) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h10" />
    <path d="M18 7h2" />
    <path d="M4 17h4" />
    <path d="M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="m5 12 4.5 4.5L19 7" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M12 4v11" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M5 19h14" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg strokeWidth={1.9} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V13" />
    <path d="M12 16.5h.01" />
  </Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg strokeWidth={2} {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const IconRetry = (p: P) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.9-3" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.9 3" />
    <path d="M20 20v-4h-4" />
  </Svg>
);
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconEyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
    <path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
);

export function KindIcon({ kind, ...p }: P & { kind: string | null }) {
  if (kind === "image") return <IconImage {...p} />;
  if (kind === "video") return <IconFilm {...p} />;
  if (kind === "audio") return <IconMusic {...p} />;
  return <IconFile {...p} />;
}
