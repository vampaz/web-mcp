export const chatStyles = `
:host {
  display:block; box-sizing:border-box; min-inline-size:0;
  max-block-size:var(--webmcp-chat-height,75dvh);
  color:var(--webmcp-chat-color,#222b3c); background:var(--webmcp-chat-background,#fff);
  font:inherit; font-size:.875rem; line-height:1.5;
  border:1px solid var(--webmcp-chat-border,#e1e5ed);
  border-radius:var(--webmcp-chat-radius,1rem); overflow:auto;
}
* { box-sizing:border-box }
.panel {
  display:grid; grid-template-rows:auto minmax(8em,1fr) auto;
  max-block-size:calc(var(--webmcp-chat-height,75dvh) - 2px);
  min-block-size:min(32rem,calc(var(--webmcp-chat-height,75dvh) - 2px));
}
header {
  display:flex; align-items:center; justify-content:space-between; gap:.4rem;
  padding:.65rem .85rem; border-block-end:1px solid var(--webmcp-chat-border,#e1e5ed);
}
.identity { display:flex; gap:.6rem; align-items:center; flex:1; min-inline-size:0 }
h2 { font-size:.95rem; font-weight:650; letter-spacing:-.02em; margin:0; overflow-wrap:anywhere }
.assistant-mark { display:grid; place-items:center; flex:none; inline-size:2rem; block-size:2rem; color:var(--webmcp-chat-accent,#325ce8); background:var(--webmcp-chat-user-background,#f0f3ff); border-radius:.65rem }
svg { display:block; inline-size:1.15rem; block-size:1.15rem; flex:none }
.header-actions,.actions { display:flex; align-items:center; gap:.25rem }
button,textarea { font:inherit }
button { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; cursor:pointer; min-block-size:2.5rem; padding:.45rem .8rem; border:1px solid var(--webmcp-chat-border,#e1e5ed); border-radius:.55rem; color:inherit; background:var(--webmcp-chat-background,#fff) }
button:hover:enabled { background:var(--webmcp-chat-user-background,#f0f3ff) }
button:disabled { opacity:.4; cursor:default }
.icon-button { flex:none; inline-size:2.25rem; min-block-size:2.25rem; padding:.5rem; border-color:transparent; color:var(--webmcp-chat-muted,#657087) }
button:focus-visible,textarea:focus-visible,summary:focus-visible,.transcript:focus-visible { outline:2px solid var(--webmcp-chat-accent,#325ce8); outline-offset:3px }
.conversation { display:grid; position:relative; min-block-size:8em; min-inline-size:0 }
.transcript { overflow:auto; overscroll-behavior:contain; min-block-size:0; padding:1.1rem; scrollbar-gutter:stable; scroll-padding-block:1rem }
ol { list-style:none; padding:0; margin:0; display:grid; gap:1.25rem }
li { min-inline-size:0; overflow-wrap:anywhere; line-height:1.65 }
li strong { display:block; font-size:.74rem; font-weight:600; color:var(--webmcp-chat-muted,#657087); margin-block-end:.25rem }
li p { white-space:pre-wrap; margin:0 }
li[data-role=user] { justify-self:end; max-inline-size:90%; background:var(--webmcp-chat-user-background,#f0f3ff); border-radius:.85rem .85rem .2rem .85rem; padding:.7rem .95rem }
li[data-role=assistant] { padding-inline:.15rem }
li[data-role=tool] { border:1px solid var(--webmcp-chat-border,#e1e5ed); border-radius:.6rem; font-size:.78rem; padding:.55rem .7rem; color:var(--webmcp-chat-muted,#657087) }
summary { cursor:pointer; font-weight:500 }
pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; margin-block:.5rem }
[data-empty] { text-align:center; max-inline-size:28ch; margin:clamp(1rem,5vh,3rem) auto; color:var(--webmcp-chat-muted,#657087); line-height:1.7 }
.working { display:flex; align-items:center; margin:1.25rem 0 0; padding-inline:.15rem; color:var(--webmcp-chat-muted,#657087) }
.working-dots { display:inline-flex; align-items:center; gap:.25rem }
.working-dots span { inline-size:.4rem; block-size:.4rem; border-radius:50%; background:currentColor; animation:webmcp-chat-working 1.2s ease-in-out infinite }
.working-dots span:nth-child(2) { animation-delay:.15s }
.working-dots span:nth-child(3) { animation-delay:.3s }
@keyframes webmcp-chat-working { 0%,60%,100% { opacity:.25; transform:translateY(0) } 30% { opacity:1; transform:translateY(-.15rem) } }
.composer { display:grid; gap:.7rem; padding:.85rem; border-block-start:1px solid var(--webmcp-chat-border,#e1e5ed) }
.message-box { border:1px solid var(--webmcp-chat-border,#e1e5ed); border-radius:.8rem; padding:.35rem; background:var(--webmcp-chat-background,#fff) }
.message-box:focus-within { border-color:var(--webmcp-chat-accent,#325ce8); box-shadow:0 0 0 3px color-mix(in srgb,var(--webmcp-chat-accent,#325ce8) 9%,transparent) }
textarea { display:block; inline-size:100%; min-inline-size:0; resize:vertical; min-block-size:3.8em; padding:.55rem .65rem; color:inherit; background:transparent; border:0; border-radius:.4rem; line-height:1.5 }
textarea::placeholder { color:var(--webmcp-chat-muted,#657087) }
textarea:focus-visible { outline:none }
.message-box .actions { justify-content:flex-end; padding:.1rem }
.send { color:var(--webmcp-chat-button-color,#fff); background:var(--webmcp-chat-accent,#325ce8); border:0; border-radius:.6rem }
.send:hover:enabled { background:var(--webmcp-chat-accent,#325ce8); filter:brightness(.92) }
[data-stop] { padding:.3rem .6rem; min-block-size:2.25rem; font-size:.78rem; border:0 }
.suggestions { display:flex; flex-wrap:wrap; gap:.45rem }
.suggestions button { font-size:.78rem; min-block-size:2rem; border-radius:2rem; padding:.35rem .7rem; text-align:start }
.composer-meta { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:baseline; gap:.35rem .75rem; color:var(--webmcp-chat-muted,#657087); font-size:.68rem }
.status,.hint,.limit { margin:0; overflow-wrap:anywhere }
.status { flex:1 }
.hint { line-height:1.5 }
.limit { font-size:.75rem; font-variant-numeric:tabular-nums; color:var(--webmcp-chat-muted,#657087) }
textarea[aria-invalid=true] { outline:2px solid currentColor; outline-offset:-2px }
.jump-latest { position:absolute; inset-block-end:.5rem; inset-inline-end:.75rem; max-inline-size:calc(100% - 1.5rem); font-size:.75rem; border-radius:2rem; box-shadow:0 .15rem .6rem #222b3c14 }
li[data-layout=failed] { border-inline-start:.2rem solid currentColor; padding-inline-start:.75rem }
.visually-hidden { position:absolute; inline-size:1px; block-size:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0 }
.suggestions:empty,[hidden] { display:none!important }
@media(max-height:36rem) { header,.composer { padding:.6rem; gap:.4rem } textarea { min-block-size:3em } }
@media(prefers-reduced-motion:reduce) { * { scroll-behavior:auto!important } .working-dots span { animation:none; opacity:.6 } }
`

