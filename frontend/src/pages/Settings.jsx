import { useState } from 'react';
import { User, Bell, Shield, Palette, Globe, Save } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input, { Select, Textarea } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'language', label: 'Language', icon: Globe },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.nama || user?.name || 'Admin User',
    email: user?.username || user?.email || 'admin',
    phone: '+62 812 3456 7890',
    company: 'ELMECH',
    bio: 'System administrator with 5+ years of experience.',
    emailNotifications: true,
    pushNotifications: true,
    weeklyReport: true,
    securityAlerts: true,
  });

  const handleSave = () => {
    alert('Settings saved successfully!');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Settings</h2>
        <p className="text-text-secondary mt-1">Manage your account settings and preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar tabs */}
        <Card className="lg:w-64 !p-2 h-fit">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </Card>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Full Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                  <Input
                    label="Phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  <Input
                    label="Company"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
                <Textarea
                  label="Bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button icon={Save} onClick={handleSave}>Save Changes</Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                {[
                  { key: 'emailNotifications', label: 'Email Notifications', description: 'Receive notifications via email' },
                  { key: 'pushNotifications', label: 'Push Notifications', description: 'Receive push notifications in browser' },
                  { key: 'weeklyReport', label: 'Weekly Report', description: 'Receive weekly summary reports' },
                  { key: 'securityAlerts', label: 'Security Alerts', description: 'Get notified about security events' },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{item.label}</p>
                      <p className="text-xs text-text-muted">{item.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData[item.key]}
                        onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                ))}
                <div className="flex justify-end pt-4">
                  <Button icon={Save} onClick={handleSave}>Save Changes</Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Input label="Current Password" type="password" placeholder="Enter current password" />
                <Input label="New Password" type="password" placeholder="Enter new password" />
                <Input label="Confirm New Password" type="password" placeholder="Confirm new password" />
                <div className="flex justify-end">
                  <Button icon={Save} onClick={handleSave}>Update Password</Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'appearance' && (
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Select label="Theme">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </Select>
                <Select label="Accent Color">
                  <option value="blue">Blue</option>
                  <option value="green">Green</option>
                  <option value="purple">Purple</option>
                  <option value="orange">Orange</option>
                </Select>
                <div className="flex justify-end">
                  <Button icon={Save} onClick={handleSave}>Save Changes</Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'language' && (
            <Card>
              <CardHeader>
                <CardTitle>Language & Region</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Select label="Language">
                  <option value="en">English</option>
                  <option value="id">Indonesia</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                </Select>
                <Select label="Timezone">
                  <option value="wib">WIB (UTC+7)</option>
                  <option value="wita">WITA (UTC+8)</option>
                  <option value="wit">WIT (UTC+9)</option>
                </Select>
                <div className="flex justify-end">
                  <Button icon={Save} onClick={handleSave}>Save Changes</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
