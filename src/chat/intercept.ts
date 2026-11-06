// Catches /wt commands typed into the room chat, in this tab and in the
// pop-out chat window, before the site sends them.
//
// The pop-out is a same-origin window the site opens with window.open, so we
// wrap window.open to get a handle on it and add the same listeners to its
// document. That only works for a pop-out opened after the bookmarklet ran.
//
// Commands are caught three ways, so a change to the site's chat box doesn't
// leak them into the room: Enter in a chat input (the usual path), a form
// submit, and as a last resort the outgoing chat packet on the WebSocket.
import { setSendFilter } from '../wavez/socket';
import { isCommand, type CommandRunner } from './commands';

interface ChatHook {
  run: CommandRunner | null;
  popups: Set<Window>;
  attached: WeakSet<Document>;
}

declare global {
  interface Window {
    __wavezToolsChat?: ChatHook;
  }
}

type AnyWindow = Window & typeof globalThis;

const PATCHED = '__wavezToolsPatched';
const TOAST_ID = 'wavez-tools-toast';
const TOAST_MS = 6000;
const POPUP_POLL_MS = 500;

/** Start handling /wt commands. Returns a function that stops it. */
export function installChatCommands(run: CommandRunner): () => void {
  const hook = getHook();
  hook.run = run;
  attach(window as AnyWindow);
  setSendFilter((data) => {
    const text = commandFromPacket(data);
    if (text === null || !hook.run) return false;
    showReply(focusedDocument(), hook.run(text));
    return true;
  });
  // A pop-out reloads or navigates to a fresh document now and then, which
  // needs the listeners again. Closed pop-outs are dropped.
  const timer = window.setInterval(() => {
    for (const popup of hook.popups) {
      if (popup.closed) hook.popups.delete(popup);
      else attach(popup as AnyWindow);
    }
  }, POPUP_POLL_MS);

  return () => {
    hook.run = null;
    setSendFilter(null);
    window.clearInterval(timer);
  };
}

function getHook(): ChatHook {
  if (window.__wavezToolsChat) return window.__wavezToolsChat;
  const hook: ChatHook = { run: null, popups: new Set(), attached: new WeakSet() };
  window.__wavezToolsChat = hook;

  const originalOpen = window.open;
  window.open = function (this: Window, ...args: Parameters<Window['open']>) {
    const opened = originalOpen.apply(this, args);
    if (opened) {
      hook.popups.add(opened);
      attach(opened as AnyWindow);
    }
    return opened;
  };
  return hook;
}

function attach(win: AnyWindow) {
  const hook = getHook();
  let doc: Document;
  try {
    // Throws for a window on another site; those are never chat windows.
    doc = win.document;
    if (!doc || hook.attached.has(doc)) return;
  } catch {
    return;
  }
  hook.attached.add(doc);

  const handle = (input: Element | null, event: Event) => {
    if (!hook.run || !input) return;
    const text = readInput(input);
    if (text === null || !isCommand(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearInput(input);
    showReply(doc, hook.run(text));
  };

  doc.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      handle(event.target as Element | null, event);
    },
    true,
  );
  doc.addEventListener(
    'submit',
    (event) => {
      const form = event.target as HTMLFormElement | null;
      handle(form?.querySelector('textarea, input:not([type]), input[type="text"], [contenteditable="true"]') ?? null, event);
    },
    true,
  );

  // The main tab's socket goes through socket.ts; a pop-out has its own.
  if (win !== (window as AnyWindow)) patchSocket(win);
}

function patchSocket(win: AnyWindow) {
  const proto = win.WebSocket?.prototype as (WebSocket & { [PATCHED]?: boolean }) | undefined;
  if (!proto || proto[PATCHED]) return;
  proto[PATCHED] = true;
  const originalSend = proto.send;
  proto.send = function (this: WebSocket, data) {
    const hook = getHook();
    const text = commandFromPacket(data);
    if (text !== null && hook.run) {
      showReply(win.document, hook.run(text));
      return;
    }
    return originalSend.call(this, data);
  };
}

/** The /wt text of an outgoing chat packet, or null for anything else. */
function commandFromPacket(data: unknown): string | null {
  if (typeof data !== 'string' || !data.toLowerCase().includes('/wt')) return null;
  try {
    const packet = JSON.parse(data);
    // Our own bot commands use send_bot_command and never start with /wt,
    // but leave them alone regardless.
    if (packet?.type !== 'command' || packet.event === 'send_bot_command') return null;
    const payload = packet.payload ?? {};
    for (const key of ['content', 'message', 'text']) {
      const value = payload[key];
      if (typeof value === 'string' && isCommand(value)) return value;
    }
  } catch {
    // Not JSON: not a chat packet.
  }
  return null;
}

function readInput(el: Element): string | null {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return (el as HTMLInputElement).value;
  if ((el as HTMLElement).isContentEditable) return (el as HTMLElement).innerText;
  return null;
}

// The chat box is a React input, so set the value through the native setter
// and fire an input event, or React puts the old text back.
function clearInput(el: Element) {
  const view = el.ownerDocument.defaultView as AnyWindow | null;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (setter) setter.call(el, '');
    else (el as HTMLInputElement).value = '';
  } else {
    el.ownerDocument.execCommand('selectAll');
    el.ownerDocument.execCommand('delete');
  }
  if (view) el.dispatchEvent(new view.Event('input', { bubbles: true }));
}

function focusedDocument(): Document {
  for (const popup of getHook().popups) {
    try {
      if (!popup.closed && popup.document.hasFocus()) return popup.document;
    } catch {
      // Another site: skip.
    }
  }
  return document;
}

// A small note above the chat box, in whichever window the command came from.
// Plain inline styles, since a pop-out doesn't have the panel's stylesheet.
function showReply(doc: Document, lines: string[]) {
  doc.getElementById(TOAST_ID)?.remove();
  const toast = doc.createElement('div');
  toast.id = TOAST_ID;
  toast.setAttribute('role', 'status');
  toast.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:96px',
    'z-index:2147483647',
    'max-width:min(360px,calc(100vw - 32px))',
    'padding:10px 12px',
    'border:1px solid #2c2f40',
    'border-radius:12px',
    'background:#171822',
    'color:#ecedf3',
    'box-shadow:0 8px 24px rgba(0,0,0,.5)',
    'font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif',
    'white-space:pre-line',
    'cursor:pointer',
  ].join(';');
  toast.textContent = lines.join('\n');
  toast.addEventListener('click', () => toast.remove());
  doc.body.appendChild(toast);
  doc.defaultView?.setTimeout(() => toast.remove(), TOAST_MS + lines.length * 500);
}
