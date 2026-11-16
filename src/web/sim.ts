import type { FastifyInstance } from "fastify";
import type { Store } from "../db.js";
import { normalisePhone } from "../phone.js";
import { escapeHtml, page } from "./html.js";

const CSS = `
.phone { margin-top:16px; border:1px solid var(--line); border-radius:16px; background:var(--card); padding:16px; }
.screen { min-height:150px; white-space:pre-wrap; font-family:ui-monospace,monospace; font-size:.95rem; padding:12px; border-radius:8px; background:var(--bg); border:1px solid var(--line); }
.row { display:flex; gap:8px; margin-top:12px; }
.row input { flex:1; }
.row button { width:auto; margin:0; padding:12px 18px; }
ul { list-style:none; padding:0; margin:8px 0 0; }
li { border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:var(--card); font-size:.92rem; }
`;

function simulator(ussdCode: string, ussdPath: string): string {
  return page(
    "Simulator",
    `<h1>Phone simulator</h1>
<p class="muted">Dials ${escapeHtml(ussdCode)} against this server the way Africa's Talking would. Development only.</p>
<label for="phone">Phone number</label>
<input id="phone" value="+2348030000001" inputmode="tel">
<div class="phone">
  <div class="screen" id="screen" aria-live="polite">Press Dial to start.</div>
  <form class="row" id="f">
    <input id="input" aria-label="Reply" autocomplete="off" disabled>
    <button id="go" type="submit">Dial</button>
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
  const res = await fetch(${JSON.stringify(ussdPath)}, { method: "POST", body });
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
refreshSms();
</script>`,
    CSS,
  );
}

export function registerSimulatorRoutes(app: FastifyInstance, deps: { store: Store; ussdCode: string; ussdPath: string }): void {
  app.get("/sim", async (_req, reply) => reply.type("text/html").send(simulator(deps.ussdCode, deps.ussdPath)));

  app.get<{ Querystring: { phone?: string } }>("/sim/sms", async (req, reply) => {
    const phone = normalisePhone(req.query.phone ?? "");
    if (!phone) return reply.code(400).send([]);
    return deps.store.smsFor(phone).map((m) => ({ message: m.message, at: m.createdAt }));
  });
}
