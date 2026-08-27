'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faChartLine, faHandshake, faCompass, faListCheck, faUser } from '@fortawesome/free-solid-svg-icons';

const TABS = [
  { href: '/home', label: 'Home', icon: faHouse },
  { href: '/market', label: 'Market', icon: faChartLine },
  { href: '/p2p', label: 'P2P', icon: faHandshake },
  { href: '/explore', label: 'Explore', icon: faCompass },
  { href: '/orders', label: 'Orders', icon: faListCheck },
  { href: '/profile', label: 'Profile', icon: faUser },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-mobile -translate-x-1/2 border-t border-border bg-panel/90 backdrop-blur-lg">
      <div className="flex px-1.5 py-1.5">
        {TABS.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px]">
              <span
                className={`flex h-8 w-10 items-center justify-center rounded-xl transition-colors ${
                  active ? 'bg-accent/15 text-accent' : 'text-muted'
                }`}
              >
                <FontAwesomeIcon icon={tab.icon} className="text-[15px] leading-none" />
              </span>
              <span className={active ? 'font-medium text-accent' : 'text-muted'}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
