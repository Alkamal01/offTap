import type { FastifyInstance } from "fastify";
import type { Store } from "../db.js";
import { normalisePhone } from "../phone.js";
import { isDemoPhone, type DemoAccount } from "../seed.js";
import type { UssdRequest, UssdResult } from "../ussd/handler.js";
import type { VoiceCalls, VoiceStep } from "../voice/call.js";
import type { Transcriber } from "../voice/speech.js";
import { readFileSync } from "node:fs";
import { escapeHtml } from "./html.js";

const CSS = `
:root { --bg:#0b0c10; --panel:#14161d; --bezel:#05060a; --screen:#f4f2ec; --ink:#16181d; --soft:#5d6472; --line:#d8d4c8; --brand:#4b5874; --brand-ink:#fff; --ok:#1a7f37; --bad:#b3261e; --text:#eceef2; --dim:#9aa1b0; }
* { box-sizing:border-box; }
html, body { height:100%; }
body { margin:0; background:radial-gradient(1200px 600px at 50% -10%, #1b2030 0%, var(--bg) 60%); color:var(--text); font:15px/1.4 system-ui,sans-serif; display:flex; flex-direction:column; overflow:hidden; }
header { display:flex; align-items:center; gap:12px; padding:10px 20px; flex:none; }
header img { width:38px; height:38px; object-fit:contain; }
header h1 { font-size:1.15rem; margin:0; letter-spacing:.2px; }
header p { margin:0; color:var(--dim); font-size:.82rem; }
.traders { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; font-size:.78rem; color:var(--dim); }
.traders span { border:1px solid #2a2f3d; border-radius:999px; padding:3px 10px; white-space:nowrap; }
.traders b { color:var(--text); font-weight:600; }
.stage { flex:1; min-height:0; display:flex; justify-content:center; align-items:stretch; gap:clamp(16px,5vw,72px); padding:4px 16px 14px; }
.phone { width:min(350px, 46vw); max-height:760px; align-self:center; height:100%; background:var(--bezel); border:1px solid #2a2f3d; border-radius:38px; padding:12px; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,.55), inset 0 0 0 2px #1a1d27; position:relative; }
.phone::before { content:""; position:absolute; top:20px; left:50%; width:64px; height:6px; margin-left:-32px; border-radius:6px; background:#23273a; z-index:3; }
.glass { flex:1; min-height:0; background:var(--screen); color:var(--ink); border-radius:28px; display:flex; flex-direction:column; overflow:hidden; position:relative; }
.status { display:flex; justify-content:space-between; align-items:center; padding:22px 16px 6px; font-size:.72rem; color:var(--soft); flex:none; }
.owner { display:flex; gap:8px; align-items:center; padding:4px 12px 8px; flex:none; }
.owner select, .owner input { flex:1; min-width:0; font:inherit; font-size:.86rem; padding:7px 8px; border:1px solid var(--line); border-radius:10px; background:#fff; color:var(--ink); }
.owner .pin { font-size:.74rem; color:var(--soft); white-space:nowrap; }
.tabs { display:flex; gap:4px; padding:0 12px; border-bottom:1px solid var(--line); flex:none; }
.tabs button { flex:1; border:0; background:none; font:inherit; font-size:.84rem; font-weight:600; color:var(--soft); padding:8px 0; border-bottom:3px solid transparent; cursor:pointer; position:relative; }
.tabs button[aria-selected="true"] { color:var(--brand); border-bottom-color:var(--brand); }
.badge { display:none; min-width:17px; height:17px; line-height:17px; border-radius:9px; background:var(--bad); color:#fff; font-size:.66rem; margin-left:5px; padding:0 4px; vertical-align:1px; }
.badge.on { display:inline-block; }
.pane { flex:1; min-height:0; display:none; flex-direction:column; }
.pane.on { display:flex; }
.view { flex:1; min-height:0; overflow-y:auto; padding:12px; font-size:.9rem; }
.ussd { white-space:pre-wrap; font-family:ui-monospace,Menlo,monospace; font-size:.86rem; background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; min-height:120px; }
.result { margin-top:10px; }
.hint { color:var(--soft); font-size:.78rem; margin-top:8px; }
.turn { margin:0 0 8px; padding:8px 10px; border-radius:12px; background:#fff; border:1px solid var(--line); white-space:pre-wrap; max-width:92%; }
.turn.me { margin-left:auto; background:var(--brand); border-color:var(--brand); color:var(--brand-ink); }
.turn.note { background:none; border:0; color:var(--soft); font-size:.78rem; padding:0 2px; max-width:100%; }
.turn.bad { background:#fdecea; border-color:#f3b8b2; color:var(--bad); }
.turn.sms, .msg { background:#eaf6ee; border:1px solid #bfe0c8; border-radius:12px; padding:8px 10px; margin:0 0 8px; font-size:.86rem; }
.msg time { display:block; font-size:.7rem; color:var(--soft); margin-top:3px; }
.empty { color:var(--soft); text-align:center; margin-top:28px; font-size:.84rem; }
form.entry { display:flex; gap:6px; padding:8px 10px 12px; border-top:1px solid var(--line); background:#ebe8df; flex:none; }
form.entry input { flex:1; min-width:0; font:inherit; padding:9px 10px; border:1px solid var(--line); border-radius:10px; background:#fff; color:var(--ink); }
form.entry input:disabled { background:#f3f1ea; }
button.go, button.mic { border:0; border-radius:10px; font:inherit; font-weight:700; padding:9px 13px; cursor:pointer; background:var(--brand); color:var(--brand-ink); white-space:nowrap; }
button.mic { background:#fff; color:var(--brand); border:1px solid var(--brand); touch-action:none; }
button.mic.rec { background:var(--bad); border-color:var(--bad); color:#fff; }
button:disabled { opacity:.45; cursor:default; }
input:focus, select:focus, button:focus-visible { outline:2px solid var(--brand); outline-offset:1px; }
.secret { -webkit-text-security:disc; }
.toast { position:absolute; left:10px; right:10px; top:10px; z-index:5; background:#16181d; color:#fff; border-radius:14px; padding:10px 12px; font-size:.82rem; box-shadow:0 8px 24px rgba(0,0,0,.35); transform:translateY(-140%); visibility:hidden; transition:transform .25s ease, visibility .25s; cursor:pointer; }
.toast.on { transform:none; visibility:visible; }
.toast b { display:block; font-size:.7rem; color:#aab3c5; margin-bottom:2px; }
@media (max-width:720px) {
  body { overflow:auto; }
  .traders { display:none; }
  .stage { flex-direction:column; align-items:center; }
  .phone { width:min(360px, 94vw); height:620px; flex:none; }
}
@media (prefers-reduced-motion: reduce) { .toast { transition:none; } }
`;

