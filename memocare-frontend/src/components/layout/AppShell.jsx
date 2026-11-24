import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Mic, Gamepad2, Pill, CalendarDays, FileText,
  MapPin, ShieldCheck, BookOpen, Bell, Building2, UserCheck, UsersRound, Settings,
  LogOut, Menu, X, Store, ChevronDown, Archive, Mail, Inbox,
} from 'lucide-react';
import { useAuth, ROLES } from '../../auth/AuthContext';
import { notificationService, guidanceService } from '../../api';
import PageTour from '../../features/tutorials/PageTour';
import { PAGE_TOURS } from '../../features/tutorials/pageTourContent';
import Logo from '../brand/Logo';
import ThemeToggle from './ThemeToggle';
import NavItemInfo from '../ui/NavItemInfo';
import { NAV_INFO } from '../ui/navInfoCatalog';
import './layout.css';

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: 'all' },
      { to: '/patients', label: 'Patients', icon: Users, roles: [ROLES.HOSPITAL_STAFF, ROLES.ADMIN] },
      { to: '/patients/dismissed', label: 'Dismissed patients', icon: Archive, roles: [ROLES.HOSPITAL_STAFF, ROLES.ADMIN] },
      { to: '/mind-games', label: 'Mind Games', icon: Gamepad2, roles: [ROLES.FAMILY, ROLES.CARETAKER, ROLES.HOSPITAL_STAFF, ROLES.ADMIN] },
    ],
  },
  {
    label: 'Care',
    items: [
      { to: '/stores', label: 'Medical Stores', icon: Store, roles: [ROLES.FAMILY, ROLES.CARETAKER, ROLES.HOSPITAL_STAFF, ROLES.ADMIN] },
      { to: '/guidance', label: 'Guidance', icon: BookOpen, roles: [ROLES.FAMILY, ROLES.CARETAKER, ROLES.HOSPITAL_STAFF, ROLES.ADMIN] },
    ],
  },
  {
    label: 'Resources',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell, roles: 'all' },
      { to: '/inbox', label: 'Mail', icon: Inbox, roles: 'all' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/hospitals', label: 'Hospital management', icon: Building2, roles: [ROLES.ADMIN] },
      { to: '/admin/mail', label: 'Mail Center', icon: Mail, roles: [ROLES.ADMIN] },
      { to: '/admin/staff-approvals', label: 'Staff Approvals', icon: UserCheck, roles: [ROLES.ADMIN] },
      { to: '/admin/users', label: 'Users', icon: UsersRound, roles: [ROLES.ADMIN] },
    ],
  },
];

function canSee(item, role) {
  return item.roles === 'all' || item.roles.includes(role);
}

/** Derives per-page document titles from the current route. */
function usePageTitle() {
  const location = useLocation();
  useEffect(() => {
    const base = location.pathname.split('/')[1];
    const sections = NAV_SECTIONS.flatMap((s) => s.items);
    const match = sections.find((it) => `/${base}` === it.to) || sections.find((it) => base && it.to.startsWith(`/${base}`));
    let label = match?.label;
    if (!label) {
      if (location.pathname === '/' || location.pathname === '/dashboard') label = 'Dashboard';
      else if (location.pathname.startsWith('/profile')) label = 'Profile & Settings';
      else label = 'MemoCare';
    }
    document.title = `${label} — MemoCare`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = `MemoCare — ${label}. Cognitive-health monitoring from a short voice sample.`;
  }, [location.pathname]);
}

