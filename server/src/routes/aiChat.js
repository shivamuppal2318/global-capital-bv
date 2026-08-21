import { Router } from "express";
import { getAnthropicClient, getAnthropicModel } from "../lib/anthropic.js";
import { buildBusinessContext } from "../lib/businessContext.js";

const router = Router();

const MAX_HISTORY_TURNS = 12;

function buildSystemPrompt(context) {
  return [
    "You are the AI assistant embedded in Global Capital BV's CRM, with read access to the full business database below.",
    "Answer questions using ONLY the data in this snapshot — leads (with stage, qualification, capital ask, owner, contact details), WhatsApp conversations, templates, campaigns, drip sequences, automation rules, bot flows, CRM triggers, and team performance.",
    "Be concise and specific: cite real names, numbers, and stages from the data rather than generic statements.",
    "If asked something the snapshot doesn't cover, say so plainly instead of guessing.",
    "",
    `Business data snapshot (generated ${context.generatedAt}):`,
    JSON.stringify(context, null, 2)
  ].join("\n");
}

router.post("/chat", async (req, res, next) => {
  try {
    const anthropic = await getAnthropicClient();
    if (!anthropic) {
      return res.json({
        reply:
          "The AI assistant isn't set up yet — an admin can add a Claude API key under Admin Panel → AI Assistant (get one at console.anthropic.com)."
      });
    }

    const { message, history } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const context = await buildBusinessContext();
    const trimmedHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS) : [];

    const response = await anthropic.messages.create({
      model: await getAnthropicModel(),
      max_tokens: 1024,
      system: buildSystemPrompt(context),
      messages: [...trimmedHistory, { role: "user", content: message }]
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    res.json({ reply: reply || "I didn't get a response back — try rephrasing that." });
  } catch (err) {
    if (err.status === 401) {
      return res.json({ reply: "The Anthropic API rejected the configured key — an admin can check it under Admin Panel → AI Assistant." });
    }
    next(err);
  }
});

export default router;
