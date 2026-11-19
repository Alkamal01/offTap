import type { FastifyInstance } from "fastify";
import type { VoiceCalls, VoiceStep } from "./call.js";
import { say } from "./messages.js";
import { downloadRecording, type Transcriber } from "./speech.js";

export type VoiceRouteDeps = {
  calls: VoiceCalls;
  transcribe?: Transcriber;
  download?: typeof downloadRecording;
  authorised: (token: string | undefined) => boolean;
  reserved?: (phoneNumber: string) => boolean;
};

type VoiceBody = {
  isActive?: string;
  sessionId?: string;
  direction?: string;
  callerNumber?: string;
  destinationNumber?: string;
  dtmfDigits?: string;
  recordingUrl?: string;
};

const xml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

export function voiceXml(step: VoiceStep): string {
  const spoken = `<Say>${xml(step.say)}</Say>`;
  const action =
    step.expect === "speech"
      ? `<Record finishOnKey="#" maxLength="8" trimSilence="true" playBeep="true">${spoken}</Record>`
      : step.expect === "pin"
        ? `<GetDigits timeout="20" finishOnKey="#" numDigits="4">${spoken}</GetDigits>`
        : spoken;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${action}</Response>`;
}

export function registerVoiceRoutes(app: FastifyInstance, deps: VoiceRouteDeps): void {
  const { calls } = deps;
  const download = deps.download ?? downloadRecording;

  app.post<{ Body: VoiceBody; Params: { token?: string } }>("/voice/:token?", async (req, reply) => {
    reply.type("application/xml");
    if (!deps.authorised(req.params.token)) return reply.code(403).send(voiceXml({ say: "Forbidden", expect: "end" }));
    const body = req.body ?? {};
    const callId = body.sessionId;
    if (!callId) return reply.code(400).send(voiceXml({ say: say.error, expect: "end" }));
    if (body.isActive === "0") {
      calls.hangup(callId);
      return reply.type("text/plain").send("");
    }

    const caller = body.direction?.toLowerCase() === "outbound" ? body.destinationNumber : body.callerNumber;
    let step: VoiceStep;
    try {
      if (deps.reserved?.(caller ?? "")) step = { say: say.error, expect: "end" };
      else if (!calls.active(callId)) step = calls.start(callId, caller ?? "");
      else if (body.dtmfDigits) step = await calls.digits(callId, body.dtmfDigits);
      else if (body.recordingUrl && deps.transcribe) {
        const recording = await download(body.recordingUrl);
        step = await calls.heard(callId, await deps.transcribe(recording.audio, recording.contentType, calls.names(caller ?? "")));
      } else step = await calls.heard(callId, "");
    } catch (err) {
      req.log.error({ err: (err as Error).message }, "voice request failed");
      calls.hangup(callId);
      step = { say: say.error, expect: "end" };
    }
    req.log.info({ expect: step.expect }, "voice");
    step.background?.catch((err: Error) => req.log.error({ err: err.message }, "voice background task failed"));
    return voiceXml(step);
  });
}
