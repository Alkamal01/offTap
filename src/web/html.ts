export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
:root { --bg:#fbfaf7; --fg:#1c1b19; --muted:#5f5b53; --line:#d9d4c8; --accent:#0b6b3a; --accent-fg:#fff; --error:#a32020; --card:#fff; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#141412; --fg:#f1efe9; --muted:#aaa59a; --line:#3a3832; --accent:#3fbf7f; --accent-fg:#06200f; --error:#ff8a80; --card:#1d1c19; }
}
* { box-sizing: border-box; }
body { margin:0; padding:24px 16px 48px; background:var(--bg); color:var(--fg); font:17px/1.5 system-ui,sans-serif; }
main { max-width:460px; margin:0 auto; }
h1 { font-size:1.5rem; line-height:1.2; margin:0 0 4px; }
.muted { color:var(--muted); font-size:.92rem; }
.error { color:var(--error); font-weight:600; }
label { display:block; margin:18px 0 6px; font-weight:600; }
label span { display:block; font-weight:400; font-size:.85rem; color:var(--muted); }
input, textarea { width:100%; padding:12px; font:inherit; color:var(--fg); background:var(--card); border:1px solid var(--line); border-radius:8px; }
textarea { font-size:.85rem; font-family:ui-monospace,monospace; word-break:break-all; }
input:focus, textarea:focus, button:focus-visible { outline:3px solid var(--accent); outline-offset:1px; }
button { margin-top:22px; width:100%; padding:14px; font:inherit; font-weight:700; color:var(--accent-fg); background:var(--accent); border:0; border-radius:8px; cursor:pointer; }
`;

export function page(title: string, body: string, extraCss = ""): string {
  return `<!doctype html>
<html lang="ha">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - offTap</title>
<style>${CSS}${extraCss}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}
