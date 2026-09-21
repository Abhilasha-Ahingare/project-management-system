import OpenAI from "openai";
import env from "../config/env.js";

const fallbackSummary = ({ participantsCount, activityCount, messages }) =>
  `${participantsCount} participant(s), ${activityCount} board activities, and ${messages.length} chat message(s) were recorded.`;

const client = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey })
  : null;

export const generateCollaborationSummary = async ({
  title,
  participantsCount,
  activityCount,
  messages,
}) => {
  const fallback = fallbackSummary({
    participantsCount,
    activityCount,
    messages,
  });

  if (!client) return { summary: fallback, summaryType: "deterministic" };

  const transcript = messages.length
    ? messages
        .map(
          (message) => `${message.sender?.name || "Member"}: ${message.text}`,
        )
        .join("\n")
    : "No chat messages.";

  try {
    const response = await client.responses.create({
      model: env.openaiModel,
      input: `Summarize this ProjectHub collaboration session.

Title: ${title || "Collaboration session"}
Participants: ${participantsCount}
Board activities: ${activityCount}

Chat transcript:
${transcript}

Return a concise summary in 3 to 5 bullet points. Mention decisions, discussed work, and follow-up tasks when present. Do not invent details.`,
    });
    const summary = response.output_text?.trim();
    return summary
      ? { summary, summaryType: "ai" }
      : { summary: fallback, summaryType: "deterministic" };
  } catch (error) {
    console.error("[ProjectHub AI] collaboration summary failed", {
      code: error.code,
      message: error.message,
    });
    return { summary: fallback, summaryType: "deterministic" };
  }
};
