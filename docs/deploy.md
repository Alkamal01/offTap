# Deploying

offTap is one long-running container with a small disk. It needs a host that keeps the process alive and the disk attached, because sessions are held in memory and payments finish after the USSD reply is sent. Serverless platforms such as Vercel or Netlify will not work.

## What the host must provide

- Runs the [Dockerfile](../Dockerfile) as a single instance (no scaling to several copies)
- A persistent volume mounted at `/data`
- A public https address
- Does not put the service to sleep when idle. USSD has only a few seconds to answer

## Settings

| Variable | Value |
|---|---|
| `PUBLIC_URL` | The public https address, no trailing slash |
| `SERVER_SECRET` | A long random string. Generate one with `openssl rand -hex 32` and never change it afterwards, or stored wallets become unreadable |
| `USSD_WEBHOOK_TOKEN` | Another random string. It becomes part of the callback URLs |
| `AT_USERNAME`, `AT_API_KEY` | From Africa's Talking (`sandbox` and a sandbox key while testing) |
| `USSD_CODE` | The code Africa's Talking gave you, for example `*384*8879#` |
| `GROQ_API_KEY` | Optional, for speech |
| `PUBLIC_DEMO` | `true` to keep the practice simulator at `/sim` next to real phones |
| `WALLET_PROVIDER` | `faucet` for test sats (default), or `albyhub` with `ALBY_HUB_URL` and `ALBY_HUB_TOKEN` for real sats |

## Railway

1. New project, deploy from the GitHub repository. Railway picks up the Dockerfile.
2. Add a volume to the service, mounted at `/data`.
3. Add the variables above. Also set `RAILWAY_RUN_UID=0`, because Railway mounts volumes as root and the image otherwise runs as a non-root user that cannot write to it.
4. Under Networking, generate a domain and set the target port to `3000`. If you leave `PUBLIC_URL` empty, that domain is used.
5. Open `https://<domain>/health`. It should return `{"ok":true}`.

## Africa's Talking

With `USSD_WEBHOOK_TOKEN=abc123` and the domain `offtap.example.com`:

| Channel | Callback URL |
|---|---|
| USSD | `https://offtap.example.com/ussd/abc123` |
| Voice | `https://offtap.example.com/voice/abc123` |

SMS needs no callback. Then dial the code in the Africa's Talking simulator with a number that is **not** in the practice range `+2348030000000` to `+2348030000099`, since those are reserved for the public demo.

## Checking it

```bash
curl https://offtap.example.com/health
curl https://offtap.example.com/ussd/abc123 -d sessionId=test -d phoneNumber=+2348051234567 -d text=
```

The second command should print the welcome menu starting with `CON`.
