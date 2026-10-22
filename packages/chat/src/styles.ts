export const chatStyles = `
:host {
  --_color:var(--webmcp-chat-color,light-dark(#222b3c,#e4e8f1));
  --_background:var(--webmcp-chat-background,light-dark(#fff,#161b26));
  --_muted:var(--webmcp-chat-muted,light-dark(#657087,#9ba5b9));
  --_accent:var(--webmcp-chat-accent,light-dark(#325ce8,#8ea8ff));
  --_border:var(--webmcp-chat-border,light-dark(#e1e5ed,#2f3748));
  --_user-background:var(--webmcp-chat-user-background,light-dark(#f0f3ff,#212b45));
  --_button-color:var(--webmcp-chat-button-color,light-dark(#fff,#0e1424));
  --_error:var(--webmcp-chat-error,light-dark(#b42318,#ff8f85));
  color-scheme:light;
  display:grid; grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr);
  box-sizing:border-box; min-inline-size:0;
  min-block-size:min(var(--webmcp-chat-min-height,36.5em),var(--webmcp-chat-height,75dvh));
  max-block-size:var(--webmcp-chat-height,75dvh);
  color:var(--_color); background:var(--_background);
  font:inherit; font-size:.875rem; line-height:1.5;
  border:1px solid var(--_border);
  border-radius:var(--webmcp-chat-radius,1.15em); overflow:auto;
}
:host([data-theme=dark]) { color-scheme:dark }
:host([data-theme=auto]) { color-scheme:light dark }
* { box-sizing:border-box }
.presentation:not([popover]) { display:contents }
.panel { display:grid; grid-template-rows:auto minmax(8em,1fr) auto; min-block-size:0 }
header {
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.45em;
  padding:.75em .95em; border-block-end:1px solid var(--_border);
}
.identity { display:flex; gap:.7em; align-items:center; flex:1; min-inline-size:0 }
h2 { font-size:1.085em; font-weight:650; letter-spacing:-.02em; margin:0; overflow-wrap:anywhere }
.assistant-mark { display:grid; place-items:center; flex:none; inline-size:2.3em; block-size:2.3em; color:var(--_accent); background:var(--_user-background); border-radius:.75em }
svg { display:block; inline-size:1.3em; block-size:1.3em; flex:none }
.header-actions,.actions { display:flex; align-items:center; gap:.3em }
button,textarea { font:inherit }
button { display:inline-flex; align-items:center; justify-content:center; gap:.45em; cursor:pointer; min-block-size:2.85em; padding:.5em .9em; border:1px solid var(--_border); border-radius:.63em; color:inherit; background:var(--_background) }
button:hover:enabled { background:var(--_user-background) }
button:disabled { opacity:.4; cursor:default }
.icon-button { flex:none; inline-size:2.6em; min-block-size:2.6em; padding:.57em; border-color:transparent; color:var(--_muted) }
button:focus-visible,textarea:focus-visible,summary:focus-visible,.transcript:focus-visible { outline:2px solid var(--_accent); outline-offset:3px }
.transcript:focus-visible { outline-offset:-2px }
.confirm-clear { flex:1 0 100%; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.5em .75em; padding:.6em .75em; border:1px solid var(--_error); border-radius:.63em; background:color-mix(in srgb,var(--_error) 6%,var(--_background)) }
.confirm-clear p { margin:0; flex:1 1 14em }
.confirm-actions { display:flex; flex-wrap:wrap; gap:.45em }
[data-confirm-clear] { color:var(--_background); background:var(--_error); border-color:transparent }
[data-confirm-clear]:hover:enabled { background:var(--_error); filter:brightness(.92) }
.conversation { display:grid; position:relative; min-block-size:8em; min-inline-size:0 }
.transcript { overflow:auto; overscroll-behavior:contain; min-block-size:0; padding:1.25em; scrollbar-gutter:stable; scroll-padding-block:1.15em }
ol { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:minmax(0,1fr); gap:1.43em }
li { min-inline-size:0; overflow-wrap:anywhere; line-height:1.65 }
li strong { display:block; font-size:.85em; font-weight:600; color:var(--_muted); margin-block-end:.34em }
.body { white-space:pre-wrap; margin:0 }
.body[data-custom] { white-space:normal }
li[data-role=user] { justify-self:end; max-inline-size:90%; background:var(--_user-background); border-radius:.97em; border-end-end-radius:.23em; padding:.8em 1.1em }
li[data-role=assistant] { padding-inline:.17em }
li[data-role=tool] { border:1px solid var(--_border); border-radius:.77em; font-size:.89em; padding:.7em .9em; color:var(--_muted) }
summary { cursor:pointer; font-weight:500 }
pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; margin-block:.5em }
.tool-sections { display:grid; gap:.6em; margin-block-start:.5em }
.tool-heading { margin:0 0 .25em; font-weight:600 }
.tool-section pre { margin:0; padding:.6em .7em; overflow-x:auto; white-space:pre; overflow-wrap:normal; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; line-height:1.5; color:var(--_color); background:color-mix(in srgb,var(--_muted) 9%,transparent); border-radius:.45em }
code { font:inherit }
[data-empty] { text-align:center; max-inline-size:28ch; margin:clamp(1.15em,5vh,3.4em) auto; color:var(--_muted); line-height:1.7 }
[data-empty] p { margin:0 }
.working { display:flex; align-items:center; gap:.6em; margin:1.43em 0 0; padding-inline:.17em; color:var(--_muted) }
.working-dots { display:inline-flex; align-items:center; gap:.3em }
.working-dots span { inline-size:.45em; block-size:.45em; border-radius:50%; background:currentColor; animation:webmcp-chat-working 1.2s ease-in-out infinite }
.working-dots span:nth-child(2) { animation-delay:.15s }
.working-dots span:nth-child(3) { animation-delay:.3s }
@keyframes webmcp-chat-working { 0%,60%,100% { opacity:.25; transform:translateY(0) } 30% { opacity:1; transform:translateY(-.17em) } }
.composer { display:grid; gap:.8em; padding:.95em; border-block-start:1px solid var(--_border) }
.message-box { border:1px solid var(--_border); border-radius:.9em; padding:.4em; background:var(--_background) }
.message-box:focus-within { border-color:var(--_accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--_accent) 9%,transparent) }
textarea { display:block; inline-size:100%; min-inline-size:0; resize:vertical; min-block-size:3.8em; padding:.63em .75em; color:inherit; background:transparent; border:0; border-radius:.45em; line-height:1.5 }
textarea::placeholder { color:var(--_muted) }
textarea:focus-visible { outline:none }
.message-box .actions { justify-content:flex-end; padding:.1em }
.send { color:var(--_button-color); background:var(--_accent); border:0; border-radius:.7em }
.send:hover:enabled { background:var(--_accent); filter:brightness(.92) }
[data-stop],[data-edit-last] { padding:.38em .77em; min-block-size:2.88em; font-size:.89em }
[data-stop] { border:0 }
.suggestions { display:flex; flex-wrap:wrap; gap:.5em }
.suggestions button { font-size:.89em; min-block-size:2.56em; border-radius:2.6em; padding:.45em .9em; text-align:start }
.composer-meta { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:.4em .85em }
.status,.hint,.limit { margin:0; overflow-wrap:anywhere }
.status { flex:1; display:flex; align-items:flex-start; gap:.4em }
.status:has(span:not(:empty)) { flex:1 1 14em }
.status[data-tone=error] { color:var(--_error); font-weight:500 }
.status svg { display:none; inline-size:1.15em; block-size:1.15em; margin-block-start:.2em }
.status[data-tone=error] svg { display:block }
.hint { font-size:.78em; line-height:1.5; color:var(--_muted) }
.limit { font-size:.86em; font-variant-numeric:tabular-nums; color:var(--_muted) }
textarea[aria-invalid=true] { outline:2px solid currentColor; outline-offset:-2px }
.jump-latest { position:absolute; inset-block-end:.67em; inset-inline-end:1em; max-inline-size:calc(100% - 2em); font-size:.86em; border-radius:2.67em; box-shadow:0 .2em .8em #222b3c14 }
li[data-layout=failed] { border-inline-start:.23em solid currentColor; padding-inline-start:.85em }
.visually-hidden { position:absolute; inline-size:1px; block-size:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0 }
.suggestions:empty,[hidden] { display:none!important }
@media(max-height:36rem) { header,.composer { padding:.7em; gap:.45em } textarea { min-block-size:3em } }
@media(pointer:coarse) { textarea { font-size:max(1rem,16px) } .hint { display:none } }
@media(prefers-reduced-motion:reduce) { * { scroll-behavior:auto!important } .working-dots span { animation:none; opacity:.6 } }
@media(forced-colors:active) { .working-dots span { background:CanvasText; forced-color-adjust:none } :host button { border:1px solid ButtonText } }
`

