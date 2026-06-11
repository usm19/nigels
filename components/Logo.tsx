export function Logo() {
  return (
    <div className="flex select-none items-center gap-2.5">
      <svg
        viewBox="0 0 64 64"
        className="h-9 w-9 sm:h-10 sm:w-10"
        aria-hidden
        focusable="false"
      >
        <defs>
          <linearGradient id="nigels-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="1" stopColor="var(--brand-2)" />
          </linearGradient>
          <linearGradient id="nigels-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4d088" />
            <stop offset="1" stopColor="#c9a227" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#nigels-bg)" />
        <path
          d="M20 46 V18 h4.5 L41.5 38 V18 H46 v28 h-4.5 L24.5 26 V46 Z"
          fill="url(#nigels-gold)"
        />
        <circle cx="51" cy="13" r="1.8" fill="#f4d088" opacity="0.9" />
        <circle cx="13" cy="51" r="1.2" fill="#f4d088" opacity="0.7" />
      </svg>
      <div className="leading-tight">
        <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text font-display text-2xl font-bold tracking-tight text-transparent">
          Nigel&rsquo;s
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Birmingham · fresh jobs
        </span>
      </div>
    </div>
  );
}
