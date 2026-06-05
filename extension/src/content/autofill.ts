// Content script — injected into every page
// Listens for AUTOFILL messages from the popup and fills login forms.

interface AutofillPayload {
  username: string;
  password: string;
  submit?: boolean;
}

function findField(selectors: string[]): HTMLInputElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLInputElement>(sel);
    if (el) return el;
  }
  return null;
}

function fillField(el: HTMLInputElement, value: string): void {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (proto?.set) {
    proto.set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function showToast(message: string): void {
  const existing = document.getElementById('_opsvault_toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = '_opsvault_toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: '#1e40af',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    zIndex: '2147483647',
    boxShadow: '0 4px 12px rgba(0,0,0,.25)',
    transition: 'opacity 0.3s',
    opacity: '1',
  });
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'AUTOFILL') {
    sendResponse({ success: false });
    return;
  }

  const { username, password, submit = false } = msg.payload as AutofillPayload;

  const usernameField = findField([
    'input[type="email"]',
    'input[type="text"][name*="user"]',
    'input[type="text"][name*="email"]',
    'input[type="text"][name*="login"]',
    'input[type="text"][autocomplete="username"]',
    'input[type="text"]:not([name*="search"]):not([name*="query"])',
  ]);

  const passwordField = findField([
    'input[type="password"]',
  ]);

  let filled = false;

  if (usernameField && username) {
    fillField(usernameField, username);
    filled = true;
  }

  if (passwordField && password) {
    fillField(passwordField, password);
    filled = true;
  }

  if (filled) {
    showToast('Filled by OPSVAULT');

    if (submit) {
      const form = passwordField?.form ?? usernameField?.form;
      if (form) {
        setTimeout(() => form.requestSubmit(), 200);
      }
    }

    sendResponse({ success: true });
  } else {
    showToast('No login form found on this page');
    sendResponse({ success: false, reason: 'No fields found' });
  }
});

export {}; // make TS treat this as a module