export default function AppShell() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Shared with the Notifications page, so opening it clears the badge.
  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationService.list(true),
  });
  const unread = unreadQuery.data?.length ?? 0;
  // Sidebar tutorials: which page keys this account has already been shown.
  // null = still loading (never flash a tutorial for an existing user).
  const [seenTours, setSeenTours] = useState(null);
  const [tourKey, setTourKey] = useState(null);
  const autoTourChecked = useRef(false);
  usePageTitle();

  useEffect(() => {
    let cancelled = false;
    setSeenTours(null);
    autoTourChecked.current = false;
    guidanceService
      .pageTours()
      .then((data) => {
        if (!cancelled) setSeenTours(new Set(data?.seen ?? []));
      })
      .catch(() => {
        // Never block the app on this; at worst a tour reappears next time.
        if (!cancelled) setSeenTours(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Opening a tour immediately records it as seen for this account, so it can
  // never appear again — even if the user closes the browser without clicking X.
  const openPageTour = (key) => {
    setTourKey(key);
    setSeenTours((prev) => {
      const next = new Set(prev || []);
      next.add(key);
      return next;
    });
    guidanceService.markPageTourSeen(key).catch(() => {});
  };

  // First login lands on a page without a click (usually /dashboard). Show that
  // page's tour once for a brand-new user; returning users have it recorded.
  useEffect(() => {
    if (!seenTours || autoTourChecked.current) return;
    autoTourChecked.current = true;
    const key = location.pathname.replace(/\/+$/, '') || '/dashboard';
    if (PAGE_TOURS[key] && !seenTours.has(key)) openPageTour(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenTours, location.pathname]);

  const handleLogout = async () => {
    // Start the splash first: clearing the session re-renders the login page
    // behind it, so the whole switch stays hidden for the splash's full length.
    window.dispatchEvent(new Event('memocare:splash-replay'));
    await logout();
    navigate('/login', { replace: true });
  };

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || 'M';

  return (
    <div className="shell">
      <a href="#mc-main" className="skip-link">Skip to main content</a>
      <button className="mobile-nav-toggle" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle navigation" aria-expanded={mobileOpen}>
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand brand-with-logo">
          <Logo variant="dark-bg" height={34} />
          <span className="brand-name">MemoCare</span>
        </div>

        <nav className="side-nav" onClick={() => setMobileOpen(false)}>
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((it) => canSee(it, role));
            if (!items.length) return null;
            return (
              <div className="side-nav-section" key={section.label}>
                <div className="side-nav-label">{section.label}</div>
                {items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => {
                      if (seenTours && PAGE_TOURS[to] && !seenTours.has(to)) openPageTour(to);
                    }}
                    className={({ isActive }) => `side-nav-item side-nav-item-info ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={17} strokeWidth={2} />
                    <span>{label}</span>
                    {to === '/notifications' && unread > 0 && <span className="nav-dot">{unread}</span>}
                    <NavItemInfo dark info={NAV_INFO[to]} />
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-spacer" />
          <ThemeToggle />
          <UserMenu role={role} initials={initials} user={user} onLogout={handleLogout} />
        </header>
        <main className="page-body" id="mc-main" tabIndex={-1}>
          <div className="container">
            <Outlet />
          </div>
        </main>
      </div>

      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      {/* One-time tutorial for the sidebar page the user just opened. */}
      {tourKey && <PageTour pageKey={tourKey} onClose={() => setTourKey(null)} />}
    </div>
  );
}

function UserMenu({ role, initials, user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEscape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div className="topbar-user-menu" ref={ref}>
      <button
        type="button"
        className="topbar-user"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span className="topbar-role-badge">{roleLabel(role)}</span>
        <span className="avatar">{initials}</span>
        <span className="topbar-name">{user?.firstName} {user?.lastName}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="topbar-user-dropdown" role="menu">
          <NavLink to="/profile" className="topbar-dropdown-item" onClick={() => setOpen(false)}>
            <Settings size={16} />
            <span>Profile & Settings</span>
          </NavLink>
          <button type="button" className="topbar-dropdown-item topbar-dropdown-logout" onClick={onLogout}>
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      )}
      {/* Keyboard support for the menu (arrow keys / enter / escape) */}
      {open && <DropdownKeyNav menuRef={ref} onEscape={() => setOpen(false)} />}
    </div>
  );
}

function DropdownKeyNav({ menuRef, onEscape }) {
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const items = [...el.querySelectorAll('.topbar-dropdown-item')];
    if (!items.length) return;
    items[0].focus();
    const onKey = (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(Math.max(i, 0) + 1) % items.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(Math.max(i, 0) - 1 + items.length) % items.length].focus();
      } else if (e.key === 'Escape') {
        onEscape();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [menuRef, onEscape]);
  return null;
}

function roleLabel(role) {
  switch (role) {
    case ROLES.FAMILY: return 'Family';
    case ROLES.CARETAKER: return 'Caretaker';
    case ROLES.HOSPITAL_STAFF: return 'Hospital Staff';
    case ROLES.MEDICAL_STORE: return 'Medical Store';
    case ROLES.ADMIN: return 'Hospital Management';
    default: return role || '';
  }
}
