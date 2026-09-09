import { useState } from "react";
import { NoteIcon, PlusIcon } from "../Icons";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { templatesData } from "../../data/whatsappData";

const statusTone = {
  Approved: "green",
  "In review": "amber",
  Rejected: "red"
};

export function TemplatesTab() {
  const [activeCategory, setActiveCategory] = useState("All");
  const rows =
    activeCategory === "All" ? templatesData.rows : templatesData.rows.filter((row) => row.category === activeCategory);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        {templatesData.stats.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="px-5 py-5">
          <SectionTitle
            icon={NoteIcon}
            iconClass="text-[#ff9e1a]"
            action={<ActionButton label="New template" icon={PlusIcon} primary small />}
          >
            Template library
          </SectionTitle>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {templatesData.categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  category === activeCategory ? "bg-[#3046b2] text-white" : "bg-[#edf2f7] text-[#5f6f89] hover:bg-[#e2e9f3]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                  <th className="pb-3 font-medium">Template</th>
                  <th className="pb-3 font-medium">Category</th>
                  <th className="pb-3 font-medium">Language</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 text-right font-medium">Uses</th>
                  <th className="pb-3 text-right font-medium">Read rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-t border-[#e7edf5]">
                    <td className="py-4 text-[15px] font-medium text-[#102246]">{row.name}</td>
                    <td className="py-4 text-[14px] text-[#5f6f89]">{row.category}</td>
                    <td className="py-4 text-[14px] text-[#5f6f89]">{row.language}</td>
                    <td className="py-4">
                      <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{row.uses}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{row.readRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="px-5 py-5">
          <SectionTitle>Preview</SectionTitle>
          <div className="mt-5 rounded-[24px] border border-[#d6deea] bg-[#e9edf4] p-4">
            <div className="rounded-[18px] bg-[#dcf2e3] px-4 py-3 shadow-sm">
              <p className="text-[15px] leading-6 text-[#102246]">{templatesData.preview.body}</p>
              <p className="mt-3 border-t border-[#c4e3cc] pt-2 text-[12px] text-[#5c7a63]">{templatesData.preview.footer}</p>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-[#5f6f89]">
            Template <span className="font-semibold text-[#102246]">{templatesData.preview.name}</span> · merge fields pull from
            the CRM record automatically.
          </p>
        </Card>
      </div>
    </div>
  );
}
