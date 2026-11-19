import type { FastifyInstance } from "fastify";
import type { Store } from "../db.js";
import { normalisePhone } from "../phone.js";
import { isDemoPhone, type DemoAccount } from "../seed.js";
import type { UssdRequest, UssdResult } from "../ussd/handler.js";
import type { VoiceCalls, VoiceStep } from "../voice/call.js";
import type { Transcriber } from "../voice/speech.js";
import { escapeHtml, page } from "./html.js";

const CSS = `
.phone { margin-top:16px; border:1px solid var(--line); border-radius:16px; background:var(--card); padding:16px; }
.screen { min-height:150px; white-space:pre-wrap; font-family:ui-monospace,monospace; font-size:.95rem; padding:12px; border-radius:8px; background:var(--bg); border:1px solid var(--line); }
.row { display:flex; gap:8px; margin-top:12px; }
.row input { flex:1; }
.row button { width:auto; margin:0; padding:12px 18px; }
ul { list-style:none; padding:0; margin:8px 0 0; }
.pick { width:auto; margin:0 8px 0 0; padding:4px 12px; font-size:.9rem; }
.said { margin-top:10px; font-size:.9rem; color:var(--muted); min-height:1.2em; }
li { border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:var(--card); font-size:.92rem; }
`;

function demoPanel(demo: DemoAccount[], demoOnly: boolean): string {
  if (demo.length === 0) return "";
  const rows = demo
    .map(
      (a) =>
        `<li><button type="button" class="pick" data-phone="${escapeHtml(a.phone)}">${escapeHtml(a.name)}</button> ${escapeHtml(a.phone)} &middot; PIN <strong>${escapeHtml(a.pin)}</strong></li>`,
    )
    .join("");
  return `<h1 style="margin-top:20px;font-size:1.15rem">Demo traders</h1>
<p class="muted">Ready-made wallets with test sats. They have each other saved as contacts. Pick one, or type another number${demoOnly ? " in the practice range" : ""} to sign up from scratch.</p>
<ul id="demo">${rows}</ul>`;
}

function simulator(ussdCode: string, canListen: boolean, demo: DemoAccount[], demoOnly: boolean): string {
  return page(
    "Simulator",
    `<h1>Phone simulator</h1>
<p class="muted">Dials ${escapeHtml(ussdCode)} against this server the way Africa's Talking would.${demoOnly ? " This public demo only accepts the practice numbers +2348030000000 to +2348030000099. Real phones use the USSD code." : " Development only."}</p>
${demoPanel(demo, demoOnly)}
<label for="phone">Phone number</label>
<input id="phone" value="+2348030000001" inputmode="tel">
<div class="phone">
  <div class="screen" id="screen" aria-live="polite">Press Dial to start.</div>
  <form class="row" id="f">
    <input id="input" aria-label="Reply" autocomplete="off" disabled>
    <button id="go" type="submit">Dial</button>
  </form>
</div>
<h1 style="margin-top:28px;font-size:1.15rem">Voice call</h1>
<p class="muted">${canListen ? "Hold the microphone button and speak Hausa, or type what you would say." : "Type what you would say. Set STT_URL to speak instead."}</p>
<div class="phone">
  <div class="screen" id="vscreen" aria-live="polite">Press Call to start.</div>
  <div class="said" id="said"></div>
  <form class="row" id="vf">
    <input id="vinput" aria-label="What you say" autocomplete="off" disabled>
    ${canListen ? `<button id="mic" type="button" disabled>Hold to speak</button>` : ""}
    <button id="vgo" type="submit">Call</button>
  </form>
</div>
<h1 style="margin-top:28px;font-size:1.15rem">SMS inbox</h1>
<ul id="sms"><li class="muted">No messages yet.</li></ul>
<script>
const $ = (id) => document.getElementById(id);
let session = null, text = "";
async function refreshSms() {
  const res = await fetch("/sim/sms?phone=" + encodeURIComponent($("phone").value));
  if (!res.ok) return;
  const list = await res.json();
  $("sms").replaceChildren(...(list.length ? list : [{ message: "No messages yet." }]).map((m) => {
    const li = document.createElement("li");
    li.textContent = m.message;
    return li;
  }));
}
async function step() {
  const body = new URLSearchParams({ sessionId: session, serviceCode: ${JSON.stringify(ussdCode)}, phoneNumber: $("phone").value, text });
  const res = await fetch("/sim/ussd", { method: "POST", body });
  const reply = await res.text();
  const open = reply.startsWith("CON ");
  $("screen").textContent = reply.slice(4);
  $("input").disabled = !open;
  $("input").value = "";
  $("go").textContent = open ? "Send" : "Dial";
  if (open) $("input").focus(); else session = null;
  setTimeout(refreshSms, 400);
  setTimeout(refreshSms, 5000);
}
$("f").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!session) { session = "sim-" + Date.now(); text = ""; }
  else { text = text ? text + "*" + $("input").value : $("input").value; }
  step();
});
let call = null, expecting = "end";
function showVoice(step) {
  expecting = step.expect;
  $("vscreen").textContent = step.say;
  const open = step.expect !== "end";
  $("vinput").disabled = !open;
  $("vinput").value = "";
  $("vinput").type = step.expect === "pin" ? "password" : "text";
  $("vinput").placeholder = step.expect === "pin" ? "PIN" : step.expect === "speech" ? "tura dubu biyar zuwa Musa" : "";
  $("vgo").textContent = open ? "Send" : "Call";
  if ($("mic")) $("mic").disabled = step.expect !== "speech";
  if (open) $("vinput").focus(); else call = null;
  setTimeout(refreshSms, 400);
  setTimeout(refreshSms, 5000);
}
async function voice(action, value) {
  const body = new URLSearchParams({ callId: call, phone: $("phone").value, action, value: value || "" });
  const res = await fetch("/sim/voice", { method: "POST", body });
  showVoice(await res.json());
}
$("vf").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!call) { call = "call-" + Date.now(); $("said").textContent = ""; voice("start"); return; }
  if (expecting === "speech") $("said").textContent = "You said: " + $("vinput").value;
  voice(expecting === "pin" ? "pin" : "say", $("vinput").value);
});
if ($("mic")) {
  let recorder = null, chunks = [];
  const begin = async () => {
    if (recorder) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType });
      recorder = null;
      $("said").textContent = "Listening...";
      const res = await fetch("/sim/voice/transcribe?phone=" + encodeURIComponent($("phone").value), { method: "POST", headers: { "content-type": blob.type }, body: blob });
      if (!res.ok) { $("said").textContent = "Could not transcribe."; return; }
      const { text } = await res.json();
      $("said").textContent = "Heard: " + text;
      voice("say", text);
    };
    recorder.start();
    $("mic").textContent = "Release to send";
  };
  const finish = () => { if (recorder && recorder.state === "recording") recorder.stop(); $("mic").textContent = "Hold to speak"; };
  $("mic").addEventListener("pointerdown", begin);
  $("mic").addEventListener("pointerup", finish);
  $("mic").addEventListener("pointerleave", finish);
}
document.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => {
  $("phone").value = b.dataset.phone;
  session = null; call = null;
  $("screen").textContent = "Press Dial to start.";
  $("vscreen").textContent = "Press Call to start.";
  $("go").textContent = "Dial"; $("vgo").textContent = "Call";
  $("input").disabled = true; $("vinput").disabled = true;
  refreshSms();
}));
refreshSms();
</script>`,
    CSS,
  );
}

