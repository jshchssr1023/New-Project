import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [companySettings, setCompanySettings] = useState({
    name: 'AITX Rail Services',
    code: 'AITX',
    defaultCostPerService: 25000,
    defaultTurnTime: 14,
    fiscalYearStart: '01',
  });
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    serviceReminders: true,
    planUpdates: true,
    weeklyReports: false,
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // API call would go here
    alert('Profile updated successfully!');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    // API call would go here
    alert('Password updated successfully!');
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const handleCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // API call would go here
    alert('Company settings updated successfully!');
  };

  const tabs = [
    { id: 'profile', name: 'Profile' },
    { id: 'security', name: 'Security' },
    { id: 'company', name: 'Company' },
    { id: 'notifications', name: 'Notifications' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-steel-900">Settings</h1>
        <p className="mt-1 text-sm text-steel-500">
          Manage your account and application preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-steel-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-rail-500 text-rail-600'
                  : 'border-transparent text-steel-500 hover:text-steel-700 hover:border-steel-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-medium text-steel-900 mb-4">Profile Information</h2>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">First Name</label>
                <input
                  type="text"
                  value={profileData.firstName}
                  onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input
                  type="text"
                  value={profileData.lastName}
                  onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Role</label>
              <input
                type="text"
                value={user?.role || ''}
                disabled
                className="input bg-steel-50 cursor-not-allowed capitalize"
              />
              <p className="mt-1 text-xs text-steel-500">Contact an administrator to change your role</p>
            </div>
            <div className="pt-4">
              <button type="submit" className="btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Security tab */}
      {activeTab === 'security' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-medium text-steel-900 mb-4">Change Password</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="input"
                required
                minLength={8}
              />
              <p className="mt-1 text-xs text-steel-500">Minimum 8 characters</p>
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="input"
                required
              />
            </div>
            <div className="pt-4">
              <button type="submit" className="btn-primary">
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Company tab */}
      {activeTab === 'company' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-medium text-steel-900 mb-4">Company Settings</h2>
          {user?.role === 'admin' ? (
            <form onSubmit={handleCompanySubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Company Name</label>
                  <input
                    type="text"
                    value={companySettings.name}
                    onChange={(e) => setCompanySettings({ ...companySettings, name: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Company Code</label>
                  <input
                    type="text"
                    value={companySettings.code}
                    onChange={(e) => setCompanySettings({ ...companySettings, code: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Default Cost per Service ($)</label>
                  <input
                    type="number"
                    value={companySettings.defaultCostPerService}
                    onChange={(e) =>
                      setCompanySettings({ ...companySettings, defaultCostPerService: parseInt(e.target.value) })
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Default Turn Time (days)</label>
                  <input
                    type="number"
                    value={companySettings.defaultTurnTime}
                    onChange={(e) =>
                      setCompanySettings({ ...companySettings, defaultTurnTime: parseInt(e.target.value) })
                    }
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Fiscal Year Start Month</label>
                <select
                  value={companySettings.fiscalYearStart}
                  onChange={(e) => setCompanySettings({ ...companySettings, fiscalYearStart: e.target.value })}
                  className="input w-48"
                >
                  <option value="01">January</option>
                  <option value="04">April</option>
                  <option value="07">July</option>
                  <option value="10">October</option>
                </select>
              </div>
              <div className="pt-4">
                <button type="submit" className="btn-primary">
                  Save Company Settings
                </button>
              </div>
            </form>
          ) : (
            <p className="text-steel-500">Only administrators can modify company settings.</p>
          )}
        </div>
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-medium text-steel-900 mb-4">Notification Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-steel-900">Email Alerts</p>
                <p className="text-sm text-steel-500">Receive important alerts via email</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifications({ ...notifications, emailAlerts: !notifications.emailAlerts })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifications.emailAlerts ? 'bg-rail-600' : 'bg-steel-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    notifications.emailAlerts ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-steel-900">Service Reminders</p>
                <p className="text-sm text-steel-500">Get notified about upcoming service dates</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifications({ ...notifications, serviceReminders: !notifications.serviceReminders })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifications.serviceReminders ? 'bg-rail-600' : 'bg-steel-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    notifications.serviceReminders ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-steel-900">Plan Updates</p>
                <p className="text-sm text-steel-500">Notify when plans are modified</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifications({ ...notifications, planUpdates: !notifications.planUpdates })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifications.planUpdates ? 'bg-rail-600' : 'bg-steel-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    notifications.planUpdates ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-steel-900">Weekly Reports</p>
                <p className="text-sm text-steel-500">Receive weekly summary reports</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifications({ ...notifications, weeklyReports: !notifications.weeklyReports })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  notifications.weeklyReports ? 'bg-rail-600' : 'bg-steel-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    notifications.weeklyReports ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
