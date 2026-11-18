// Scoped CSS for the call popup, which lives outside the panel.
export const CALL_ID = 'wavez-tools-call';

const C = `#${CALL_ID}`;

export const callCss = `
${C}{position:fixed;z-index:2147483646;display:flex;flex-direction:column;align-items:flex-end;
  color:#ecedf3;text-align:left;font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
${C} *{box-sizing:border-box}
${C} button,${C} select{font:inherit;color:inherit;margin:0}
${C} :focus-visible{outline:2px solid #8fb0ff;outline-offset:2px}
${C} .wtc-card{width:320px;max-width:calc(100vw - 32px);max-height:var(--wtc-max,calc(100vh - 32px));overflow:hidden auto;background:#171822;border:1px solid #2c2f40;
  border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.55)}
${C} .wtc-head{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;border-bottom:1px solid #2c2f40}
${C} .wtc-title{flex:1;min-width:0;font-size:13px;font-weight:700}
${C} .wtc-sub{font-size:11px;color:#9a9cae;font-variant-numeric:tabular-nums;white-space:nowrap}
${C} .wtc-dot{width:8px;height:8px;flex-shrink:0;border-radius:50%;background:#57c98d}
${C} .wtc-icon{width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  padding:0;border:0;border-radius:50%;background:#262a3d;cursor:pointer}
${C} .wtc-icon:hover{background:#30354d}
${C} .wtc-body{display:flex;flex-direction:column;gap:14px;padding:16px 14px 14px}
${C} .wtc-who{display:flex;align-items:center;gap:12px;font-size:12px;color:#c9cbd8}
${C} .wtc-faces{display:flex;flex-shrink:0}
${C} .wtc-face{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:2px solid #171822;
  border-radius:50%;font-size:13px;font-weight:700}
${C} .wtc-face+.wtc-face{margin-left:-8px}
${C} .wtc-pill .wtc-face{width:28px;height:28px;font-size:11px}
${C} .wtc-pill .wtc-face+.wtc-face{margin-left:-6px}
${C} .wtc-join{display:flex;gap:8px}
${C} .wtc-btn{flex:1;min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;
  border:1px solid #3a3e55;border-radius:10px;background:#262a3d;font-size:13px;font-weight:600;cursor:pointer}
${C} .wtc-btn:hover{background:#30354d}
${C} .wtc-btn.wtc-primary{border:0;background:#8fb0ff;color:#0d0e14;font-weight:700}
${C} .wtc-btn.wtc-primary:hover{background:#a9c2ff}
${C} .wtc-btn:disabled{opacity:.45;cursor:default}
${C} .wtc-note{font-size:11px;color:#9a9cae}
${C} .wtc-error{padding:8px 10px;border-radius:8px;background:#3a1c22;color:#ff9aa8;font-size:12px}
${C} .wtc-banner{width:100%;min-height:36px;padding:0 10px;border:0;border-radius:8px;background:#262a3d;color:#b9c8ff;cursor:pointer}
${C} .wtc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:340px;overflow:auto;padding:8px}
${C} .wtc-tile{position:relative;height:104px;display:flex;align-items:center;justify-content:center;overflow:hidden;
  border:2px solid transparent;border-radius:10px;background:#1c1e2b}
${C} .wtc-tile.wtc-speaking{border-color:#8fb0ff}
${C} .wtc-tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#232838}
${C} .wtc-tile video.wtc-mirror{transform:scaleX(-1)}
${C} .wtc-tile .wtc-face{width:44px;height:44px;border:0;font-size:16px}
${C} .wtc-name{position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);display:flex;align-items:center;gap:4px;
  padding:2px 6px;border-radius:6px;background:rgba(13,14,20,.78);font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden}
${C} .wtc-name svg{flex-shrink:0;color:#ff9a9a}
${C} .wtc-msg{padding:0 8px 4px}
${C} .wtc-controls{display:flex;align-items:center;gap:6px;padding:4px 8px 10px}
${C} .wtc-ctl{width:44px;height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;
  border:0;border-radius:50%;background:#262a3d;cursor:pointer}
${C} .wtc-ctl:hover{background:#30354d}
${C} .wtc-ctl.wtc-off{background:#4a1c1f;color:#ffb3b3}
${C} .wtc-ctl.wtc-on{background:#30354d;color:#8fb0ff}
${C} .wtc-grow{flex:1}
${C} .wtc-leave{min-height:44px;padding:0 18px;border:0;border-radius:999px;background:#4a1c1f;color:#ffb3b3;
  font-size:13px;font-weight:700;cursor:pointer}
${C} .wtc-leave:hover{background:#5a2226}
${C} .wtc-settings{display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px;border-top:1px solid #2c2f40}
${C} .wtc-settings label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:#9a9cae}
${C} .wtc-settings select{min-height:36px;padding:0 8px;border:1px solid #3a3e55;border-radius:8px;background:#11121a;color:#ecedf3}
${C} .wtc-vol{display:flex;flex-direction:column;gap:4px}
${C} .wtc-vol label{font-size:11px;color:#9a9cae}
${C} .wtc-vol-row{display:flex;align-items:center;gap:10px;min-height:36px;color:#9a9cae}
${C} .wtc-vol-row svg{flex-shrink:0}
${C} .wtc-vol-row input{flex:1;min-width:0;height:24px;margin:0;accent-color:#8fb0ff;cursor:pointer}
${C} .wtc-vol-row output{min-width:40px;text-align:right;color:#ecedf3;font-weight:600;font-variant-numeric:tabular-nums}
${C} .wtc-meter{height:4px;margin:-4px 0 4px 26px;border-radius:2px;background:#262a3d;overflow:hidden}
${C} .wtc-meter div{width:0;height:4px;background:#57c98d;transition:width .08s}
${C} .wtc-pill{display:flex;align-items:center;gap:8px;padding:6px;background:#171822;border:1px solid #2c2f40;
  border-radius:999px;box-shadow:0 12px 32px rgba(0,0,0,.55)}
${C} .wtc-pill .wtc-faces{padding-left:4px}
${C} .wtc-pill .wtc-ctl{width:36px;height:36px}
${C} .wtc-pill-text{font-size:12px;white-space:nowrap;padding-right:2px}
${C} .wtc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
