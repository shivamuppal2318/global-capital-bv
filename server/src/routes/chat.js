import { Router } from "express";
import { prisma } from "../db.js";
import { formatRelativeTime } from "../utils.js";

const router = Router();

router.get("/conversations", async (req, res, next) => {
  try {
    const { filter } = req.query;
    const where = {};
    if (filter === "unread") where.unreadCount = { gt: 0 };
    if (filter === "unassigned") where.agentId = null;

    const conversations = await prisma.conversation.findMany({
      where,
      include: { contact: true },
      orderBy: { lastMessageAt: "desc" }
    });

    res.json(
      conversations.map((c) => ({
        id: c.id,
        initials: c.contact.initials,
        name: c.contact.name,
        company: c.contact.company,
        preview: c.lastPreview,
        time: formatRelativeTime(c.lastMessageAt),
        unread: c.unreadCount,
        tone: c.contact.tone
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get("/conversations/:id", async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { contact: true, messages: { orderBy: { sentAt: "asc" } } }
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    res.json({
      contact: {
        initials: conversation.contact.initials,
        name: conversation.contact.name,
        company: conversation.contact.company,
        phone: conversation.contact.phone,
        stage: conversation.contact.stage,
        owner: conversation.contact.owner
      },
      messages: conversation.messages.map((m) => [
        m.direction === "OUTBOUND" ? "right" : "left",
        m.body,
        m.sentAt.toISOString().slice(11, 16)
      ])
    });
  } catch (err) {
    next(err);
  }
});

router.post("/conversations/:id/messages", async (req, res, next) => {
  try {
    const { body, templateName } = req.body;
    if (!body) return res.status(400).json({ error: "body is required" });

    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    // NOTE: this only persists the message locally. Wiring this up to the real
    // Meta WhatsApp Cloud API means calling POST /{phone-number-id}/messages
    // with the WABA access token here before marking the message as sent.
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, direction: "OUTBOUND", body, templateName: templateName ?? null, status: "SENT" }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastPreview: body, lastMessageAt: message.sentAt, status: "REPLIED" }
    });

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

export default router;
