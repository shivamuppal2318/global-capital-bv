export const noteToneClass = {
  blue: "bg-[#eef1ff] text-[#4766cc]",
  cyan: "bg-[#dff3fb] text-[#1192cb]",
  green: "bg-[#dff5e7] text-[#2b9b60]",
  amber: "bg-[#ffe9d0] text-[#f29c38]",
  pink: "bg-[#ffe4ee] text-[#ef5b8f]",
  violet: "bg-[#efe5ff] text-[#8853d0]",
  indigo: "bg-[#e6ebff] text-[#5769d4]",
  sky: "bg-[#def1ff] text-[#2d8fd6]",
  red: "bg-[#ffe3e3] text-[#e0483f]",
  slate: "bg-[#edf1f6] text-[#748096]"
};

export function Card({ className = "", children }) {
  return (
    <div className={`rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)] ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ icon: Icon, iconClass, children, action, subtitle }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          {Icon ? <Icon className={`size-5 ${iconClass ?? "text-[#3046b2]"}`} /> : null}
          <h2 className="text-[16px] font-semibold text-[#102246]">{children}</h2>
        </div>
        {subtitle ? <p className="mt-1 pl-8 text-[13px] text-[#6a7790]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ card }) {
  return (
    <div className="rounded-[20px] border border-[#d6deea] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
      <p className="text-[12px] uppercase tracking-[0.2em] text-[#5c6b87]">{card.label}</p>
      <p className="mt-3 text-[2.2rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">{card.value}</p>
      <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${noteToneClass[card.noteTone]}`}>
        {card.note}
      </span>
    </div>
  );
}

export function ActionButton({ label, icon: Icon, primary, external, hero, small, onClick, active }) {
  if (hero) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-[14px] px-5 py-3 text-[15px] font-semibold ${
          primary ? "bg-white text-[#21439b]" : "border border-white/35 bg-white/6 text-white"
        }`}
      >
        {Icon ? <Icon className="size-4" /> : null}
        {label}
        {external ? <span className="text-lg">↗</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-[14px] border font-semibold shadow-[0_2px_8px_rgba(30,48,87,0.04)] ${
        small ? "px-3 py-2 text-[13px]" : "px-4 py-3 text-[15px]"
      } ${
        primary || active
          ? "border-[#3046b2] bg-[#3046b2] text-white"
          : "border-[#d6deea] bg-white text-[#102246] hover:bg-[#f7f9fc]"
      }`}
    >
      {Icon ? <Icon className="size-4" /> : null}
      {label}
    </button>
  );
}

export function Badge({ tone = "slate", children }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass[tone]}`}>{children}</span>
  );
}

export function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-[#2b9b60]" : "bg-[#d9e2ef]"}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function ProgressBar({ width, tone = "bg-[#3046b2]" }) {
  return (
    <div className="h-2 rounded-full bg-[#e8edf5]">
      <div className={`h-2 rounded-full ${tone}`} style={{ width }} />
    </div>
  );
}