export type SimulatorDeps = {
  store: Store;
  calls: VoiceCalls;
  transcribe?: Transcriber;
  ussdCode: string;
  ussd: (req: UssdRequest) => Promise<UssdResult>;
  demo?: DemoAccount[];
  demoOnly?: boolean;
};

export function registerSimulatorRoutes(app: FastifyInstance, deps: SimulatorDeps): void {
  const allowed = (input: string | undefined): string | undefined => {
    const phone = normalisePhone(input ?? "");
    return phone && (!deps.demoOnly || isDemoPhone(phone)) ? phone : undefined;
  };

  app.get("/sim", async (_req, reply) =>
    reply
      .type("text/html")
      .send(simulator(deps.ussdCode, Boolean(deps.transcribe), deps.demo ?? [], Boolean(deps.demoOnly))),
  );

  app.get<{ Querystring: { phone?: string } }>("/sim/sms", async (req, reply) => {
    const phone = allowed(req.query.phone);
    if (!phone) return reply.code(400).send([]);
    return deps.store.smsFor(phone).map((m) => ({ message: m.message, at: m.createdAt }));
  });

  type UssdForm = { sessionId?: string; phoneNumber?: string; text?: string };
  app.post<{ Body: UssdForm }>("/sim/ussd", async (req, reply) => {
    reply.type("text/plain");
    const body = req.body ?? {};
    const phone = allowed(body.phoneNumber);
    if (!phone || !body.sessionId) return "END Use a practice number: +2348030000000 to +2348030000099.";
    try {
      const result = await deps.ussd({ sessionId: `sim-${body.sessionId}`, phoneNumber: phone, text: body.text ?? "" });
      result.background?.catch((err: Error) => req.log.error({ err: err.message }, "ussd background task failed"));
      return result.reply;
    } catch (err) {
      req.log.error({ err: (err as Error).message }, "simulator ussd failed");
      return "END An samu matsala. Sake gwadawa.";
    }
  });

  type VoiceForm = { callId?: string; phone?: string; action?: string; value?: string };
  app.post<{ Body: VoiceForm }>("/sim/voice", async (req, reply) => {
    const { callId, phone, action, value } = req.body ?? {};
    if (!callId) return reply.code(400).send({ say: "Missing call", expect: "end" });
    if (!allowed(phone)) return { say: "Use a practice number: +2348030000000 to +2348030000099.", expect: "end" };
    let step: VoiceStep;
    if (action === "start") step = deps.calls.start(`sim-${callId}`, phone ?? "");
    else if (action === "pin") step = await deps.calls.digits(`sim-${callId}`, value ?? "");
    else step = await deps.calls.heard(`sim-${callId}`, value ?? "");
    step.background?.catch((err: Error) => req.log.error({ err: err.message }, "voice background task failed"));
    return { say: step.say, expect: step.expect };
  });

  if (deps.transcribe) {
    const transcribe = deps.transcribe;
    app.addContentTypeParser(/^audio\//, { parseAs: "buffer", bodyLimit: 5 * 1024 * 1024 }, (_req, body, done) => done(null, body));
    app.post<{ Body: Buffer; Querystring: { phone?: string } }>("/sim/voice/transcribe", async (req, reply) => {
      try {
        return { text: await transcribe(req.body, req.headers["content-type"] ?? "audio/webm", deps.calls.names(allowed(req.query.phone) ?? "")) };
      } catch (err) {
        req.log.error({ err: (err as Error).message }, "transcription failed");
        return reply.code(502).send({ error: "TRANSCRIPTION_FAILED" });
      }
    });
  }
}