function phoneMarkup(index: number, canListen: boolean): string {
  return `<section class="phone" data-phone-index="${index}" aria-label="Phone ${index + 1}">
  <div class="glass">
    <div class="toast" role="status"><b>New SMS</b><span></span></div>
    <div class="status"><span>offTap Sim ${index + 1}</span><span class="clock"></span></div>
    <div class="owner">
      <select aria-label="Whose phone this is"></select>
      <input class="number" aria-label="Phone number" inputmode="tel" hidden>
      <span class="pin"></span>
    </div>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" data-tab="ussd" aria-selected="true">USSD</button>
      <button type="button" role="tab" data-tab="voice" aria-selected="false">Voice</button>
      <button type="button" role="tab" data-tab="sms" aria-selected="false">SMS<span class="badge"></span></button>
    </div>
    <div class="pane on" data-pane="ussd">
      <div class="view"><div class="ussd" aria-live="polite">Press Dial to start.</div><div class="result"></div></div>
      <form class="entry" data-form="ussd">
        <input aria-label="USSD reply" name="offtap-ussd" autocomplete="off" inputmode="text" disabled>
        <button class="go" type="submit">Dial</button>
      </form>
    </div>
    <div class="pane" data-pane="voice">
      <div class="view log" aria-live="polite"><p class="empty">Press Call, then ${canListen ? "hold the mic and speak Hausa, or type" : "type"} what you would say.<br>Example: tura dari biyar zuwa Musa</p></div>
      <form class="entry" data-form="voice">
        <input aria-label="What you say" name="offtap-say" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore disabled>
        ${canListen ? `<button class="mic" type="button" disabled aria-label="Hold to speak">Mic</button>` : ""}
        <button class="go" type="submit">Call</button>
      </form>
    </div>
    <div class="pane" data-pane="sms">
      <div class="view inbox"><p class="empty">No messages yet.</p></div>
    </div>
  </div>
</section>`;
}

