import type { Intent } from "./intent.js";

export type Understander = (transcript: string, contactNames: string[]) => Promise<Intent>;

export type LanguageModelConfig = { url: string; apiKey: string; model: string };

const INSTRUCTIONS = `You read one sentence a market trader in Northern Nigeria spoke in Hausa to a payments phone line. The sentence came from speech recognition, so words may be misspelled or misheard (for example "chura" for "tura").

Work out what the trader wants and reply with JSON only, in this shape:
{"action": "send" | "balance" | "unknown", "amount_naira": number or null, "recipient": string or null}

Rules:
- "send": they want to send or pay money. "balance": they want to know how much they have. Anything else is "unknown".
- amount_naira is the amount in naira as a plain number. Convert Hausa number words: daya 1, biyu 2, uku 3, hudu 4, biyar 5, shida 6, bakwai 7, takwas 8, tara 9, goma 10, "goma sha biyar" 15, ashirin 20, talatin 30, arba'in 40, hamsin 50, sittin 60, saba'in 70, tamanin 80, casa'in 90, dari 100, "dari biyu" 200, dubu 1000, "dubu biyar" 5000, "dubu biyu da dari biyar" 2500, "dubu ashirin da biyar" 25000, "da rabi" adds half of the last unit, miliyan 1000000.
- recipient is the person to be paid. If it sounds like one of the saved contacts, return that contact's name exactly as given. Otherwise return the name as heard. Never invent a recipient.
- If the amount or recipient was not said, use null. Do not guess.`;

export function createUnderstander(model: LanguageModelConfig): Understander | undefined {
  if (!model.url) return undefined;
  return async (transcript, contactNames) => {
    const res = await fetch(model.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0,
        max_tokens: 100,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSTRUCTIONS },
          {
            role: "user",
            content: JSON.stringify({ saved_contacts: contactNames.slice(0, 20), sentence: transcript.slice(0, 300) }),
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Language model failed with HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return intentFromReply(body.choices?.[0]?.message?.content ?? "");
  };
}

export function intentFromReply(reply: string): Intent {
  let parsed: { action?: unknown; amount_naira?: unknown; recipient?: unknown };
  try {
    parsed = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1));
  } catch {
    return { kind: "unknown" };
  }
  if (parsed.action === "balance") return { kind: "balance" };
  if (parsed.action !== "send") return { kind: "unknown" };
  const amount = typeof parsed.amount_naira === "number" ? parsed.amount_naira : Number.NaN;
  const recipient = typeof parsed.recipient === "string" ? parsed.recipient.trim().slice(0, 40) : "";
  return {
    kind: "send",
    ...(Number.isFinite(amount) && amount > 0 && amount < 1e9 ? { amountNgn: Math.round(amount * 100) / 100 } : {}),
    ...(recipient ? { recipient } : {}),
  };
}
