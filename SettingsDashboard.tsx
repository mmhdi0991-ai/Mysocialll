import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Shield, Palette, Bell, 
  Check, Save, Moon, Sun, Monitor, 
  Key, AtSign, AlignLeft, Smartphone
} from 'lucide-react';

interface SettingsData {
  username: string;
  bio: string;
  email: string;
  twoFactorAuth: boolean;
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  pushNotifications: boolean;
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyMessages: boolean;
}

const DEFAULT_SETTINGS: SettingsData = {
  username: 'alex_designs',
  bio: 'Visual artist & UI Designer. Exploring the digital frontier one pixel at a time.',
  email: 'hello@alexdesigns.io',
  twoFactorAuth: false,
  theme: 'dark',
  accentColor: 'gold',
  pushNotifications: true,
  notifyLikes: true,
  notifyComments: true,
  notifyMessages: true,
};

const ACCENT_COLORS = [
  { id: 'gold', name: 'Champagne Gold', bg: 'bg-[#d4b98c]', shadow: 'shadow-none', ring: 'ring-[#d4b98c]', glow: 'shadow-[0_0_0_1px_rgba(212,185,140,0.4)]' },
  { id: 'violet', name: 'Neon Violet', bg: 'bg-violet-600', shadow: 'shadow-violet-600/40', ring: 'ring-violet-600', glow: 'shadow-[0_0_15px_rgba(124,58,237,0.5)]' },
  { id: 'cyan', name: 'Cyan', bg: 'bg-cyan-500', shadow: 'shadow-cyan-500/40', ring: 'ring-cyan-500', glow: 'shadow-[0_0_15px_rgba(6,182,212,0.5)]' },
  { id: 'emerald', name: 'Emerald', bg: 'bg-emerald-500', shadow: 'shadow-emerald-500/40', ring: 'ring-emerald-500', glow: 'shadow-[0_0_15px_rgba(16,185,129,0.5)]' },
  { id: 'pink', name: 'Sunrise Pink', bg: 'bg-rose-500', shadow: 'shadow-rose-500/40', ring: 'ring-rose-500', glow: 'shadow-[0_0_15px_rgba(244,63,94,0.5)]' },
];

