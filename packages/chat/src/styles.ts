export const chatStyles = `
:host {
  --_color:var(--webmcp-chat-color,light-dark(#171c27,#e4e8f1));
  --_background:var(--webmcp-chat-background,light-dark(#fff,#161b26));
  --_surface:var(--webmcp-chat-surface,light-dark(#f6f7f9,#1d2330));
  --_muted:var(--webmcp-chat-muted,light-dark(#5f6b7f,#9ba5b9));
  --_accent:var(--webmcp-chat-accent,light-dark(#3b5bdb,#8ea8ff));
  --_border:var(--webmcp-chat-border,light-dark(#e6e8ee,#2f3748));
  --_line-strong:var(--webmcp-chat-line-strong,light-dark(#d3d8e1,#3c465b));
  --_user-background:var(--webmcp-chat-user-background,light-dark(#eef2fe,#212b45));
  --_button-color:var(--webmcp-chat-button-color,light-dark(#fff,#0e1424));
  --_error:var(--webmcp-chat-error,light-dark(#b42318,#ff8f85));
  --_success:var(--webmcp-chat-success,light-dark(#15803d,#6fd49a));
  --_warning:var(--webmcp-chat-warning,light-dark(#8a5007,#f0b45a));
  --_mono:var(--webmcp-chat-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);
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
.panel[data-settings-open] { grid-template-rows:auto minmax(0,1fr) }
.panel[data-settings-open] [data-clear] { display:none }
:host(:not([data-mode=popup])) .panel[data-settings-open] { grid-template-rows:minmax(0,1fr) }
:host(:not([data-mode=popup])) .panel[data-settings-open] > header { display:none }
.settings-panel { display:grid; grid-template-rows:auto minmax(0,1fr); min-inline-size:0; min-block-size:0; background:var(--_surface) }
.settings-heading { display:flex; align-items:center; gap:.4em; min-block-size:4.15em; padding:.5em .7em; background:var(--_background); border-block-end:1px solid var(--_border) }
.settings-heading h3 { margin:0; font-size:1em; font-weight:600; letter-spacing:-.01em }
.settings-back svg:dir(rtl) { transform:scaleX(-1) }
.settings-body { display:grid; align-content:start; gap:1.4em; min-block-size:0; padding:1.4em 1.15em; overflow:auto; overscroll-behavior:contain }
.settings-detail,.settings-error { margin:0; font-size:.9em; overflow-wrap:anywhere; color:var(--_muted) }
.settings-error { color:var(--_error) }
.settings-card { min-inline-size:0; margin:0; padding:0; border:1px solid var(--_border); border-radius:.85em; background:var(--_background) }
.settings-panel :disabled { opacity:.65; cursor:not-allowed }
.settings-approval { display:flex; align-items:start; gap:.7em; padding:.85em 1em; cursor:pointer }
.settings-approval input { flex:none; margin:.25em 0 0; accent-color:var(--_accent) }
.settings-approval input:focus-visible { outline:2px solid var(--_accent); outline-offset:3px }
.settings-approval strong,.settings-approval small { display:block }
.settings-approval strong { font-weight:500 }
.settings-approval small { margin-block-start:.2em; color:var(--_muted) }
header {
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.45em;
  min-block-size:4.15em; padding:.55em .7em .55em 1em; border-block-end:1px solid var(--_border);
}
.identity { display:flex; gap:.7em; align-items:center; flex:1; min-inline-size:0 }
h2 { font-size:1em; font-weight:600; letter-spacing:-.01em; margin:0; overflow-wrap:anywhere }
.assistant-mark { display:grid; place-items:center; flex:none; inline-size:2.15em; block-size:2.15em; color:var(--_accent); background:var(--_user-background); border-radius:.6em }
svg { display:block; inline-size:1.3em; block-size:1.3em; flex:none }
.header-actions,.actions { display:flex; align-items:center; gap:.15em }
button,textarea,input { font:inherit }
button { display:inline-flex; align-items:center; justify-content:center; gap:.45em; cursor:pointer; min-block-size:2.75em; padding:.5em .9em; border:1px solid var(--_line-strong); border-radius:.65em; color:inherit; background:var(--_background) }
button:hover:enabled { background:var(--_surface) }
button:disabled { opacity:.45; cursor:default }
.icon-button { flex:none; inline-size:2.4em; min-block-size:2.4em; padding:.5em; border-color:transparent; border-radius:.6em; color:var(--_muted); background:transparent }
.icon-button:hover:enabled { color:var(--_color) }
.icon-button svg { inline-size:1.2em; block-size:1.2em }
button:focus-visible,textarea:focus-visible,summary:focus-visible,input:focus-visible,.transcript:focus-visible,.model-list:focus-visible { outline:2px solid var(--_accent); outline-offset:2px }
.transcript:focus-visible,.model-list:focus-visible { outline-offset:-2px }
.conversation { display:grid; position:relative; min-block-size:8em; min-inline-size:0 }
.transcript { overflow:auto; overscroll-behavior:contain; min-block-size:0; padding:1.4em 1.15em; scrollbar-gutter:stable; scroll-padding-block:1.15em }
ol { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:minmax(0,1fr); gap:1.15em }
li { min-inline-size:0; overflow-wrap:anywhere; line-height:1.62 }
li strong { display:block; font-size:.85em; font-weight:600; color:var(--_muted); margin-block-end:.34em }
li[data-layout=message] > strong { position:absolute; inline-size:1px; block-size:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap }
.body { white-space:pre-wrap; margin:0 }
.body[data-custom] { white-space:normal }
li[data-role=user] { justify-self:end; max-inline-size:85%; background:var(--_user-background); border-radius:1.15em 1.15em .35em 1.15em; padding:.6em .95em; line-height:1.45 }
li[data-role=assistant] { padding-inline:.1em }
.message-actions { display:flex; gap:.1em; margin:.15em 0 0 -.45em }
.message-actions .icon-button { inline-size:2.1em; min-block-size:2.1em; padding:.45em; color:var(--_muted) }
.message-actions svg { inline-size:1.05em; block-size:1.05em }
summary { cursor:pointer; font-weight:500 }
pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; margin-block:.5em }
li[data-layout=tools] { overflow:hidden; border:1px solid var(--_border); border-radius:.85em; background:var(--_background); font-size:.92em; line-height:1.45 }
.tools-summary { display:flex; align-items:center; gap:.55em; margin:0; padding:.55em .9em; color:var(--_muted); font-weight:500; background:var(--_surface); border-block-end:1px solid var(--_border) }
.tools-summary svg { inline-size:1em; block-size:1em }
.tool-call + .tool-call { border-block-start:1px solid var(--_border) }
.tool-call > summary { display:flex; align-items:center; gap:.6em; min-block-size:2.75em; padding:.45em .9em; list-style:none }
.tool-call > summary::-webkit-details-marker { display:none }
.tool-call > summary:focus-visible { outline-offset:-2px }
.tool-state { display:grid; place-items:center; flex:none; inline-size:1.35em; block-size:1.35em; border-radius:50%; color:var(--_success); background:color-mix(in srgb,var(--_success) 12%,transparent) }
.tool-state svg { inline-size:.85em; block-size:.85em; stroke-width:2.6 }
.tool-call[data-status=failed] .tool-state { color:var(--_error); background:color-mix(in srgb,var(--_error) 12%,transparent) }
.tool-call[data-status=unknown] .tool-state { color:var(--_warning); background:color-mix(in srgb,var(--_warning) 14%,transparent) }
.tool-line { display:flex; align-items:center; gap:.55em; flex:1; min-inline-size:0 }
.tool-name { flex:none; max-inline-size:60%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--_mono); font-size:.93em; font-weight:500 }
.tool-args { flex:0 1 auto; min-inline-size:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:.05em .45em; font-family:var(--_mono); font-size:.82em; color:var(--_muted); background:var(--_surface); border:1px solid var(--_border); border-radius:.4em }
.tool-outcome { flex:none; margin-inline-start:auto; font-size:.9em; font-weight:500; color:var(--_error) }
.tool-call[data-status=unknown] .tool-outcome { color:var(--_warning) }
.tool-chevron { inline-size:1em; block-size:1em; margin-inline-start:auto; color:var(--_muted); transition:transform .15s }
.tool-outcome:not([hidden]) ~ .tool-chevron { margin-inline-start:0 }
.tool-chevron:dir(rtl) { transform:scaleX(-1) }
.tool-call[open] .tool-chevron { transform:rotate(90deg) }
.tool-call[data-status=unknown] { background:color-mix(in srgb,var(--_warning) 5%,transparent) }
.tool-sections { display:grid; gap:.6em; padding:0 .9em .85em 2.85em }
.tool-heading { margin:0 0 .25em; font-size:.78em; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--_muted) }
.tool-section pre { margin:0; padding:.6em .75em; max-block-size:16em; overflow:auto; white-space:pre; overflow-wrap:normal; font-family:var(--_mono); font-size:.92em; line-height:1.55; color:var(--_color); background:var(--_surface); border:1px solid var(--_border); border-radius:.55em }
code { font:inherit }
[data-empty] { text-align:center; max-inline-size:28ch; margin:clamp(1.15em,5vh,3.4em) auto; color:var(--_muted); line-height:1.7 }
[data-empty][data-custom] { max-inline-size:none; margin:0; text-align:start; color:inherit; line-height:inherit }
[data-empty] p { margin:0 }
.working { display:flex; align-items:center; gap:.6em; margin:1.15em 0 0; padding-inline:.1em; color:var(--_muted) }
.working[data-kind=tool] { min-block-size:2.75em; padding:.45em .9em; border:1px solid var(--_border); border-radius:.85em; font-size:.92em }
.working[data-kind=tool] .working-dots { inline-size:1.35em; block-size:1.35em; border:2px solid color-mix(in srgb,var(--_accent) 22%,transparent); border-block-start-color:var(--_accent); border-radius:50%; animation:webmcp-chat-spin .8s linear infinite }
.working[data-kind=tool] .working-dots span { display:none }
.working-dots { display:inline-flex; align-items:center; gap:.3em }
.working-dots span { inline-size:.45em; block-size:.45em; border-radius:50%; background:currentColor; animation:webmcp-chat-working 1.2s ease-in-out infinite }
.working-dots span:nth-child(2) { animation-delay:.15s }
.working-dots span:nth-child(3) { animation-delay:.3s }
@keyframes webmcp-chat-working { 0%,60%,100% { opacity:.25; transform:translateY(0) } 30% { opacity:1; transform:translateY(-.17em) } }
@keyframes webmcp-chat-spin { to { transform:rotate(1turn) } }
.composer { display:grid; grid-template-columns:minmax(0,1fr); gap:.55em; padding:.6em .85em .8em }
.message-box { position:relative; border:1px solid var(--_line-strong); border-radius:1em; padding:.75em .6em .5em 1em; background:var(--_background); box-shadow:0 1px 2px #1018280a,0 .4em 1.1em #1018280d }
.message-box:focus-within { border-color:color-mix(in srgb,var(--_accent) 55%,var(--_line-strong)); box-shadow:0 0 0 .3em color-mix(in srgb,var(--_accent) 11%,transparent),0 .4em 1.1em #1018280d }
textarea { display:block; inline-size:100%; min-inline-size:0; resize:none; field-sizing:content; min-block-size:3em; max-block-size:12em; padding:0; color:inherit; background:transparent; border:0; line-height:1.5; font-size:1.02em }
textarea::placeholder { color:var(--_muted) }
textarea:focus-visible { outline:none }
textarea:disabled { cursor:not-allowed }
.composer-bar { display:flex; align-items:center; justify-content:space-between; gap:.5em; margin-block-start:.35em }
.composer-tools { display:flex; align-items:center; gap:.3em; min-inline-size:0 }
.send,[data-stop] { inline-size:2.2em; min-block-size:2.2em; padding:.45em; border:0; border-radius:.65em; color:var(--_button-color); background:var(--_accent) }
.send:hover:enabled { background:var(--_accent); filter:brightness(.92) }
.send:disabled { opacity:1; color:var(--_muted); background:var(--_surface) }
.send svg { inline-size:1.1em; block-size:1.1em; stroke-width:2.2 }
[data-stop] { color:var(--_background); background:var(--_color) }
[data-stop]:hover:enabled { color:var(--_background); background:var(--_color); filter:brightness(1.2) }
[data-stop] svg { inline-size:.85em; block-size:.85em; fill:currentColor }
[data-edit-last] { padding:.38em .77em; min-block-size:2.5em; font-size:.89em }
.model-button { gap:.4em; max-inline-size:100%; min-block-size:2.1em; padding:.3em .5em .3em .55em; border:0; border-radius:.55em; font-size:.86em; font-weight:500; color:var(--_color); background:var(--_surface) }
.model-button span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.model-button svg { inline-size:1em; block-size:1em }
.model-button svg:last-child { inline-size:.85em; block-size:.85em; color:var(--_muted) }
.model-button[aria-expanded=true] { color:var(--_accent); background:var(--_user-background) }
.model-button[aria-expanded=true] svg:last-child { transform:rotate(180deg) }
.model-button:hover:enabled { background:var(--_user-background) }
.model-picker { position:absolute; z-index:3; inset-inline:-1px; inset-block-end:calc(100% + .55em); display:flex; flex-direction:column; max-block-size:28em; padding:.4em; color:var(--_color); background:var(--_background); border:1px solid var(--_border); border-radius:1em; box-shadow:0 1.1em 2.8em #10182829,0 .15em .4em #1018280f }
.model-search { display:flex; align-items:center; gap:.5em; flex:none; margin:.1em .1em .3em; padding:0 .65em; border-radius:.6em; background:var(--_surface); color:var(--_muted) }
.model-search svg { inline-size:1em; block-size:1em }
.model-search input { flex:1; min-inline-size:0; min-block-size:2.4em; padding:0; color:var(--_color); background:transparent; border:0 }
.model-search input:focus-visible { outline:none }
.model-search:focus-within { outline:2px solid var(--_accent); outline-offset:1px }
.model-list { flex:1 1 auto; min-block-size:0; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; border-radius:.6em }
.model-group { display:flex; flex-wrap:wrap; justify-content:space-between; gap:.1em 1em; padding:.75em .65em .3em; font-size:.74em; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--_muted) }
.model-group span { font-weight:500; letter-spacing:0; text-transform:none }
.model-option { display:flex; flex-wrap:wrap; align-items:center; gap:.4em .7em; min-inline-size:0; min-block-size:2.9em; padding:.4em .65em; border-radius:.6em; cursor:pointer }
.model-option:hover,.model-option[data-active] { background:var(--_surface) }
.model-option[aria-selected=true] { background:var(--_user-background) }
.model-option[aria-disabled=true] { opacity:.5; cursor:default }
.model-list:focus-visible:has([data-active]) { outline:none }
[role=group]:has(> .model-group.visually-hidden) { margin-block-start:.3em }
.model-list:focus-visible .model-option[data-active],.model-search:focus-within ~ .model-list .model-option[data-active] { outline:2px solid var(--_accent); outline-offset:-2px }
.model-tile { display:grid; place-items:center; flex:none; inline-size:2em; block-size:2em; border-radius:.55em; color:var(--_muted); background:var(--_surface); box-shadow:inset 0 0 0 1px var(--_border) }
.model-option[aria-selected=true] .model-tile { color:var(--_accent); background:var(--_background) }
.model-tile svg { inline-size:1.05em; block-size:1.05em }
.model-text { display:grid; flex:1 1 8em; min-inline-size:0 }
.model-name { font-weight:500; overflow-wrap:anywhere }
.model-detail { font-size:.86em; color:var(--_muted); overflow-wrap:anywhere }
.model-badge { flex:none; max-inline-size:100%; overflow-wrap:anywhere; padding:.05em .55em; font-size:.8em; font-weight:500; color:var(--_warning); background:color-mix(in srgb,var(--_warning) 10%,transparent); border:1px solid color-mix(in srgb,var(--_warning) 30%,transparent); border-radius:2em }
.model-check { inline-size:1.05em; block-size:1.05em; color:var(--_accent); visibility:hidden }
.model-option[aria-selected=true] .model-check { visibility:visible }
.model-empty,.model-note { margin:0; padding:.6em .65em; font-size:.86em; color:var(--_muted) }
.model-note { flex:none; border-block-start:1px solid var(--_border); margin-block-start:.3em }
.model-note[data-error] { color:var(--_error) }
.suggestions { display:flex; flex-wrap:wrap; gap:.5em }
.suggestions button { font-size:.89em; min-block-size:2.5em; border-radius:2.6em; padding:.45em .95em; text-align:start; color:var(--_color) }
[data-empty]:not([hidden]) + .suggestions { margin-block-start:1em }
.composer-meta { display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:.3em .85em; text-align:center }
.status,.hint,.limit { margin:0; overflow-wrap:anywhere }
.status { display:flex; align-items:flex-start; justify-content:center; gap:.4em; font-size:.86em; color:var(--_muted) }
.status[data-tone=error] { color:var(--_error); font-weight:500 }
.status svg { display:none; inline-size:1.1em; block-size:1.1em; margin-block-start:.1em }
.status[data-tone=error] svg { display:block }
.status:has(span:not(:empty)) ~ .hint { display:none }
.hint { font-size:.78em; line-height:1.5; color:var(--_muted) }
.limit { font-size:.86em; font-variant-numeric:tabular-nums; color:var(--_muted) }
textarea[aria-invalid=true] { outline:2px solid currentColor; outline-offset:.3em }
.jump-latest { position:absolute; inset-block-end:.67em; inset-inline-end:1em; max-inline-size:calc(100% - 2em); font-size:.86em; border-radius:2.67em; box-shadow:0 .2em .8em #222b3c14 }
li[data-layout=failed] { border-inline-start:.23em solid currentColor; padding-inline-start:.85em }
.visually-hidden { position:absolute; inline-size:1px; block-size:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0 }
.suggestions:empty,[hidden] { display:none!important }
@media(max-height:36rem) { header,.composer { padding-block:.5em; gap:.45em } textarea { min-block-size:2.4em } }
@media(pointer:coarse) { textarea { font-size:max(1rem,16px) } .hint { display:none } }
@media(prefers-reduced-motion:reduce) { * { scroll-behavior:auto!important; transition:none!important } .working-dots span { animation:none; opacity:.6 } .working[data-kind=tool] .working-dots { animation:none } }
@media(forced-colors:active) { .working-dots span { background:CanvasText; forced-color-adjust:none } :host button { border:1px solid ButtonText } .model-option[aria-selected=true],.model-option[data-active] { outline:2px solid Highlight } .message-box,.model-picker,li[data-layout=tools] { border:1px solid CanvasText } }
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
