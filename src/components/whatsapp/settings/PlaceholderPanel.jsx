import { Card, SectionTitle } from "../../ui";

export function PlaceholderPanel({ icon, iconClass, title, description }) {
  return (
    <Card className="px-5 py-8">
      <SectionTitle icon={icon} iconClass={iconClass}>
        {title}
      </SectionTitle>
      <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#5f6f89]">{description}</p>
      <p className="mt-4 inline-flex rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#748096]">Coming soon</p>
    </Card>
  );
}
