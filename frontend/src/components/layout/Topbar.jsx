import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  User,
  LogOut,
  CreditCard,
  FileText,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Info,
  Settings,
} from 'lucide-react';
import { cn } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import { notifications } from '../../data/dummyData';
import Avatar from '../ui/Avatar';

const notificationIcons = {
  user: User,
  payment: CreditCard,
  report: FileText,
  system: Settings,
  comment: MessageSquare,
  task: CheckCircle,
};

const notificationColors = {
  user: 'bg-blue-50 text-blue-600',
  payment: 'bg-emerald-50 text-emerald-600',
  report: 'bg-violet-50 text-violet-600',
  system: 'bg-amber-50 text-amber-600',
  comment: 'bg-cyan-50 text-cyan-600',
  task: 'bg-emerald-50 text-emerald-600',
};

export default function Topbar({ onMenuClick, title }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { user, logout, photoUrl } = useAuth();

  const notificationRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfile(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-text-secondary hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden sm:block">
          <h1 className="text-lg font-semibold text-text-primary">{title || 'Dashboard'}</h1>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="hidden md:flex items-center relative">
          <Search className="absolute left-3 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 pl-10 pr-4 py-2 text-sm bg-gray-50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:bg-white transition-all"
          />
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg text-text-secondary hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-card rounded-xl border border-border shadow-lg animate-scale-in overflow-hidden sm:right-0 left-auto sm:w-80">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-text-primary">Notifications</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((notification) => {
                  const Icon = notificationIcons[notification.type] || Info;
                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'p-4 border-b border-border last:border-0 hover:bg-gray-50 transition-colors cursor-pointer',
                        !notification.read && 'bg-primary-50/50'
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', notificationColors[notification.type])}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{notification.title}</p>
                          <p className="text-xs text-text-secondary mt-0.5 truncate">{notification.message}</p>
                          <p className="text-xs text-text-muted mt-1">{notification.time}</p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0 mt-2" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 border-t border-border">
                <button className="w-full text-center text-sm text-primary-600 font-medium hover:text-primary-700 transition-colors">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {/* Foto profil yang sedang login. Sumbernya sama dengan halaman
                /profile (user.foto_url dari AuthContext), bukan request terpisah.
                Avatar otomatis kembali ke inisial bila foto tidak ada / gagal dimuat,
                dan tetap berbentuk lingkaran object-cover lewat komponen Avatar. */}
            <Avatar
              name={user?.nama || user?.name || 'User'}
              src={photoUrl}
              size="sm"
              className="shrink-0"
            />
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-text-primary">{user?.nama || user?.name || 'User'}</p>
              <p className="text-xs text-text-muted">{user?.role || user?.id_level || 'User'}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-text-muted hidden sm:block" />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl border border-border shadow-lg animate-scale-in overflow-hidden">
              <div className="p-4 border-b border-border">
                <p className="font-medium text-text-primary">{user?.nama || user?.name || 'User'}</p>
                <p className="text-sm text-text-muted">{user?.username || user?.email || 'user@elmech.com'}</p>
              </div>
              <div className="p-2">
                <button
                  onClick={() => { setShowProfile(false); navigate('/profile'); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-gray-50 hover:text-text-primary transition-colors"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
