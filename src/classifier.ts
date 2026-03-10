import Anthropic from "@anthropic-ai/sdk";
import { config, team } from "./config.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export type Classification = {
  intent: "needs_help" | "scam" | "general";
  category: string;
  confidence: number;
  directAnswer: string | null;
  scamReason: string | null;
  summary: string;
  needsHuman: boolean;
};

function buildSystemPrompt(): string {
  const categoryList = Object.entries(team.categories)
    .map(([key, cat]) => `   - "${key}" -- ${cat.description}`)
    .join("\n");

  return `You are a Discord server moderation assistant. Your job is to analyze user messages and classify them.

You must respond with ONLY valid JSON matching this schema:
{
  "intent": "needs_help" | "scam" | "general",
  "category": "one of the categories below",
  "confidence": 0.0 to 1.0,
  "directAnswer": "your helpful answer" | null,
  "scamReason": "why this is a scam" | null,
  "summary": "brief summary of what the user needs",
  "needsHuman": true | false
}

Classification rules:

1. "scam" - Flag messages that:
   - Ask users to send crypto, tokens, or money
   - Share suspicious links (fake airdrops, phishing, impersonation sites)
   - Impersonate admins, staff, or official accounts
   - Promise free tokens, NFTs, or guaranteed returns
   - Ask users to DM them for "support" or "verification"
   - Ask for private keys, seed phrases, or wallet connections to unknown sites
   - Pressure urgency ("act now", "limited time", "you've been selected")
   Set scamReason to explain WHY it's suspicious.
   Set category to "security".

2. "needs_help" - The user is asking a question or reporting a problem.
   - If you can confidently answer the question directly, set directAnswer with a helpful response and needsHuman to false.
   - If the question requires specific account/project knowledge you don't have, set needsHuman to true and directAnswer to null.
   - Always set summary to describe what help they need.
   - Set category to the BEST matching category from the list below.

3. "general" - Casual conversation, greetings, memes, off-topic chat.
   Set directAnswer to null, needsHuman to false, and category to "general".

Available categories:
${categoryList}

Pick the single best-matching category. If none fit well, use "general".

Be conservative with scam detection - only flag things that are clearly suspicious.
For help requests, try to provide direct answers for common questions (how to do X, what is Y, troubleshooting steps).`;
}

export async function classifyMessage(
  messageContent: string,
  userName: string,
  channelName: string,
  recentContext: string[]
): Promise<Classification> {
  const contextBlock =
    recentContext.length > 0
      ? `\nRecent messages in the channel for context:\n${recentContext.join("\n")}\n`
      : "";

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Channel: #${channelName}\nUser: ${userName}${contextBlock}\nMessage to classify:\n"${messageContent}"`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    return JSON.parse(jsonMatch[0]) as Classification;
  } catch (err) {
    console.error("Failed to parse classifier response:", text);
    return {
      intent: "general",
      category: "general",
      confidence: 0,
      directAnswer: null,
      scamReason: null,
      summary: "Could not classify message",
      needsHuman: false,
    };
  }
}
