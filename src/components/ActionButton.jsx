export function ActionButton({ children, icon, primary = false }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-[11px] text-sm font-semibold transition ${
        primary
          ? "border border-transparent bg-[linear-gradient(135deg,#1d3960,#294f84)] text-white"
          : "border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--text)] hover:bg-white"
      } inline-flex items-center gap-2`}
    >
      {icon}
      {children}
    </button>
  );
}