export const popupStyles = `
:host([data-mode=popup]) { display:contents }
.presentation[popover] { position:fixed; inset:0; inline-size:100%; block-size:100%; max-inline-size:none; max-block-size:none; padding:var(--webmcp-chat-offset,.5rem); margin:0; border:0; background:transparent; color:inherit; overflow:visible; pointer-events:none }
.presentation[popover] .panel,.launcher { pointer-events:auto; position:fixed }
.presentation[popover] .panel { inline-size:min(var(--webmcp-chat-popup-width,30em),calc(100dvw - 2 * var(--webmcp-chat-offset,.5rem))); block-size:min(var(--webmcp-chat-popup-height,41em),calc(100dvh - 3.75em - 3 * var(--webmcp-chat-offset,.5rem))); min-inline-size:min(23em,var(--webmcp-popup-available-width,calc(100dvw - 2 * var(--webmcp-chat-offset,.5rem)))); max-inline-size:var(--webmcp-popup-available-width,calc(100dvw - 2 * var(--webmcp-chat-offset,.5rem))); min-block-size:min(20.5em,var(--webmcp-popup-available-height,calc(100dvh - 2 * var(--webmcp-chat-offset,.5rem)))); max-block-size:var(--webmcp-popup-available-height,calc(100dvh - 2 * var(--webmcp-chat-offset,.5rem))); overflow:auto; color:var(--_color); background:var(--_background); border:1px solid var(--_border); border-radius:var(--webmcp-chat-radius,1.15em); box-shadow:0 1.4em 4.6em #17203324,0 .23em .7em #1720330a }
.presentation[popover] .panel[data-expanded] { inline-size:var(--webmcp-chat-popup-expanded-width,52em); block-size:var(--webmcp-chat-popup-expanded-height,50em) }
.launcher { display:grid; place-items:center; inline-size:3.75em; block-size:3.75em; min-block-size:3.75em; border:0; border-radius:1.25em; padding:.9em; color:var(--_button-color); background:var(--_accent); box-shadow:0 .35em 1.15em #17203326; touch-action:none; user-select:none }
.launcher svg { inline-size:1.6em; block-size:1.6em }
.launcher:hover:enabled { background:var(--_accent); filter:brightness(.94) }
.resize-grip { position:absolute; inset-inline-end:0; inset-block-end:0; display:grid; place-items:center; inline-size:1.4em; block-size:1.4em; cursor:nwse-resize; touch-action:none; user-select:none; color:var(--_muted) }
.resize-grip svg { inline-size:1.15em; block-size:1.15em }
.resize-grip:dir(rtl) { cursor:nesw-resize }
.resize-grip:dir(rtl) svg { transform:scaleX(-1) }
.move { touch-action:none; user-select:none; cursor:move; inline-size:1.7em; padding:.17em }
.presentation[popover] header { gap:.3em }
@media(max-width:30rem) {
  .presentation[popover] .panel { inset:auto 0 0!important; inline-size:auto!important; block-size:min(var(--webmcp-chat-popup-height,41em),85dvh)!important; min-inline-size:0; max-inline-size:none; border-inline:0; border-block-end:0; border-end-start-radius:0; border-end-end-radius:0 }
  .presentation[popover] .move,.presentation[popover] [data-resize],.presentation[popover] .resize-grip { display:none }
}
`
