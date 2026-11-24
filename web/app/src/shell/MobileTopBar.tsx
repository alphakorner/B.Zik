import { Menu } from 'lucide-react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import { useUi } from '@/state/ui';

/** Barre du haut sur tous les écrans : logo + nom à gauche, bouton rond de menu à droite (ouvre la navigation). */
export function MobileTopBar() {
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  return (
    <header className="absolute inset-x-0 top-0 z-[calc(var(--z-web-chrome)-2)] flex h-(--mobile-top-bar-height) items-center justify-between px-4 glass-material">
      <PrefetchLink to="/home" className="inline-flex items-center gap-2 type-[700_19px/24px] tracking-[-0.01em]" aria-label="B.Zik, Home">
        <LogoMark size={24} bare className="text-primary" />
        <span>B.Zik</span>
      </PrefetchLink>
      <button className="ot-menu-round grid size-10 place-items-center rounded-full" aria-label="Menu" onClick={() => setDrawerOpen(true)}>
        <Menu size={20} strokeWidth={2.2} />
      </button>
    </header>
  );
}
