import OpenAI from "openai";
import env from "../config/env.js";

const summarizeDesign = (snapshot) => {
  const counts = (snapshot?.elements || []).reduce((result, element) => {
    if (element.isDeleted) return result;
    const type = element.type || "other";
    result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  const summary = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
  return summary || "No visible drawing elements were saved.";
};

const fallbackSummary = ({
  participantsCount,
  activityCount,
  messages,
  activities,
  snapshot,
}) => {
  const discussion = messages.length
    ? messages
        .slice(0, 8)
        .map((message) => {
          const text = message.text?.trim();
          const attachment = message.attachment?.originalName;
          const content = [text, attachment && `attached ${attachment}`]
            .filter(Boolean)
            .join("; ");
          return content
            ? `${message.sender?.name || "Member"}: ${content}`
            : null;
        })
        .filter(Boolean)
        .join(" | ")
    : "No chat messages were exchanged.";
  const contributors = [
    ...new Set(
      activities.map((activity) => activity.actor?.name).filter(Boolean),
    ),
  ];
  return [
    `${participantsCount} participant(s) · ${messages.length} chat message(s) · ${activityCount} board updates.`,
    `Discussion: ${discussion}`,
    `Whiteboard saved with ${summarizeDesign(snapshot)}.`,
    contributors.length ? `Contributors: ${contributors.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
};

const client = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey })
  : null;

export const generateCollaborationSummary = async ({
  title,
  participantsCount,
  activityCount,
  messages,
  activities = [],
  snapshot,
}) => {
  const fallback = fallbackSummary({
    participantsCount,
    activityCount,
    messages,
    activities,
    snapshot,
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
Saved whiteboard elements: ${summarizeDesign(snapshot)}

Board activity log:
${
  activities
    .slice(-80)
    .map(
      (activity) =>
        `${activity.actor?.name || "Member"}: ${activity.type} (${JSON.stringify(activity.payload || {})})`,
    )
    .join("\n") || "No board changes recorded."
}

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

export const askCollaborationAI = async ({
  question,
  boardName,
  messages,
  activities,
}) => {
  if (!client) {
    return "AI assistant is not configured. Add OPENAI_API_KEY to apps/api/src/.env.";
  }
  const transcript = messages.length
    ? messages
        .slice(-80)
        .map(
          (message) => `${message.sender?.name || "Member"}: ${message.text}`,
        )
        .join("\n")
    : "No chat messages yet.";
  const activityLog = activities.length
    ? activities
        .slice(-80)
        .map(
          (activity) => `${activity.actor?.name || "Member"}: ${activity.type}`,
        )
        .join("\n")
    : "No board activity recorded yet.";
  const response = await client.responses.create({
    model: env.openaiModel,
    input: `You are the ProjectHub collaboration assistant. Answer the user's question using only this board context. Be concise and practical. If the context does not contain the answer, say so.

Board: ${boardName}
User question: ${question}

Chat:
${transcript}

Board activity:
${activityLog}`,
  });
  return response.output_text?.trim() || "I could not generate an answer.";
};
