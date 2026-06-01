import { CLIPBOARD_CLEAR_DELAY_MS } from './constants';

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => {});
  }, CLIPBOARD_CLEAR_DELAY_MS);
}

export function getFaviconUrl(uri?: string): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
  } catch {
    return null;
  }
}

export function getItemSubtitle(type: string, itemData: Record<string, unknown>): string {
  switch (type) {
    case 'login':
      return (itemData.username as string) || (itemData.uris as Array<{ uri: string }>)?.[0]?.uri || '';
    case 'note':
      return 'Secure note';
    case 'card': {
      const brand = itemData.brand as string;
      const num = itemData.number as string;
      const last4 = num ? `····${num.slice(-4)}` : '';
      return [brand, last4].filter(Boolean).join(' ');
    }
    case 'identity':
      return [itemData.firstName, itemData.lastName].filter(Boolean).join(' ');
    default:
      return '';
  }
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
