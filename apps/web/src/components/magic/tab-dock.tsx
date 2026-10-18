import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface DockItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  end?: boolean;
}

/**
 * A mobile bottom dock with a sliding active pill (a shared `layoutId`), the
 * pattern from Magic UI's Dock but adapted for touch — no hover magnification.
 */
export function TabDock({
  items,
  layoutId,
  onSelect,
}: {
  items: DockItem[];
  layoutId: string;
  onSelect?: () => void;
}) {
  // Rendered as a fragment on purpose: the tabs must be direct flex children of
  // the dock bar so they share width evenly with any sibling (e.g. "More").
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onSelect}
          className="relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5"
        >
          {({ isActive }) => (
            <>
              <span className="relative flex h-9 w-14 items-center justify-center">
                {isActive ? (
                  <motion.span
                    layoutId={layoutId}
                    className="absolute inset-0 rounded-2xl bg-brand-100"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <item.icon
                  size={19}
                  className={cn('relative z-10 transition-colors duration-200', isActive ? 'text-brand-600' : 'text-ink-400')}
                />
              </span>
              <span
                className={cn(
                  'max-w-full truncate text-[10.5px] font-semibold transition-colors duration-200',
                  isActive ? 'text-brand-600' : 'text-ink-400',
                )}
              >
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

/** The trailing "More" affordance — opens the full menu sheet. */
export function DockAction({
  label,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5">
      <span className={cn('flex h-9 w-14 items-center justify-center rounded-2xl transition-colors', active && 'bg-brand-100')}>
        <Icon size={19} className={cn('transition-colors', active ? 'text-brand-600' : 'text-ink-400')} />
      </span>
      <span className={cn('max-w-full truncate text-[10.5px] font-semibold transition-colors', active ? 'text-brand-600' : 'text-ink-400')}>
        {label}
      </span>
    </button>
  );
}
