import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  UserCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
// Imported (not a "/src/..." path) so Vite bundles the asset into the build output.
import logoElmech from '../../assets/logo/logo_elmech.png';

const menuItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/users', label: 'User', icon: Users },
  { path: '/letters', label: 'Surat', icon: FileText },
];

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'bg-card border-r border-border flex flex-col flex-shrink-0',
          'transition-[width] duration-300 ease-in-out',
          'lg:sticky lg:top-0 lg:h-screen',
          'fixed top-0 left-0 z-50 h-full lg:translate-x-0',
          collapsed ? 'w-20' : 'w-64',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={logoElmech}
              alt="ELMECH Logo"
              className="w-9 h-9 object-contain flex-shrink-0"
            />
            {!collapsed && (
              <span className="text-lg font-bold text-text-primary">ELMECH</span>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {menuItems.map((item) => {
              // For nested routes like /letters/*, check if path starts with the menu path
              const isActive = item.path === '/letters'
                ? location.pathname.startsWith('/letters')
                : location.pathname === item.path;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary',
                      collapsed && 'justify-center px-2'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-primary-600')} />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border flex-shrink-0">
          <div className="p-3">
            <NavLink
              to="/profile"
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                location.pathname === '/profile'
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? 'Profil' : undefined}
            >
              <UserCircle className={cn('w-5 h-5 flex-shrink-0', location.pathname === '/profile' && 'text-primary-600')} />
              {!collapsed && <span>Profil</span>}
            </NavLink>
          </div>
          <div className="p-3 border-t border-border">
            <button
              onClick={logout}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? 'Logout' : undefined}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>Logout</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