export const SettingsDashboard: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'account' | 'security' | 'appearance' | 'notifications'>('account');
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('aura_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  // Save to local storage on settings change (toggles)
  const updateSetting = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value };
      localStorage.setItem('aura_settings', JSON.stringify(newSettings));
      return newSettings;
    });
  };

  const handleManualSave = () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setTimeout(() => {
      localStorage.setItem('aura_settings', JSON.stringify(settings));
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  const categories = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ] as const;

  const currentAccent = ACCENT_COLORS.find(c => c.id === settings.accentColor) || ACCENT_COLORS[0];

  const renderContent = () => {
    switch (activeCategory) {
      case 'account':
        return (
          <motion.div
            key="account"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Account Settings</h3>
              <p className="text-gray-400 text-sm mb-6">Manage your public profile and private information.</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <AtSign className={`h-5 w-5 text-gray-500 transition-colors duration-300 group-focus-within:text-[${currentAccent.bg.replace('bg-', '')}]`} />
                  </div>
                  <input
                    type="text"
                    value={settings.username}
                    onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                    className="block w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-1 focus:border-transparent transition-all duration-300"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  className="block w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-1 focus:border-transparent transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex justify-between">
                   <span>Bio</span>
                   <span className="text-xs text-gray-500">{settings.bio.length} / 160</span>
                </label>
                <div className="relative group">
                  <div className="absolute top-3.5 left-0 pl-4 flex items-start pointer-events-none">
                    <AlignLeft className="h-5 w-5 text-gray-500 transition-colors duration-300" />
                  </div>
                  <textarea
                    value={settings.bio}
                    onChange={(e) => setSettings({ ...settings, bio: e.target.value.slice(0, 160) })}
                    rows={4}
                    className="block w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-1 focus:border-transparent transition-all duration-300 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 flex justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleManualSave}
                disabled={isSaving}
                className={`flex items-center justify-center space-x-2 px-7 py-3 rounded-xl font-medium transition-all duration-300 ${
                  saveSuccess 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                    : `${currentAccent.bg} hover:brightness-110 text-white shadow-lg ${currentAccent.shadow}`
                }`}
              >
                {isSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : saveSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Saved Successfully</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Save Changes</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        );

      case 'security':
        return (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Security</h3>
              <p className="text-gray-400 text-sm mb-6">Enhance your account security and manage passwords.</p>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all duration-300 rounded-2xl p-5 flex items-center justify-between group">
                <div className="flex flex-col">
                  <span className="text-white font-medium flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                    Two-Factor Authentication
                  </span>
                  <span className="text-gray-400 text-sm mt-1">Add an extra layer of security to your logins.</span>
                </div>
                <ToggleSwitch 
                  isActive={settings.twoFactorAuth} 
                  onToggle={() => updateSetting('twoFactorAuth', !settings.twoFactorAuth)}
                  accentBg={currentAccent.bg}
                />
              </div>

              <div className="bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all duration-300 rounded-2xl p-6">
                <h4 className="text-white font-medium flex items-center gap-2 mb-5">
                  <Key className="w-4 h-4 text-gray-400" />
                  Change Password
                </h4>
                <div className="space-y-4">
                  <input
                    type="password"
                    placeholder="Current Password"
                    className="block w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all duration-300"
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    className="block w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all duration-300"
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    className="block w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all duration-300"
                  />
                  <div className="flex justify-end pt-3">
                    <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl text-sm transition-all duration-300 font-medium hover:scale-105 active:scale-95">
                      Update Password
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        );

      case 'appearance':
        return (
          <motion.div
            key="appearance"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Appearance</h3>
              <p className="text-gray-400 text-sm mb-6">Customize the look and feel of your My Social experience.</p>
            </div>

            <div className="space-y-8">
                <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4">Theme Selection</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
                    <ThemeCard 
                        active={settings.theme === 'dark'} 
                        title="Dark Mode" 
                        icon={Moon} 
                        onClick={() => updateSetting('theme', 'dark')} 
                        accentGlow={currentAccent.glow}
                    />
                    <ThemeCard 
                        active={settings.theme === 'light'} 
                        title="Light Mode" 
                        icon={Sun} 
                        onClick={() => updateSetting('theme', 'light')} 
                        accentGlow={currentAccent.glow}
                    />
                    <ThemeCard 
                        active={settings.theme === 'system'} 
                        title="System Sync" 
                        icon={Monitor} 
                        onClick={() => updateSetting('theme', 'system')} 
                        accentGlow={currentAccent.glow}
                    />
                    </div>
                </div>

                <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4">Accent Color</h4>
                    <div className="flex items-center gap-5">
                        {ACCENT_COLORS.map(color => {
                            const isSelected = settings.accentColor === color.id;
                            return (
                                <button
                                    key={color.id}
                                    onClick={() => updateSetting('accentColor', color.id)}
                                    title={color.name}
                                    className={`relative w-12 h-12 rounded-full transition-all duration-300 ease-out flex items-center justify-center ${color.bg} ${isSelected ? `scale-110 shadow-lg ${color.shadow}` : 'hover:scale-105 opacity-80 hover:opacity-100'}`}
                                >
                                    {isSelected && (
                                        <motion.div
                                            layoutId="color-outline"
                                            className="absolute -inset-1.5 rounded-full border-2 border-white pointer-events-none"
                                            animate={{ opacity: 1, scale: 1 }}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
          </motion.div>
        );

      case 'notifications':
        return (
          <motion.div
            key="notifications"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Notifications</h3>
              <p className="text-gray-400 text-sm mb-6">Control how and when you are alerted.</p>
            </div>

            <div className="space-y-4">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex items-center justify-between mb-8 transition-colors duration-300 hover:bg-white/10">
                <div className="flex flex-col">
                  <span className="text-white font-medium text-lg">Push Notifications</span>
                  <span className="text-gray-400 text-sm mt-1">Enable or disable all push notifications globally.</span>
                </div>
                <ToggleSwitch 
                  isActive={settings.pushNotifications} 
                  onToggle={() => updateSetting('pushNotifications', !settings.pushNotifications)} 
                  accentBg={currentAccent.bg}
                />
              </div>

              <div className={`space-y-3 transition-opacity duration-300 ${!settings.pushNotifications ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-2">Interactions</h4>
                  
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors duration-300">
                    <div className="flex flex-col">
                      <span className="text-white font-medium">Likes</span>
                      <span className="text-gray-500 text-sm">When someone likes your posts or comments.</span>
                    </div>
                    <ToggleSwitch 
                      isActive={settings.notifyLikes} 
                      onToggle={() => updateSetting('notifyLikes', !settings.notifyLikes)} 
                      accentBg={currentAccent.bg}
                    />
                  </div>

                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors duration-300">
                    <div className="flex flex-col">
                      <span className="text-white font-medium">Comments</span>
                      <span className="text-gray-500 text-sm">When someone comments on your posts.</span>
                    </div>
                    <ToggleSwitch 
                      isActive={settings.notifyComments} 
                      onToggle={() => updateSetting('notifyComments', !settings.notifyComments)} 
                      accentBg={currentAccent.bg}
                    />
                  </div>

                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/10 transition-colors duration-300">
                    <div className="flex flex-col">
                      <span className="text-white font-medium">Direct Messages</span>
                      <span className="text-gray-500 text-sm">When you receive a new direct message.</span>
                    </div>
                    <ToggleSwitch 
                      isActive={settings.notifyMessages} 
                      onToggle={() => updateSetting('notifyMessages', !settings.notifyMessages)} 
                      accentBg={currentAccent.bg}
                    />
                  </div>
              </div>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className="pb-32 pt-10 min-h-screen font-sans selection:bg-white/20 selection:text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-wide mb-8 md:mb-12 text-white">
                Settings
            </h1>

            <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
                {/* Sidebar Navigation */}
                <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0 scrollbar-default md:scrollbar-hide">
                    {categories.map((cat) => {
                        const isActive = activeCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 font-medium whitespace-nowrap md:whitespace-normal group ${
                                    isActive 
                                        ? 'bg-white/10 text-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] border border-white/10' 
                                        : 'text-gray-400 hover:bg-white/5 hover:text-white border border-transparent'
                                }`}
                            >
                                <cat.icon className={`w-5 h-5 transition-colors duration-300 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`} />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Main Content Area */}
                <div className="flex-1 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-6 lg:p-10 shadow-2xl relative overflow-hidden min-h-[600px]">
                    {/* Futuristic Glassmorphism Orbs */}
                    <div className={`absolute top-[-15%] right-[-10%] w-[500px] h-[500px] ${currentAccent.bg} rounded-full blur-[140px] opacity-10 pointer-events-none transition-colors duration-1000`} />
                    <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] bg-blue-600 rounded-full blur-[140px] opacity-10 pointer-events-none transition-colors duration-1000" />
                    
                    <AnimatePresence mode="wait">
                        {renderContent()}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    </div>
  );
};

// --- Custom Components ---

const ToggleSwitch: React.FC<{ isActive: boolean; onToggle: () => void; accentBg: string }> = ({ isActive, onToggle, accentBg }) => (
    <label className="relative inline-flex items-center cursor-pointer">
        <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={isActive} 
            onChange={onToggle}
        />
        <div className={`w-11 h-6 rounded-full transition-all duration-300 ease-in-out border border-transparent peer-focus:outline-none ${isActive ? accentBg : 'bg-white/10 hover:bg-white/20 border-white/5'}`}></div>
        <div className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-md transform ${isActive ? 'translate-x-full border-white' : 'translate-x-0'}`}></div>
    </label>
);

const ThemeCard: React.FC<{ active: boolean; title: string; icon: React.ElementType; onClick: () => void; accentGlow: string }> = ({ active, title, icon: Icon, onClick, accentGlow }) => (
    <div 
        onClick={onClick}
        className={`cursor-pointer rounded-2xl p-6 flex flex-col items-center justify-center space-y-4 border transition-all duration-300 group ${
            active 
                ? `bg-white/10 border-white/40 ${accentGlow}` 
                : 'bg-black/20 border-white/5 hover:border-white/20 hover:bg-white/5'
        }`}
    >
        <div className={`p-4 rounded-full transition-all duration-300 ${active ? 'bg-white text-black shadow-lg scale-110' : 'bg-white/5 text-gray-400 group-hover:text-gray-200 group-hover:bg-white/10'}`}>
            <Icon className="w-6 h-6" />
        </div>
        <span className={`font-medium tracking-wide transition-colors duration-300 mt-2 ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>{title}</span>
    </div>
);
