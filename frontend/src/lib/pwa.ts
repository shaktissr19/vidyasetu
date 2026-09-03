export interface PwaInstallResult {
  available: boolean;
  outcome?: 'accepted' | 'dismissed';
}

interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

let deferredPrompt: BeforeInstallPromptEventLike | null = null;

export function capturePwaInstallPrompt(event: Event): void {
  const promptEvent = event as BeforeInstallPromptEventLike;
  if (typeof promptEvent.prompt !== 'function') return;
  promptEvent.preventDefault();
  deferredPrompt = promptEvent;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vidyasetu:pwa-installable'));
  }
}

export function clearPwaInstallPrompt(): void {
  deferredPrompt = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vidyasetu:pwa-install-state'));
  }
}

export function isPwaInstallable(): boolean {
  return Boolean(deferredPrompt);
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export async function promptPwaInstall(): Promise<PwaInstallResult> {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return { available: false };
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  deferredPrompt = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vidyasetu:pwa-install-state'));
  }
  return { available: true, outcome: choice.outcome };
}
