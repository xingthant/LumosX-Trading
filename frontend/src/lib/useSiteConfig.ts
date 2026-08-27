'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

export interface Branding {
  siteName: string;
  tagline: string;
  logoDataUrl: string | null;
}

export interface TelegramPromo {
  telegramUrl?: string;
  popupTitle?: string;
  popupMessage?: string;
  buttonText?: string;
  isActive: boolean;
  showPopup?: boolean;
}

interface SiteConfig {
  branding: Branding;
  telegram: TelegramPromo;
}

const FALLBACK: SiteConfig = {
  branding: { siteName: 'PaperTrade', tagline: 'Simulated crypto trading. No real funds involved.', logoDataUrl: null },
  telegram: { isActive: false },
};

/** Fetches the admin-configured site branding and Telegram promo settings once per page. */
export function useSiteConfig() {
  const [config, setConfig] = useState<SiteConfig>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<SiteConfig>('/api/public/site-config')
      .then((res) => {
        setConfig(res);
        if (res.branding?.siteName) document.title = res.branding.siteName;
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return { ...config, loaded };
}
