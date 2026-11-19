import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import Fastify, { LogController } from "fastify";
import formbody from "@fastify/formbody";
import { createActions } from "./actions.js";
import { config } from "./config.js";
import { Store } from "./db.js";
import { registerPayAddressRoutes, type PayAddressDeps } from "./lightning/lnurlp.js";
import { describeWallet, getBalanceSats, invoiceSettled, makeInvoice } from "./lightning/nwc.js";
import { PaymentError, quoteNgn, sendNgn } from "./payments.js";
import { getRate } from "./rates.js";
import { normalisePhone } from "./phone.js";
import { DEMO_ACCOUNTS, isDemoPhone, seedDemo } from "./seed.js";
import { createSmsSender, type SmsSender } from "./sms.js";
import { createUssdHandler, type Wallet } from "./ussd/handler.js";
import { msg } from "./ussd/messages.js";
import { createVoiceCalls } from "./voice/call.js";
import { registerVoiceRoutes } from "./voice/routes.js";
import { createTranscriber, type Transcriber } from "./voice/speech.js";
import { providerFromConfig, type WalletProvider } from "./wallets/provider.js";
import { registerLinkRoutes } from "./web/link.js";
import { registerSimulatorRoutes } from "./web/sim.js";

export type ServerOptions = {
  store?: Store;
  wallet?: Wallet;
  provider?: WalletProvider | null;
  sms?: SmsSender;
  describeWallet?: typeof describeWallet;
  transcribe?: Transcriber | null;
  invoices?: Pick<PayAddressDeps, "makeInvoice" | "invoiceSettled" | "watchEveryMs">;
  publicUrl?: string;
  serverSecret?: string;
  ussdWebhookToken?: string;
  simulator?: boolean | "demo";
  seed?: boolean;
  logger?: boolean;
};

const liveWallet: Wallet = {
  quote: quoteNgn,
  send: sendNgn,
  balanceSats: getBalanceSats,
  ngnPerBtc: async () => (await getRate()).ngnPerBtc,
};

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function buildServer(options: ServerOptions = {}) {
  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? "info" },
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: true,
  });
  app.register(formbody);

  const store = options.store ?? new Store(join(config.dataDir, "offtap.db"));
  const serverSecret = options.serverSecret ?? config.serverSecret;
  const sms = options.sms ?? createSmsSender(store, (err) => app.log.warn({ err: err.message }, "sms delivery failed"));
  const publicUrl = options.publicUrl ?? config.publicUrl;
  const token = options.ussdWebhookToken ?? config.ussdWebhookToken;
  const simulator =
    options.simulator === undefined ? config.simulator : options.simulator === true ? "open" : options.simulator || "off";
  const reserved = (phoneNumber: string) => simulator === "demo" && isDemoPhone(normalisePhone(phoneNumber) ?? "");

  const provider = options.provider === undefined ? providerFromConfig(config) : options.provider;

  const wallet = options.wallet ?? liveWallet;
  const transcribe = options.transcribe === undefined ? createTranscriber(config.speech) : (options.transcribe ?? undefined);
  const actions = createActions({ store, sms, wallet, serverSecret, dailyLimitSats: config.dailyLimitSats });
  const calls = createVoiceCalls({
    store,
    actions,
    wallet,
    ussdCode: config.ussdCode,
  });

  const handleUssd = createUssdHandler({
    store,
    sms,
    wallet,
    ...(provider ? { provider } : {}),
    serverSecret,
    publicUrl,
    ussdCode: config.ussdCode,
    dailyLimitSats: config.dailyLimitSats,
    maxPaymentSats: config.maxPaymentSats,
  });

  app.get("/health", async () => ({ ok: true }));

  app.get<{ Querystring: { ngn?: string } }>("/quote", async (req, reply) => {
    try {
      return await quoteNgn(Number(req.query.ngn));
    } catch (err) {
      if (err instanceof PaymentError) return reply.code(400).send({ error: err.code, message: err.message });
      req.log.error({ err: (err as Error).message }, "quote failed");
      return reply.code(502).send({ error: "RATE_UNAVAILABLE", message: "Could not fetch the BTC/NGN rate" });
    }
  });

  type UssdBody = { sessionId?: string; phoneNumber?: string; text?: string };
  app.post<{ Body: UssdBody; Params: { token?: string } }>("/ussd/:token?", async (req, reply) => {
    reply.type("text/plain");
    if (token && !sameToken(req.params.token ?? "", token)) return reply.code(403).send("END Forbidden");
    const body = req.body ?? {};
    if (!body.sessionId || !body.phoneNumber) return reply.code(400).send(`END ${msg.error}`);
    if (reserved(body.phoneNumber)) return reply.code(403).send(`END ${msg.error}`);
    try {
      const result = await handleUssd({ sessionId: body.sessionId, phoneNumber: body.phoneNumber, text: body.text ?? "" });
      req.log.info({ step: body.text ? body.text.split("*").length : 0, open: result.reply.startsWith("CON") }, "ussd");
      result.background?.catch((err: Error) => req.log.error({ err: err.message }, "ussd background task failed"));
      return result.reply;
    } catch (err) {
      req.log.error({ err: (err as Error).message }, "ussd request failed");
      return `END ${msg.error}`;
    }
  });

  registerPayAddressRoutes(app, {
    store,
    sms,
    serverSecret,
    publicUrl,
    maxSats: config.maxPaymentSats,
    ngnPerBtc: wallet.ngnPerBtc,
    ...(options.invoices ?? { makeInvoice, invoiceSettled }),
  });

  registerVoiceRoutes(app, {
    calls,
    ...(transcribe ? { transcribe } : {}),
    authorised: (given) => !token || sameToken(given ?? "", token),
    reserved,
  });

  registerLinkRoutes(app, {
    store,
    sms,
    describeWallet: options.describeWallet ?? describeWallet,
    serverSecret,
    ussdCode: config.ussdCode,
  });

  if (simulator !== "off") {
    registerSimulatorRoutes(app, {
      store,
      calls,
      ...(transcribe ? { transcribe } : {}),
      ussdCode: config.ussdCode,
      ussd: handleUssd,
      demoOnly: simulator === "demo",
      demo: options.seed ? DEMO_ACCOUNTS : [],
    });
  }

  if (options.seed && provider) {
    const seed = async (attempt: number): Promise<void> => {
      try {
        app.log.info({ result: await seedDemo({ store, provider, actions, wallet, serverSecret }) }, "demo data");
      } catch (err) {
        if (attempt < 5) {
          setTimeout(() => void seed(attempt + 1), 15_000).unref();
          return;
        }
        app.log.warn({ err: (err as Error).message }, "could not create demo data, sign up from the simulator instead");
      }
    };
    app.addHook("onReady", async () => void seed(1));
  }

  app.addHook("onClose", async () => {
    if (!options.store) store.close();
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer({ seed: config.seedDemo });
  app.log.info({ simulator: config.simulator, seed: config.seedDemo, wallets: config.walletProvider }, "starting");
  app
    .listen({ port: config.port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
