import React from "react";

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  focusable: "false",
  "aria-hidden": "true",
};

const Svg = ({ size, children, ...rest }) => (
  <svg {...base} {...rest} width={size || base.width} height={size || base.height}>
    {children}
  </svg>
);

/* ------------------------------------------------------------------ brand */

export const DiamondLogo = ({ size = 56 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    aria-hidden="true"
    focusable="false"
  >
    <polygon points="14,17 34,17 32,10 16,10" fill="#a5e4fb" />
    <polygon points="10,17 16,10 14,17" fill="#5cc8f2" />
    <polygon points="38,17 32,10 34,17" fill="#5cc8f2" />
    <polygon points="10,17 14,17 24,41" fill="#3ab3e8" />
    <polygon points="14,17 24,17 24,41" fill="#7ad4f5" />
    <polygon points="24,17 34,17 24,41" fill="#2a9fd8" />
    <polygon points="34,17 38,17 24,41" fill="#1c7fb5" />
    <path
      d="M10 17 16 10h16l6 7-14 24z"
      fill="none"
      stroke="#e8f7fe"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
    <path
      d="M14 17h20M10 17h28"
      stroke="#e8f7fe"
      strokeWidth="0.9"
      opacity="0.85"
    />
  </svg>
);

/* -------------------------------------------------------------- sidebar nav */

export const IconScan = (p) => (
  <Svg {...p}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M4 12h16" />
  </Svg>
);

export const IconKapans = (p) => (
  <Svg {...p}>
    <path d="M3 7h18l-1.2 12.2a2 2 0 0 1-2 1.8H6.2a2 2 0 0 1-2-1.8z" />
    <path d="M3 7l2.4-3.2A1.5 1.5 0 0 1 6.6 3h10.8a1.5 1.5 0 0 1 1.2.6L21 7" />
    <path d="M9.5 11.5a2.5 2.5 0 0 0 5 0" />
  </Svg>
);

export const IconReports = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M8 16v-4" />
    <path d="M12 16V8.5" />
    <path d="M16 16v-2.5" />
  </Svg>
);

export const IconSettings = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.9" />
    <path d="M19.4 14.6a1.5 1.5 0 0 0 .3 1.65l.06.06a1.6 1.6 0 1 1-2.27 2.27l-.06-.06a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.17a1.6 1.6 0 1 1-3.2 0v-.09a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.06.06A1.6 1.6 0 1 1 4.72 16.5l.06-.06a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H3.5a1.6 1.6 0 1 1 0-3.2h.09a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.06-.06A1.6 1.6 0 1 1 6.87 4.8l.06.06a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37V3.6a1.6 1.6 0 1 1 3.2 0v.09a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.06-.06a1.6 1.6 0 1 1 2.27 2.27l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.17a1.6 1.6 0 1 1 0 3.2h-.09a1.5 1.5 0 0 0-1.37.9z" />
  </Svg>
);

/* ------------------------------------------------------------------ header */

export const IconHome = (p) => (
  <Svg {...p}>
    <path d="M3.5 10.5 12 4l8.5 6.5" />
    <path d="M5.5 9.6V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.6" />
    <path d="M9.8 20v-5.4h4.4V20" />
  </Svg>
);

export const IconWifi = (p) => (
  <Svg {...p}>
    <path d="M2.5 8.5a13.5 13.5 0 0 1 19 0" />
    <path d="M6 12a8.5 8.5 0 0 1 12 0" />
    <path d="M9.3 15.4a4 4 0 0 1 5.4 0" />
    <circle cx="12" cy="19" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

/* ------------------------------------------------------------- scan section */

export const IconScanTarget = (p) => (
  <Svg {...p} strokeWidth={1.9}>
    <path d="M3.5 8.5v-3a2 2 0 0 1 2-2h3" />
    <path d="M15.5 3.5h3a2 2 0 0 1 2 2v3" />
    <path d="M20.5 15.5v3a2 2 0 0 1-2 2h-3" />
    <path d="M8.5 20.5h-3a2 2 0 0 1-2-2v-3" />
    <path d="M7 12h10" />
  </Svg>
);

export const IconBarcode = (p) => (
  <Svg {...p} strokeWidth={1.5}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 9v6M10 9v6M13 9v6M16.5 9v6" />
  </Svg>
);

export const IconDroplet = (p) => (
  <Svg {...p}>
    <path d="M12 3.2 6.8 9.6a7 7 0 1 0 10.4 0z" />
  </Svg>
);

export const IconDiamond = (p) => (
  <Svg {...p}>
    <path d="M3.2 9.4 7 4.2h10l3.8 5.2L12 20z" />
    <path d="M3.2 9.4h17.6" />
    <path d="M8.6 9.4 12 20l3.4-10.6" />
  </Svg>
);

export const IconPercent = (p) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="2.2" />
    <circle cx="17" cy="17" r="2.2" />
    <path d="M19 5 5 19" />
  </Svg>
);

