import { sendTemplateEmail } from "./leadSender.js";

// Maps a classified reply straight to the template that answers it:
// interested -> NDA, wants a call -> Calendly invite, wants more info ->
// brochure/teaser. NO_REPLY is deliberately absent — there's nothing to
// auto-send in response to "no reply happened."
const REPLY_TYPE_TO_TEMPLATE_KEY = {
  INTERESTED: "interested",
  ZOOM_REQUEST: "zoom-request",
  INFO_REQUEST: "info-request"
};

// `send` is injectable (defaults to the real sendTemplateEmail) so this is
// testable without a live database — same pattern as sendCap.js.
export async function autoRespondToReply(leadId, replyType, send = sendTemplateEmail) {
  const templateKey = REPLY_TYPE_TO_TEMPLATE_KEY[replyType];
  if (!templateKey) {
    return { sent: false, reason: `No auto-response template mapped for reply type "${replyType}".` };
  }

  try {
    const { activity, warnings } = await send(leadId, templateKey);
    return { sent: true, templateKey, activity, warnings };
  } catch (error) {
    // Don't let a suppressed/capped/unreachable send crash the caller (the
    // reply was still real and worth recording even if the auto-response
    // couldn't go out) — report it as a non-fatal outcome instead.
    return { sent: false, reason: error.message };
  }
}
