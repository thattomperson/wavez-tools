export const PANEL_ID = 'wavez-tools-panel';

const P = `#${PANEL_ID}`;

// Every rule is scoped to the panel id so the room page's own CSS loses to it
// and ours never leaks out.
export const css = `
${P}{position:fixed;top:72px;right:16px;z-index:2147483647;width:320px;overflow:hidden;text-align:left;
  background:#171822;color:#ecedf3;border:1px solid #2c2f40;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.5);
  font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
${P} *{box-sizing:border-box}
${P}.wt-collapsed{border-radius:999px}
${P} button{font:inherit;color:inherit;margin:0}
${P} :focus-visible{outline:2px solid #8fb0ff;outline-offset:2px}
${P} .wt-header{display:flex;align-items:center;gap:8px;min-height:46px;padding:6px 6px 6px 2px}
${P} .wt-grip{width:20px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  margin-right:-4px;padding:0;border:0;border-radius:6px;background:none;color:#6d7085;cursor:grab;touch-action:none}
${P} .wt-grip:hover{color:#ecedf3}
${P}.wt-dragging,${P}.wt-dragging .wt-grip{cursor:grabbing;user-select:none}
${P}:not(.wt-collapsed) .wt-header{border-bottom:1px solid #2c2f40}
${P} .wt-icon-btn{width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  padding:0;border:0;border-radius:50%;background:#262a3d;cursor:pointer}
${P} .wt-icon-btn:hover{background:#30354d}
${P} .wt-dot{width:8px;height:8px;flex-shrink:0;border-radius:50%;background:#6d7085}
${P} .wt-dot.wt-op{background:#f4a24c}
${P} .wt-dot.wt-ok{background:#57c98d}
${P} .wt-pill-text{flex:1;min-width:0;padding:0;border:0;background:none;text-align:left;cursor:pointer}
${P} .wt-ellipsis{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${P} .wt-muted{color:#9a9cae}
${P} .wt-title{flex:1;min-width:0;display:flex;flex-direction:column}
${P} .wt-title b{font-size:13px;font-weight:600}
${P} .wt-sub{font-size:11px;color:#9a9cae;font-variant-numeric:tabular-nums}
${P} .wt-chip{flex-shrink:0;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
${P} .wt-op{background:#3a2614;color:#ffc58a}
${P} .wt-ok{background:#16301f;color:#8fe0b2}
${P} .wt-busy{background:#262a3d;color:#b9c8ff}
${P} .wt-idle{color:#6d7085}
${P} .wt-err{background:#3a1c22;color:#ff9aa8}
${P} .wt-content{max-height:min(70vh,560px);overflow:auto}
${P} .wt-list{display:flex;flex-direction:column;padding:6px}
${P} .wt-row{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 10px;
  border:0;border-radius:10px;background:none;text-align:left}
${P} button.wt-row{cursor:pointer}
${P} button.wt-row:hover{background:#20222f}
${P} .wt-glyph{width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  border-radius:8px;background:#262a3d;color:#8fb0ff;font-size:13px;font-weight:700}
${P} .wt-row-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
${P} .wt-row-name{font-size:13px;font-weight:600}
${P} label.wt-row-text{cursor:pointer}
${P} .wt-row > svg{color:#6d7085;flex-shrink:0}
${P} .wt-divider{height:1px;margin:4px 10px;background:#2c2f40}
${P} .wt-switch{width:44px;height:26px;flex-shrink:0;display:flex;padding:3px;border:0;border-radius:999px;
  background:#3a3e55;cursor:pointer}
${P} .wt-switch span{width:20px;height:20px;border-radius:50%;background:#9a9cae;transition:transform .15s}
${P} .wt-switch[aria-checked="true"]{background:#8fb0ff}
${P} .wt-switch[aria-checked="true"] span{background:#0d0e14;transform:translateX(18px)}
${P} .wt-body{display:flex;flex-direction:column;gap:12px;padding:12px 14px 14px}
${P} .wt-progress{height:3px;background:#262a3d}
${P} .wt-progress div{width:0;height:3px;background:#8fb0ff;transition:width .2s}
${P} .wt-tracks{list-style:none;margin:0;padding:6px 0}
${P} .wt-track{display:flex;align-items:center;gap:10px;padding:5px 14px}
${P} .wt-track-n{width:16px;flex-shrink:0;text-align:right;color:#6d7085;font-variant-numeric:tabular-nums}
${P} .wt-track-text{flex:1;min-width:0;display:flex;flex-direction:column}
${P} .wt-track-text .wt-muted{font-size:11px}
${P} .wt-footer{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px 14px;border-top:1px solid #2c2f40}
${P} .wt-grow{flex:1;min-width:0}
${P} .wt-btn{min-height:36px;padding:0 12px;border:1px solid #3a3e55;border-radius:999px;background:none;
  white-space:nowrap;cursor:pointer}
${P} .wt-btn:hover{background:#20222f}
${P} .wt-btn.wt-primary{padding:0 14px;border:0;background:#8fb0ff;color:#0d0e14;font-weight:600}
${P} .wt-btn.wt-primary:hover{background:#a9c2ff}
${P} .wt-btn:disabled{opacity:.45;cursor:default}
${P} .wt-banner{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;font-size:13px}
${P} .wt-banner svg{flex-shrink:0}
${P} .wt-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
${P} .wt-stat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:6px;background:#20222f}
${P} .wt-stat b{font-size:16px;font-variant-numeric:tabular-nums}
${P} .wt-stat span{font-size:11px;color:#9a9cae}
${P} .wt-stat.wt-hot b{color:#ffc58a}
${P} .wt-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 16px;margin:0}
${P} .wt-kv dt{color:#9a9cae}
${P} .wt-kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
${P} .wt-link{color:#9db4ff;text-decoration:none}
${P} .wt-link:hover{color:#c4d2ff}
${P} .wt-track-head{display:flex;flex-direction:column;gap:2px}
${P} .wt-track-head a{font-size:14px;font-weight:600;color:#ecedf3;text-decoration:none}
${P} .wt-track-head a:hover{text-decoration:underline}
${P} .wt-warn{color:#ffc58a}
${P} .wt-error{color:#ff9aa8}
`;