export const IconSave = (p) => (
  <Svg {...p}>
    <path d="M4.5 6a1.5 1.5 0 0 1 1.5-1.5h9.2L19.5 8.4V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18z" />
    <path d="M8 4.5v4.2h7V4.5" />
    <rect x="8" y="13" width="8" height="6.5" rx="1" />
  </Svg>
);

/* ----------------------------------------------------------------- tables */

export const IconRefresh = (p) => (
  <Svg {...p}>
    <path d="M20 11.5a8 8 0 1 0-2.6 6.4" />
    <path d="M20 5.5v6h-6" />
  </Svg>
);

export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.6 15.6 20.5 20.5" />
  </Svg>
);

export const IconFilter = (p) => (
  <Svg {...p}>
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </Svg>
);

export const IconCalendar = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17" />
    <path d="M8 3.5V6M16 3.5V6" />
  </Svg>
);

export const IconFile = (p) => (
  <Svg {...p}>
    <path d="M6 3.5h7.5L19 9v11.5H6z" />
    <path d="M13.2 3.5V9H19" />
    <path d="M9 13h6M9 16.5h4" />
  </Svg>
);

export const IconChevronDown = (p) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M6 9.5 12 15.5l6-6" />
  </Svg>
);

export const IconChevronRight = (p) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M9.5 6 15.5 12l-6 6" />
  </Svg>
);

export const IconChevronLeft = (p) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M14.5 6 8.5 12l6 6" />
  </Svg>
);

export const IconChevronsRight = (p) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M6.5 6 12.5 12l-6 6" />
    <path d="M13 6 19 12l-6 6" />
  </Svg>
);

export const IconChevronsLeft = (p) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M17.5 6 11.5 12l6 6" />
    <path d="M11 6 5 12l6 6" />
  </Svg>
);

export const IconClose = (p) => (
  <Svg {...p} strokeWidth={1.9}>
    <path d="M6.5 6.5 17.5 17.5" />
    <path d="M17.5 6.5 6.5 17.5" />
  </Svg>
);

export const IconTrash = (p) => (
  <Svg {...p}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V4.5h5V7" />
    <path d="M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4L18 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </Svg>
);

export const IconDownload = (p) => (
  <Svg {...p}>
    <path d="M12 3.5v11" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 18.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg {...p} strokeWidth={2.1}>
    <path d="M5 12.8 9.5 17.3 19 7.8" />
  </Svg>
);

export const IconAlert = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4.5" />
    <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPlus = (p) => (
  <Svg {...p} strokeWidth={2.1}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
);

export const IconUndo = (p) => (
  <Svg {...p}>
    <path d="M4 9h11a4.5 4.5 0 0 1 0 9H9" />
    <path d="M7.5 5.5 4 9l3.5 3.5" />
  </Svg>
);

export const IconEdit = (p) => (
  <Svg {...p}>
    <path d="M4 20h4l10-10-4-4L4 16z" />
    <path d="M13.5 6.5 17.5 10.5" />
  </Svg>
);

export const IconArrowLeft = (p) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="M11 6l-6 6 6 6" />
  </Svg>
);

export const IconLayers = (p) => (
  <Svg {...p}>
    <path d="M12 3.5 4 8l8 4.5L20 8z" />
    <path d="M4 12.5 12 17l8-4.5" />
    <path d="M4 16.5 12 21l8-4.5" />
  </Svg>
);
