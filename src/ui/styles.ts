export const PANEL_ID = 'wavez-tools-panel';

export const styles = {
  panel:
    'position:fixed;top:72px;right:16px;z-index:2147483647;width:280px;padding:10px;' +
    'background:#16161d;color:#eee;border:1px solid #444;border-radius:8px;' +
    'font:12px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)',
  header: 'display:flex;justify-content:space-between;margin-bottom:8px;font-weight:600',
  close: 'background:none;border:0;color:#aaa;font-size:16px;cursor:pointer;line-height:1',
  buttons: 'display:flex;flex-wrap:wrap;gap:6px',
  button: 'padding:5px 8px;background:#2d2d3a;color:#eee;border:1px solid #555;border-radius:5px;cursor:pointer',
  output:
    'margin:8px 0 0;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto;' +
    'font:11px/1.4 ui-monospace,monospace',
};

export const colors = {
  ok: '#cfc',
  error: '#f99',
};