const SCRIPT = `
const CONFIG = JSON.parse(document.getElementById("config").textContent);
const post = async (url, fields) => {
  const res = await fetch(url, { method: "POST", body: new URLSearchParams(fields) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res;
};
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function mountPhone(root, index) {
  const q = (sel) => root.querySelector(sel);
  const select = q("select"), number = q(".number"), pinLabel = q(".pin");
  const ussdScreen = q(".ussd"), ussdResult = q(".result"), log = q(".log"), inbox = q(".inbox");
  const ussdForm = q('[data-form="ussd"]'), voiceForm = q('[data-form="voice"]');
  const ussdInput = ussdForm.querySelector("input"), ussdGo = ussdForm.querySelector(".go");
  const voiceInput = voiceForm.querySelector("input"), voiceGo = voiceForm.querySelector(".go"), mic = voiceForm.querySelector(".mic");
  const toast = q(".toast"), badge = q(".badge");
  const state = { session: null, text: "", call: null, expecting: "end", busy: false, seen: null, unread: 0, awaiting: null, tab: "ussd" };

  CONFIG.demo.forEach((a) => select.append(new Option(a.name + "  " + a.phone, a.phone)));
  select.append(new Option("Another number...", ""));
  if (CONFIG.demo.length === 0) { select.hidden = true; number.hidden = false; number.value = "+23480300000" + String(index + 1).padStart(2, "0"); }
  else select.selectedIndex = Math.min(index, CONFIG.demo.length - 1);

  const phone = () => (select.hidden || select.value === "" ? number.value.trim() : select.value);
  const inUse = () => Boolean(state.session || state.call);

  function ownerChanged() {
    const custom = !select.hidden && select.value === "";
    if (!select.hidden) number.hidden = !custom;
    if (custom && !number.value) number.value = "+2348030000010";
    const account = CONFIG.demo.find((a) => a.phone === phone());
    pinLabel.textContent = account ? "PIN " + account.pin : "";
    state.seen = null; state.unread = 0; state.awaiting = null;
    badge.classList.remove("on");
    ussdScreen.textContent = "Press Dial to start."; ussdResult.replaceChildren();
    refreshSms();
  }
  select.addEventListener("change", () => { if (!inUse()) ownerChanged(); });
  number.addEventListener("change", () => { if (!inUse()) ownerChanged(); });
  function lockOwner() { select.disabled = inUse(); number.readOnly = inUse(); }

  function showTab(name) {
    state.tab = name;
    root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    root.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("on", p.dataset.pane === name));
    if (name === "sms") { state.unread = 0; badge.classList.remove("on"); }
  }
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  toast.addEventListener("click", () => { toast.classList.remove("on"); showTab("sms"); });

  let toastTimer = null;
  async function refreshSms() {
    let list;
    try {
      const res = await fetch("/sim/sms?phone=" + encodeURIComponent(phone()));
      if (!res.ok) return;
      list = await res.json();
    } catch { return; }
    const key = (m) => m.at + "|" + m.message;
    const top = list.length ? key(list[0]) : "";
    if (state.seen !== null && top && top !== state.seen) {
      const fresh = [];
      for (const m of list) { if (key(m) === state.seen) break; fresh.push(m); }
      toast.querySelector("span").textContent = fresh[0].message;
      toast.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("on"), 7000);
      if (state.tab !== "sms") { state.unread += fresh.length; badge.textContent = state.unread; badge.classList.add("on"); }
      if (state.awaiting) {
        const target = state.awaiting === "voice" ? log : ussdResult;
        target.append(el("div", "turn sms", fresh[fresh.length - 1].message));
        target.scrollTop = target.scrollHeight;
        state.awaiting = null;
      }
    }
    state.seen = top;
    inbox.replaceChildren(...(list.length ? list.map((m) => {
      const item = el("div", "msg", m.message);
      item.append(el("time", "", new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
      return item;
    }) : [el("p", "empty", "No messages yet.")]));
  }

  async function ussdStep() {
    ussdGo.disabled = true;
    let reply;
    try {
      reply = await (await post("/sim/ussd", { sessionId: state.session, phoneNumber: phone(), text: state.text })).text();
    } catch (err) {
      reply = "END Could not reach the server (" + err.message + "). Press Dial to try again.";
    }
    ussdGo.disabled = false;
    const open = reply.startsWith("CON ");
    ussdScreen.textContent = reply.slice(4);
    ussdInput.disabled = !open;
    ussdInput.value = "";
    ussdGo.textContent = open ? "Send" : "Dial";
    if (open) ussdInput.focus();
    else { state.session = null; state.awaiting = "ussd"; setTimeout(() => { if (state.awaiting === "ussd") state.awaiting = null; }, 90000); }
    lockOwner();
    refreshSms();
  }
  ussdForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (ussdGo.disabled) return;
    if (!state.session) { state.session = "s" + index + "-" + Date.now(); state.text = ""; ussdResult.replaceChildren(); }
    else state.text = state.text ? state.text + "*" + ussdInput.value : ussdInput.value;
    ussdStep();
  });

  function say(cls, text) {
    log.querySelector(".empty")?.remove();
    log.append(el("div", "turn " + cls, text));
    log.scrollTop = log.scrollHeight;
  }
  function setBusy(on) {
    state.busy = on;
    voiceGo.disabled = on;
    if (mic) mic.disabled = on || state.expecting !== "speech";
  }
  function showVoice(step) {
    state.expecting = step.expect || "end";
    if (step.say) say("", step.say); else say("bad", "No reply from the server. Try again.");
    const open = state.expecting !== "end";
    voiceInput.disabled = !open;
    voiceInput.value = "";
    voiceInput.classList.toggle("secret", state.expecting === "pin");
    voiceInput.inputMode = state.expecting === "pin" ? "numeric" : "text";
    voiceInput.placeholder = state.expecting === "pin" ? "PIN" : state.expecting === "speech" ? "tura dari biyar zuwa Musa" : "";
    voiceGo.textContent = open ? "Send" : "Call";
    if (mic) mic.disabled = state.expecting !== "speech";
    if (open) voiceInput.focus();
    else {
      state.call = null;
      if (step.pending) { say("note", "Call ended. Waiting for the payment result..."); state.awaiting = "voice"; setTimeout(() => { if (state.awaiting === "voice") state.awaiting = null; }, 90000); }
      else say("note", "Call ended.");
    }
    lockOwner();
  }
  async function voice(action, value) {
    if (state.busy) return;
    setBusy(true);
    say("note wait", "Please wait...");
    try {
      const res = await post("/sim/voice", { callId: state.call, phone: phone(), action, value: value || "" });
      const step = await res.json();
      log.querySelector(".wait")?.remove();
      setBusy(false);
      showVoice(step);
    } catch (err) {
      log.querySelector(".wait")?.remove();
      setBusy(false);
      say("bad", "Could not reach the server (" + err.message + "). Try again.");
    }
  }
  voiceForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.busy) return;
    if (!state.call) { state.call = "c" + index + "-" + Date.now(); log.replaceChildren(); lockOwner(); voice("start"); return; }
    say("me", state.expecting === "pin" ? "PIN ****" : voiceInput.value);
    voice(state.expecting === "pin" ? "pin" : "say", voiceInput.value);
  });

  if (mic) {
    let recorder = null, chunks = [];
    const begin = async (e) => {
      e.preventDefault();
      if (recorder || mic.disabled) return;
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { say("bad", "The browser did not allow the microphone. Type the sentence instead."); return; }
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => chunks.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        recorder = null;
        if (blob.size < 2000) { say("bad", "Too short. Hold the mic while you speak, then release."); return; }
        say("note wait", "Listening...");
        try {
          const res = await fetch("/sim/voice/transcribe?phone=" + encodeURIComponent(phone()), { method: "POST", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob });
          log.querySelector(".wait")?.remove();
          if (!res.ok) throw new Error("HTTP " + res.status);
          const { text } = await res.json();
          say("me", text || "(nothing heard)");
          voice("say", text);
        } catch (err) {
          log.querySelector(".wait")?.remove();
          say("bad", "Could not transcribe (" + err.message + "). Hold and speak again, or type the sentence.");
        }
      };
      recorder.start();
      mic.classList.add("rec");
      mic.textContent = "Release";
    };
    const finish = () => {
      if (recorder && recorder.state === "recording") recorder.stop();
      mic.classList.remove("rec");
      mic.textContent = "Mic";
    };
    mic.addEventListener("pointerdown", begin);
    mic.addEventListener("pointerup", finish);
    mic.addEventListener("pointerleave", finish);
    mic.addEventListener("pointercancel", finish);
  }

  ownerChanged();
  setInterval(refreshSms, 3000);
}
document.querySelectorAll(".phone").forEach(mountPhone);
const tick = () => document.querySelectorAll(".clock").forEach((c) => (c.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
tick(); setInterval(tick, 20000);
`;

