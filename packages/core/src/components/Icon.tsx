const paths: Record<string, string> = {
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  left: "M15 18l-6-6 6-6",
  right: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  reset: "M4 12a8 8 0 1 0 2.34-5.66M4 4v5h5",
  arrowRight: "M5 12h14m-5-5l5 5-5 5",
  arrowLeft: "M19 12H5m5-5l-5 5 5 5",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  bars: "M6 20v-5M12 20V9M18 20V4",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  play: "M7 5l12 7-12 7z",
  pause: "M8 5v14M16 5v14",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 5v16",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  alert: "M12 9v4m0 4h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z",
  copy: "M9 9h10v10H9zM5 15V5h10",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
