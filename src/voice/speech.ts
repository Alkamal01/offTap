export type Transcriber = (audio: Uint8Array, contentType: string, names?: string[]) => Promise<string>;

export type SpeechConfig = { url: string; apiKey: string; model: string };

const EXTENSIONS: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

const NUMBERS =
  "daya, biyu, uku, hudu, biyar, shida, bakwai, takwas, tara, goma, ashirin, talatin, arba'in, hamsin, sittin, saba'in, tamanin, casa'in, dari, dubu.";

export function speechPrompt(names: string[] = []): string {
  const known = names.slice(0, 20);
  const people = known.length > 0 ? known : ["Musa"];
  const examples = people.slice(0, 4).map((name, i) => ["Tura naira hamsin zuwa", "A tura wa", "Aika dubu biyar zuwa", "Biya"][i] + ` ${name}` + (i === 1 ? " naira dari biyar." : "."));
  return `${NUMBERS} Sunaye: ${people.join(", ")}. ${examples.join(" ")} Nawa ne kudina?`;
}

export function createTranscriber(speech: SpeechConfig): Transcriber | undefined {
  if (!speech.url) return undefined;
  return async (audio, contentType, names) => {
    const type = contentType.split(";")[0]!.trim().toLowerCase();
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(audio)], { type }), `speech.${EXTENSIONS[type] ?? "wav"}`);
    form.set("model", speech.model);
    form.set("language", "ha");
    form.set("prompt", speechPrompt(names));
    form.set("temperature", "0");
    form.set("response_format", "json");
    const res = await fetch(speech.url, {
      method: "POST",
      headers: speech.apiKey ? { Authorization: `Bearer ${speech.apiKey}` } : {},
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Speech-to-text failed with HTTP ${res.status}`);
    const body = (await res.json()) as { text?: string };
    return (body.text ?? "").trim();
  };
}

const MAX_RECORDING_BYTES = 5 * 1024 * 1024;

export async function downloadRecording(url: string): Promise<{ audio: Uint8Array; contentType: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Recording URL must be https");
  const res = await fetch(parsed, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!res.ok) throw new Error(`Recording download failed with HTTP ${res.status}`);
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength > MAX_RECORDING_BYTES) throw new Error("Recording is too large");
  return { audio, contentType: res.headers.get("content-type") ?? "audio/wav" };
}
