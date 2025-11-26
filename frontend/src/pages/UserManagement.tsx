import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { usersApi } from '../services/api';
import type { User } from '../types';

const roleColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  planner: 'bg-blue-100 text-blue-800',
  viewer: 'bg-steel-100 text-steel-800',
};

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'viewer' as User['role'],
    password: '',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        password: '',
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        firstName: '',
        lastName: '',
        role: 'viewer',
        password: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const { password, ...updateData } = formData;
        await usersApi.update(editingUser.id, updateData);
        if (password) {
          await usersApi.updatePassword(editingUser.id, {
            currentPassword: '',
            newPassword: password,
          });
        }
      } else {
        await usersApi.create(formData);
      }
      setIsModalOpen(false);
      loadUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await usersApi.delete(id);
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-900">User Management</h1>
          <p className="mt-1 text-sm text-steel-500">
            Manage user accounts and role assignments
          </p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary flex items-center">
          <PlusIcon className="mr-2 h-5 w-5" />
          Add User
        </button>
      </div>

      {/* Role legend */}
      <div className="flex items-center space-x-6 text-sm">
        <span className="text-steel-600">Roles:</span>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex rounded-full px-2 text-xs font-semibold ${roleColors.admin}`}>
            Admin
          </span>
          <span className="text-steel-500">Full access</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex rounded-full px-2 text-xs font-semibold ${roleColors.planner}`}>
            Planner
          </span>
          <span className="text-steel-500">Create and edit plans</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`inline-flex rounded-full px-2 text-xs font-semibold ${roleColors.viewer}`}>
            Viewer
          </span>
          <span className="text-steel-500">Read-only access</span>
        </div>
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-steel-500">Loading users...</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-steel-200">
            <thead className="bg-steel-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-steel-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-steel-200">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rail-600 text-white font-medium">
                        {user.firstName?.[0]}
                        {user.lastName?.[0]}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-steel-900">
                          {user.firstName} {user.lastName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${roleColors[user.role]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-steel-700">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(user)}
                      className="text-rail-600 hover:text-rail-900 mr-3"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-steel-900/50" onClick={() => setIsModalOpen(false)} />
            <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-semibold text-steel-900 mb-4">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">First Name</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Last Name</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
                    className="input"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="planner">Planner</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="label">
                    {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="input"
                    required={!editingUser}
                    minLength={8}
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingUser ? 'Save Changes' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
