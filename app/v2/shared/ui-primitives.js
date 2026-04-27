/**
 * UI primitives shared across all Suite apps.
 * Each is a tiny self-contained module with a singleton or factory API.
 */

let toastEl = null;
function ensureToast() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.setAttribute('role', 'status');
  toastEl.style.cssText = `
    position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%);
    background: rgba(50,50,50,0.92); color: #fff; padding: 8px 16px;
    border-radius: 4px; font: 13px Roboto, sans-serif; z-index: 9999;
    opacity: 0; transition: opacity .2s; pointer-events: none;
  `;
  document.body.appendChild(toastEl);
  return toastEl;
}

export const Toast = {
  /** @param {string} msg @param {number} [ms=2000] */
  show(msg, ms = 2000) {
    const el = ensureToast();
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(Toast._t);
    Toast._t = setTimeout(() => (el.style.opacity = '0'), ms);
  },
};

export const Modal = {
  /**
   * @param {{title: string, body: HTMLElement|string}} opts
   * @returns {{ close: () => void }}
   */
  open({ title, body }) {
    const back = document.createElement('div');
    back.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center; z-index: 9000;
    `;
    const card = document.createElement('div');
    card.style.cssText = `
      background: #fff; border-radius: 4px; padding: 24px; max-width: 720px;
      width: calc(100vw - 80px); max-height: calc(100vh - 80px); overflow: auto;
      box-shadow: var(--pt-elev-3, 0 8px 24px rgba(0,0,0,0.2));
    `;
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.cssText = 'margin: 0 0 12px; font: 500 20px Georgia, serif;';
    card.appendChild(h);
    if (typeof body === 'string') card.insertAdjacentHTML('beforeend', body);
    else card.appendChild(body);
    back.appendChild(card);
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.body.appendChild(back);
    function close() { back.remove(); }
    return { close };
  },
};
