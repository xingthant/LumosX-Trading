'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useSiteConfig } from '@/lib/useSiteConfig';

const SESSION_KEY = 'telegram_promo_shown';

export default function TelegramPromo() {
  const { telegram } = useSiteConfig();
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (!telegram.isActive || !telegram.showPopup) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const timer = window.setTimeout(() => {
      setShowPopup(true);
      sessionStorage.setItem(SESSION_KEY, '1');
    }, 800);
    return () => window.clearTimeout(timer);
  }, [telegram.isActive, telegram.showPopup]);

  if (!telegram.isActive) return null;

  function join() {
    if (telegram.telegramUrl) window.open(telegram.telegramUrl, '_blank', 'noopener,noreferrer');
    setShowPopup(false);
  }

  return (
    <>
      <a
        href={telegram.telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={telegram.buttonText || 'Join our Telegram'}
        className="fixed bottom-24 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[#26A5E4] text-white shadow-glow transition-transform hover:scale-105"
        style={{ right: 'max(1rem, calc(50% - 240px + 1rem))' }}
      >
        <FontAwesomeIcon icon={faPaperPlane} className="text-lg" />
      </a>

      {showPopup && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 md:items-center" onClick={() => setShowPopup(false)}>
          <div
            className="w-full max-w-mobile rounded-t-2xl border-t border-border bg-panel p-5 shadow-card md:rounded-2xl md:border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#26A5E4] text-white">
                  <FontAwesomeIcon icon={faPaperPlane} />
                </span>
                <h3 className="text-base font-semibold">{telegram.popupTitle}</h3>
              </div>
              <button onClick={() => setShowPopup(false)} className="text-muted">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">{telegram.popupMessage}</p>
            <button onClick={join} className="w-full rounded-xl bg-[#26A5E4] py-3 text-sm font-semibold text-white">
              {telegram.buttonText}
            </button>
            <button onClick={() => setShowPopup(false)} className="mt-2 w-full rounded-xl border border-border py-2.5 text-sm text-muted">
              Maybe later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
