// Quick-start HTML presets for the template editor — real, inline-styled
// email markup (not just plain paragraphs) so a new template starts from
// something that already looks like a professional PE cold-outreach email,
// using the app's own brand colors rather than generic placeholder ones.
// Inspired by a more elaborate visual template builder seen elsewhere, but
// scoped down to what this CRM's actual use case needs: a handful of solid
// starting points, not a full drag-and-drop layout system.

const BRAND = {
  primary: "#3046b2",
  dark: "#102246",
  gray: "#5f6f89",
  bg: "#f8faff",
  green: "#2b9b60",
  greenBg: "#dff5e7"
};

function ctaButton(label, url) {
  return `<p style="margin:28px 0 0;"><a href="${url}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px;font-weight:600;">${label}</a></p>`;
}

export const templatePresets = [
  {
    key: "cold-intro",
    label: "Cold intro",
    description: "Plain, personal — a short opening note with one clear ask.",
    build: () => `
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.dark};">Hi {{leadName}},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.dark};">I'm reaching out from Global Capital BV — we back founders in your sector and {{company}} came up as a strong fit for our current mandate.</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.dark};">Would you be open to a short call to see if there's a fit? Happy to work around your schedule.</p>
<p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.dark};">Best regards,<br>Global Capital BV</p>`
  },
  {
    key: "deal-teaser",
    label: "Deal teaser",
    description: "Highlights one opportunity with a stat callout and a CTA.",
    build: () => `
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.dark};">Hi {{leadName}},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:${BRAND.dark};">We're evaluating a mandate that lines up closely with {{company}}'s trajectory — sharing a quick overview below.</p>
<div style="background:${BRAND.bg};border-left:4px solid ${BRAND.primary};border-radius:8px;padding:18px 20px;margin:0 0 20px;">
  <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${BRAND.gray};">Mandate highlight</p>
  <p style="margin:0;font-size:16px;font-weight:600;color:${BRAND.dark};">$2.35B pipeline · 24 deals in diligence</p>
</div>
<p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.dark};">If this looks relevant, I'd love to walk through the details on a short call.</p>
${ctaButton("Book a call", "https://calendly.com/globalcapitalbv/intro-call")}`
  },
  {
    key: "event-invite",
    label: "Event / call invite",
    description: "A short header banner plus a single call to action.",
    build: () => `
<div style="background:linear-gradient(90deg,#243d97 0%,#0f6eb3 100%);border-radius:14px;padding:26px 24px;margin:0 0 20px;">
  <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#ffffff;opacity:0.85;">You're invited</p>
  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Intro call — Global Capital BV</p>
</div>
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.dark};">Hi {{leadName}},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.dark};">Pick a time that works for you and we'll cover mandate fit, timelines, and next steps for {{company}}.</p>
${ctaButton("Choose a time", "https://calendly.com/globalcapitalbv/intro-call")}`
  },
  {
    key: "update",
    label: "Update / follow-up",
    description: "A few short bullet points plus a light close.",
    build: () => `
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${BRAND.dark};">Hi {{leadName}},</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${BRAND.dark};">Quick update since we last spoke:</p>
<ul style="margin:0 0 20px;padding-left:20px;">
  <li style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.dark};">Diligence on the current round is progressing on schedule</li>
  <li style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${BRAND.dark};">Term sheet review expected within the coming weeks</li>
  <li style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.dark};">Happy to share the data room whenever it's useful for {{company}}</li>
</ul>
<p style="margin:0;font-size:15px;line-height:1.7;color:${BRAND.dark};">Let me know if you'd like to reconnect.</p>`
  }
];