function simulator(ussdCode: string, canListen: boolean, demo: DemoAccount[], demoOnly: boolean): string {
  const config = JSON.stringify({ demo, demoOnly }).replace(/</g, "\\u003c");
  const traders = demo.map((a) => `<span><b>${escapeHtml(a.name)}</b> PIN ${escapeHtml(a.pin)}</span>`).join("");
  const note = demoOnly
    ? "Practice numbers only: +2348030000000 to 99. Real phones dial the code."
    : `Two phones on ${escapeHtml(ussdCode)}. Send from one, watch the SMS land on the other.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>offTap simulator</title>
<link rel="icon" href="/assets/logo.png">
<style>${CSS}</style>
</head>
<body>
<header>
  <img src="/assets/logo.png" alt="">
  <div><h1>offTap</h1><p>${note}</p></div>
  <div class="traders" aria-label="Demo traders">${traders}</div>
</header>
<main class="stage">
${phoneMarkup(0, canListen)}
${phoneMarkup(1, canListen)}
</main>
<script type="application/json" id="config">${config}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}

function audioType(body: Buffer, declared: string | undefined): string {
  if (declared?.startsWith("audio/")) return declared;
  const head = body.subarray(0, 4).toString("latin1");
  if (head === "OggS") return "audio/ogg";
  if (head === "RIFF") return "audio/wav";
  if (body.subarray(4, 8).toString("latin1") === "ftyp") return "audio/mp4";
  return "audio/webm";
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

  const logo = readFileSync(new URL("../../public/logo.png", import.meta.url));
  app.get("/assets/logo.png", async (_req, reply) =>
    reply.type("image/png").header("cache-control", "public, max-age=86400").send(logo),
  );

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
    else {
      if (!deps.calls.active(`sim-${callId}`)) deps.calls.start(`sim-${callId}`, phone ?? "");
      step = await deps.calls.heard(`sim-${callId}`, value ?? "");
    }
    step.background?.catch((err: Error) => req.log.error({ err: err.message }, "voice background task failed"));
    return { say: step.say, expect: step.expect, pending: Boolean(step.background) };
  });

  if (deps.transcribe) {
    const transcribe = deps.transcribe;
    app.addContentTypeParser(
      /^(audio\/|video\/webm|application\/octet-stream)/,
      { parseAs: "buffer", bodyLimit: 5 * 1024 * 1024 },
      (_req, body, done) => done(null, body),
    );
    app.post<{ Body: Buffer; Querystring: { phone?: string } }>("/sim/voice/transcribe", async (req, reply) => {
      try {
        return { text: await transcribe(req.body, audioType(req.body, req.headers["content-type"]), deps.calls.names(allowed(req.query.phone) ?? "")) };
      } catch (err) {
        req.log.error({ err: (err as Error).message }, "transcription failed");
        return reply.code(502).send({ error: "TRANSCRIPTION_FAILED" });
      }
    });
  }
}
