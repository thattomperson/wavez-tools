// A card in the corner of the room page for a bot message and its buttons.
// Shown when a desktop notification is clicked, since a page can't put
// working buttons on the notification itself (see tools/notifications.ts).
// Plain inline styles: it lives outside the panel, so the panel's scoped CSS
// doesn't reach it.
import { h } from './dom';

const CARD_ID = 'wavez-tools-notice';

export interface NoticeButton {
  label: string;
  style?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Runs on click. Return lines to show in the card afterwards, or nothing to close it. */
  run(): Promise<string[] | void> | string[] | void;
}

export interface Notice {
  title: string;
  lines: string[];
  buttons: NoticeButton[];
}

const BUTTON_COLORS: Record<string, string> = {
  primary: 'background:#4f6bed;border-color:#4f6bed',
  danger: 'background:#c2414b;border-color:#c2414b',
  secondary: 'background:#262a3d;border-color:#3a3f57',
};

export function closeNotice(): void {
  document.getElementById(CARD_ID)?.remove();
}

export function showNotice(notice: Notice): void {
  closeNotice();
  const body = h('div', { style: 'white-space:pre-line;color:#c9cbd8;overflow-wrap:anywhere' }, notice.lines.join('\n'));
  const status = h('div', { style: 'color:#9a9cae', role: 'status' });

  const buttons = notice.buttons.map((button) =>
    h(
      'button',
      {
        type: 'button',
        disabled: !!button.disabled,
        style: `font:inherit;color:#ecedf3;padding:6px 10px;border:1px solid;border-radius:8px;cursor:pointer;${
          BUTTON_COLORS[button.style ?? 'secondary'] ?? BUTTON_COLORS.secondary
        }${button.disabled ? ';opacity:.5;cursor:default' : ''}`,
        onclick: async () => {
          buttons.forEach((b) => (b.disabled = true));
          status.textContent = 'Working…';
          try {
            const lines = await button.run();
            if (!lines) return closeNotice();
            body.textContent = lines.join('\n');
            status.textContent = '';
            row.remove();
          } catch (err) {
            status.textContent = err instanceof Error ? err.message : String(err);
            buttons.forEach((b, i) => (b.disabled = !!notice.buttons[i]?.disabled));
          }
        },
      },
      button.label,
    ),
  );
  const row = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, ...buttons);

  const card = h(
    'div',
    {
      id: CARD_ID,
      role: 'dialog',
      'aria-label': notice.title,
      style: [
        'position:fixed',
        'right:16px',
        'bottom:96px',
        'z-index:2147483647',
        'width:min(340px,calc(100vw - 32px))',
        'display:flex',
        'flex-direction:column',
        'gap:8px',
        'padding:12px',
        'border:1px solid #2c2f40',
        'border-radius:12px',
        'background:#171822',
        'color:#ecedf3',
        'box-shadow:0 8px 24px rgba(0,0,0,.5)',
        'font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif',
        'text-align:left',
      ].join(';'),
    },
    h(
      'div',
      { style: 'display:flex;align-items:center;gap:8px' },
      h('b', { style: 'flex:1;min-width:0;overflow-wrap:anywhere' }, notice.title),
      h(
        'button',
        {
          type: 'button',
          'aria-label': 'Close',
          style: 'font:inherit;color:#9a9cae;background:none;border:0;padding:2px 6px;cursor:pointer;font-size:16px;line-height:1',
          onclick: closeNotice,
        },
        '×',
      ),
    ),
    notice.lines.length ? body : null,
    notice.buttons.length ? row : null,
    status,
  );
  document.body.appendChild(card);
  card.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
}
