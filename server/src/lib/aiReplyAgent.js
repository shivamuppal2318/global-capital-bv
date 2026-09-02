// Real LLM call (mirrors lib/marketIntelligence/aiProcessor.js's pattern) —
// drafts a reply email for a lead who has actually replied, grounded in
// their real inbound message text (ReplyEvent.rawBody), not a fabricated
// status. Credentials come from Admin Panel → AI Assistant, falling back to
// ANTHROPIC_API_KEY (see lib/aiSettings.js).
import { getAiConfig, isAiConfigured, extractResponseText } from "./aiSettings.js";

export function isAiReplyAgentConfigured() {
  return isAiConfigured();
}

const REPLY_TYPE_CONTEXT = {
  INTERESTED: "The lead replied expressing interest and readiness to move forward (e.g. asking about the NDA or next steps).",
  ZOOM_REQUEST: "The lead asked to have a call/Zoom meeting before going any further.",
  INFO_REQUEST: "The lead asked for more information, a deck, or a brochure before deciding anything.",
  // A real reply that didn't match INTERESTED/ZOOM_REQUEST/INFO_REQUEST's
  // keyword rules (e.g. a plain "Ok") — still a genuine reply, not a
  // no-reply nudge, so the draft should read and respond to their actual
  // message below rather than assuming a specific intent that was never
  // stated.
  OTHER: "The lead replied, but their message didn't clearly match interest, a call request, or an info request — read their actual reply below and respond to what they actually said.",
  NO_REPLY: "The lead has not replied yet — this is a proactive follow-up nudge, not a reply to a specific message."
};

// Pure — testable without any network access or API key.
export function buildReplyDraftPrompt({ leadName, company, replyType, rawReplyText }) {
  const context = REPLY_TYPE_CONTEXT[replyType] ?? REPLY_TYPE_CONTEXT.NO_REPLY;
  const replySection = rawReplyText
    ? `Their message:\n"""\n${rawReplyText.slice(0, 2000)}\n"""`
    : "They have not sent a message yet — this is a proactive follow-up, not a reply to something specific.";

  return `You are drafting a reply email on behalf of a private equity deal-sourcing team (Global Capital BV) to a lead in a cold-outreach campaign.

Lead: ${leadName} at ${company}
Situation: ${context}
${replySection}

Write a short, professional reply email (3-6 sentences) that directly addresses their message, moves the conversation to the appropriate next step, and does not invent facts, figures, or promises that aren't implied by their message. Do not include a placeholder like "[Subject]" — put the actual subject line in the subject field.

Return ONLY valid JSON, no other text, in exactly this shape:
{"subject": "the email subject line", "body": "the full email body, plain text with \\n for line breaks"}`;
}

// Pure — testable with any mock LLM response string, real or fabricated.
export function parseReplyDraftResponse(rawResponseText) {
  const cleaned = rawResponseText.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI reply agent returned non-JSON response: ${rawResponseText.slice(0, 200)}`);
  }

  if (!parsed.subject || typeof parsed.subject !== "string") {
    throw new Error("AI response missing a valid subject.");
  }
  if (!parsed.body || typeof parsed.body !== "string") {
    throw new Error("AI response missing a valid body.");
  }

  return { subject: parsed.subject.trim(), body: parsed.body.trim() };
}

export async function generateReplyDraft({ leadName, company, replyType, rawReplyText }) {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) {
    throw new Error("AI Agent is not configured — add a Claude API key under Admin Panel → AI Assistant.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [{ role: "user", content: buildReplyDraftPrompt({ leadName, company, replyType, rawReplyText }) }]
    })
  });

  if (!response.ok) {
    throw new Error(`AI reply agent request failed: ${response.status}`);
  }

  const data = await response.json();
  const draft = parseReplyDraftResponse(extractResponseText(data));
  return { ...draft, model };
}
