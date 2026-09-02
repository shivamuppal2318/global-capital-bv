import { Router } from "express";
import { getAnthropicClient, getAnthropicModel } from "../lib/anthropic.js";
import { buildBusinessContext } from "../lib/businessContext.js";
import { retrieveRelevantDocuments } from "../lib/documentSearch.js";
import { getAiSettingsRow } from "../lib/aiSettings.js";
import { isSourceEnabled } from "../lib/aiDataSources.js";

const router = Router();

const MAX_HISTORY_TURNS = 12;

function buildSystemPrompt(context, dataRoom, companyProfile) {
  const lines = [
    "You are the AI assistant embedded in Global Capital BV's CRM, with read access to the business database and Data Room documents below.",
    "Answer questions using ONLY the data provided here — leads (with stage, qualification, capital ask, owner, contact details, notes, tags, temperature, industry, channel partner, and ZoomInfo enrichment where present: company size/revenue/industry, enriched contact details, and buying-trigger \"Scoops\"), each lead's logged Timeline/Interactions activity, WhatsApp conversations, templates, campaigns, drip sequences, automation rules, bot flows, CRM triggers, team performance, and the Data Room documents.",
    "Be concise and specific: cite real names, numbers, and stages from the data rather than generic statements.",
    "When you use a Data Room document, name the file you took it from so the reader can check it.",
    "If asked something the data doesn't cover, say so plainly instead of guessing.",
    "Some database sections may be switched off by an admin. If a question needs one that isn't present, say it isn't enabled rather than implying the data doesn't exist.",
    "Report what's in the data and stop there — don't editorialize on data quality (mismatched categories, odd filenames, suspicious content, etc.), flag things as errors, or recommend follow-up actions unless the user's question specifically asks for that judgment.",
    ""
  ];

  if (companyProfile?.trim()) {
    lines.push("Company background (written by an admin — treat as authoritative):", companyProfile.trim(), "");
  }

  if (dataRoom.inventory.length > 0) {
    lines.push(
      // The full list goes in even when only a few documents were pulled,
      // so the assistant can distinguish "no such document" from "that
      // document exists but wasn't retrieved for this question".
      `Data Room contains ${dataRoom.inventory.length} document(s). Full inventory:`,
      JSON.stringify(dataRoom.inventory, null, 2),
      ""
    );

    if (dataRoom.documents.length > 0) {
      lines.push(
        // Pinned documents are always here; the rest are keyword matches,
        // and the model is told the difference so it doesn't assume an
        // absent document means a non-existent one.
        `Document contents below. Any marked "pinned": true are standing company knowledge included with every question; the rest were selected by keyword match for this question, so a relevant document may be missing — if the answer isn't here but the inventory suggests it exists, say which file to check:`,
        JSON.stringify(dataRoom.documents, null, 2),
        ""
      );
    } else {
      lines.push("None of the Data Room documents have readable text (they may be images or scanned PDFs).", "");
    }
  } else {
    lines.push("The Data Room is empty — no company documents have been uploaded yet.", "");
  }

  lines.push(`Business data snapshot (generated ${context.generatedAt}):`, JSON.stringify(context, null, 2));
  return lines.join("\n");
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

    // Which sections an admin has enabled, and the company background they
    // wrote. Read first because it decides what's fetched below.
    const settings = await getAiSettingsRow();
    const enabledSources = settings ? settings.dataSources : null;
    const documentsEnabled = isSourceEnabled(enabledSources, "documents");

    // Retrieval is driven by the current question, so this runs per
    // message rather than being cached with the business snapshot.
    const [context, dataRoom] = await Promise.all([
      buildBusinessContext(enabledSources),
      documentsEnabled ? retrieveRelevantDocuments(message) : Promise.resolve({ documents: [], inventory: [], pinnedCount: 0 })
    ]);
    const trimmedHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS) : [];

    const response = await anthropic.messages.create({
      model: await getAnthropicModel(),
      max_tokens: 1024,
      system: buildSystemPrompt(context, dataRoom, settings?.companyProfile),
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