export const popupStyles = `
:host([data-mode=popup]) { display:contents }
.presentation[popover] { position:fixed; inset:0; inline-size:100%; block-size:100%; max-inline-size:none; max-block-size:none; padding:0; margin:0; border:0; background:transparent; color:inherit; overflow:visible; pointer-events:none }
.presentation[popover] .panel,.launcher { pointer-events:auto; position:fixed }
.presentation[popover] .panel { inline-size:min(26rem,calc(100dvw - 1rem)); block-size:min(36rem,calc(100dvh - 5rem)); min-inline-size:min(20rem,var(--webmcp-popup-available-width,calc(100dvw - 1rem))); max-inline-size:var(--webmcp-popup-available-width,calc(100dvw - 1rem)); min-block-size:min(18rem,var(--webmcp-popup-available-height,calc(100dvh - 1rem))); max-block-size:var(--webmcp-popup-available-height,calc(100dvh - 1rem)); overflow:auto; color:var(--webmcp-chat-color,#222b3c); background:var(--webmcp-chat-background,#fff); border:1px solid var(--webmcp-chat-border,#e1e5ed); border-radius:var(--webmcp-chat-radius,1rem); box-shadow:0 1.25rem 4rem #17203324,0 .2rem .6rem #1720330a }
.launcher { display:grid; place-items:center; inline-size:3.25rem; block-size:3.25rem; min-block-size:3.25rem; border:0; border-radius:1.1rem; padding:.8rem; color:var(--webmcp-chat-button-color,#fff); background:var(--webmcp-chat-accent,#325ce8); box-shadow:0 .3rem 1rem #17203326; touch-action:none; user-select:none }
.launcher svg { inline-size:1.4rem; block-size:1.4rem }
.launcher:hover:enabled { background:var(--webmcp-chat-accent,#325ce8); filter:brightness(.94) }
.resize-grip { position:absolute; inset-inline-end:0; inset-block-end:0; display:grid; place-items:center; inline-size:1.2rem; block-size:1.2rem; cursor:nwse-resize; touch-action:none; user-select:none; color:var(--webmcp-chat-muted,#657087) }
.resize-grip svg { inline-size:1rem; block-size:1rem }
.move { touch-action:none; user-select:none; cursor:move; inline-size:1.5rem; padding:.15rem }
.presentation[popover] header { gap:.25rem }
`
