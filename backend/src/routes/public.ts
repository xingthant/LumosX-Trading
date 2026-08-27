import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Combined into one call since the app fetches both together on every page load.
router.get('/site-config', async (_req, res) => {
  const [brandingRes, telegramRes] = await Promise.all([
    pool.query(`SELECT site_name, tagline, logo_data, logo_mime_type FROM site_branding_config ORDER BY updated_at DESC LIMIT 1`),
    pool.query(
      `SELECT telegram_url, popup_title, popup_message, button_text, is_active, show_popup
       FROM telegram_promo_config ORDER BY updated_at DESC LIMIT 1`
    ),
  ]);

  const branding = brandingRes.rows[0];
  const telegram = telegramRes.rows[0];

  res.json({
    branding: {
      siteName: branding?.site_name || 'PaperTrade',
      tagline: branding?.tagline || 'Simulated crypto trading. No real funds involved.',
      logoDataUrl: branding?.logo_data ? `data:${branding.logo_mime_type};base64,${branding.logo_data}` : null,
    },
    telegram: telegram
      ? {
          telegramUrl: telegram.telegram_url,
          popupTitle: telegram.popup_title,
          popupMessage: telegram.popup_message,
          buttonText: telegram.button_text,
          isActive: telegram.is_active,
          showPopup: telegram.show_popup,
        }
      : { isActive: false },
  });
});

export default router;
