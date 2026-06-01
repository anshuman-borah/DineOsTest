'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost, apiPut, apiPatch, apiDelete } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';
import { Plus, Edit2, UserX, Shield, Layout, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Department + Role config ────────────────────────────────────────────────
type Department = 'restaurant' | 'hotel' | 'both';

const DEPARTMENT_LABELS: Record<Department, string> = {
  restaurant: '🍽️ Restaurant',
  hotel: '🏨 Hotel',
  both: '🏢 Management HQ',
};

const ROLES_BY_DEPARTMENT: Record<Department, string[]> = {
  restaurant: ['restaurant_manager', 'cashier', 'waiter', 'kitchen', 'inventory'],
  hotel: ['hotel_manager', 'receptionist', 'housekeeping'],
  both: ['owner', 'manager'],
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'badge-yellow', manager: 'badge-blue',
  restaurant_manager: 'badge-blue', hotel_manager: 'badge-blue',
  cashier: 'badge-green', waiter: 'badge-slate', kitchen: 'badge-red',
  inventory: 'badge-slate', housekeeping: 'badge-blue', receptionist: 'badge-purple',
};

const ROLE_DEPARTMENT: Record<string, string> = {
  owner: 'Management', manager: 'Management',
  restaurant_manager: 'Restaurant', hotel_manager: 'Hotel',
  cashier: 'Restaurant', waiter: 'Restaurant', kitchen: 'Restaurant', inventory: 'Restaurant',
  receptionist: 'Hotel', housekeeping: 'Hotel',
};

function detectDepartment(role: string): Department {
  if (['restaurant_manager', 'cashier', 'waiter', 'kitchen', 'inventory'].includes(role)) return 'restaurant';
  if (['hotel_manager', 'receptionist', 'housekeeping'].includes(role)) return 'hotel';
  return 'both';
}

function getAvailableRoles(dept: Department, userRole?: string): string[] {
  return ROLES_BY_DEPARTMENT[dept].filter(r => {
    if (userRole === 'owner') return true;
    if (userRole === 'manager') return !['owner', 'manager'].includes(r);
    // Dept managers can only create staff, no managers
    if (['restaurant_manager', 'hotel_manager'].includes(userRole || '')) {
      return !['owner', 'manager', 'restaurant_manager', 'hotel_manager'].includes(r);
    }
    return false;
  });
}

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { user, branchId } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [department, setDepartment] = useState<Department>('restaurant');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', role: 'cashier', password: '', pin: '', employeeCode: '', branchId: '' });

  const { data: users, isFetching: isLoading } = useQuery({ 
    queryKey: ['users'], 
    queryFn: () => apiFetch('/api/v1/users').then((r) => r.data),
    staleTime: 0,
    gcTime: 0,
  });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => apiFetch('/api/v1/branches').then((r) => r.data), enabled: user?.role === 'owner' });

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    
    // Owner sees everyone
    if (user?.role === 'owner') return users;
    
    // Branch manager sees everyone EXCEPT owners and other branch managers
    if (user?.role === 'manager') {
      return users.filter((u: any) => !['owner', 'manager'].includes(u.role));
    }
    
    // Dept managers see only their department, EXCEPT higher-ups
    if (user?.role === 'restaurant_manager') {
      return users.filter((u: any) => detectDepartment(u.role) === 'restaurant' && !['owner', 'manager', 'restaurant_manager'].includes(u.role));
    }
    if (user?.role === 'hotel_manager') {
      return users.filter((u: any) => detectDepartment(u.role) === 'hotel' && !['owner', 'manager', 'hotel_manager'].includes(u.role));
    }
    
    return [];
  }, [users, user?.role]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        role: form.role,
        employeeCode: form.employeeCode,
      };

      if (user?.role === 'owner' && form.branchId) {
        payload.branchId = form.branchId;
      }

      if (form.password) {
        payload.password = form.password;
      }

      return editUser
        ? apiPut(`/api/v1/users/${editUser.id}`, payload)
        : apiPost('/api/v1/users', payload);
    },
    onSuccess: () => {
      toast.success('Employee saved');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setEditUser(null);
      setDepartment('restaurant');
      setForm({ firstName: '', lastName: '', email: '', phone: '', role: 'cashier', password: '', pin: '', employeeCode: '', branchId: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/users/${id}`),
    onSuccess: () => {
      toast.success('Employee permanently deleted');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('Failed to delete employee'),
  });

  // ── Permission toggle (canManageTables for waiters) ─────────────────────
  const PERMISSION_GRANTERS = ['owner', 'manager', 'restaurant_manager'];
  const canGrantPermissions = PERMISSION_GRANTERS.includes(user?.role ?? '');

  const permissionMutation = useMutation({
    mutationFn: ({ id, canManageTables }: { id: string; canManageTables: boolean }) =>
      apiPatch(`/api/v1/users/${id}/permissions`, { permissions: { canManageTables } }),
    onSuccess: (_data, { canManageTables }) => {
      toast.success(canManageTables ? 'Table management access granted' : 'Table management access revoked');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('Failed to update permission'),
  });

  const handleDepartmentChange = (dept: Department) => {
    setDepartment(dept);
    const availableRoles = getAvailableRoles(dept, user?.role);
    if (availableRoles.length > 0 && !getAvailableRoles(dept, user?.role).includes(form.role)) {
      setForm({ ...form, role: availableRoles[0] });
    }
  };

  const filteredRoles = getAvailableRoles(department, user?.role);

  const availableDepartments = (Object.keys(DEPARTMENT_LABELS) as Department[]).filter(dept => {
    if (user?.role === 'owner' || user?.role === 'manager') return true;
    if (user?.role === 'restaurant_manager') return dept === 'restaurant';
    if (user?.role === 'hotel_manager') return dept === 'hotel';
    return false;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Employees</h1>
          <p className="text-sm text-slate-900 dark:text-slate-400">{filteredUsers.length} active staff members</p>
        </div>
        <button onClick={() => { setEditUser(null); setDepartment('restaurant'); setForm({ firstName: '', lastName: '', email: '', phone: '', role: 'cashier', password: '', pin: '', employeeCode: '', branchId: '' }); setShowForm(true); }} className="btn-primary"><Plus size={14} /> Add Employee</button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100/50 dark:bg-slate-800/50">
            <tr>
              <th className="th">Name</th>
              <th className="th">Contact</th>
              <th className="th">Role</th>
              {user?.role === 'owner' && <th className="th">Branch</th>}
              <th className="th">Dept</th>
              <th className="th">Employee Code</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="table-row">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 animate-pulse"></div>
                    </div>
                  </td>
                  <td className="td space-y-1">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-32 animate-pulse"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24 animate-pulse"></div>
                  </td>
                  <td className="td"><div className="h-6 bg-slate-200 dark:bg-slate-700 rounded-full w-24 animate-pulse"></div></td>
                  {user?.role === 'owner' && (
                    <td className="td"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 animate-pulse"></div></td>
                  )}
                  <td className="td"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 animate-pulse"></div></td>
                  <td className="td"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16 animate-pulse"></div></td>
                  <td className="td"><div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-16 animate-pulse"></div></td>
                </tr>
              ))
            ) : filteredUsers.map((u: any) => (
              <tr key={u.id} className="table-row">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-900 dark:text-white">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                    <div><div className="font-medium">{u.firstName} {u.lastName} {u.id === user?.id && <span className="text-amber-500 ml-1 text-xs font-bold">(You)</span>}</div></div>
                  </div>
                </td>
                <td className="td text-slate-900 dark:text-slate-400 text-xs">
                  <div>{u.email}</div>
                  <div>{u.phone}</div>
                </td>
                <td className="td">
                  <span className={ROLE_COLORS[u.role] || 'badge-slate'}>
                    {u.role === 'manager' ? 'Branch Manager' :
                      u.role === 'restaurant_manager' ? 'Restaurant Manager' :
                        u.role === 'hotel_manager' ? 'Hotel Manager' :
                          u.role.charAt(0).toUpperCase() + u.role.slice(1).replace('_', ' ')}
                  </span>
                </td>
                {user?.role === 'owner' && (
                  <td className="td text-slate-900 dark:text-slate-400 text-xs">
                    {u.branchId ? (branches?.find((b: any) => b.id === u.branchId)?.name || 'Unknown Branch') : 'Global'}
                  </td>
                )}
                <td className="td"><span className="text-xs text-slate-900 dark:text-slate-500">{ROLE_DEPARTMENT[u.role] || '—'}</span></td>
                <td className="td text-slate-900 dark:text-slate-400 font-mono">{u.employeeCode || '—'}</td>
                <td className="td">
                  <div className="flex gap-2 items-center">
                    <button onClick={() => {
                      setEditUser(u);
                      const dept = detectDepartment(u.role);
                      setDepartment(dept);
                      setForm({ firstName: u.firstName, lastName: u.lastName || '', email: u.email || '', phone: u.phone || '', role: u.role, password: '', pin: '', employeeCode: u.employeeCode || '', branchId: u.branchId || '' });
                      setShowForm(true);
                    }} className="btn-ghost p-1.5"><Edit2 size={13} /></button>

                    {/* Table permission toggle — only for waiters, only shown to managers/owners */}
                    {canGrantPermissions && u.role === 'waiter' && (
                      <button
                        title={u.permissions?.canManageTables ? 'Revoke table management' : 'Grant table management'}
                        onClick={() => permissionMutation.mutate({ id: u.id, canManageTables: !u.permissions?.canManageTables })}
                        disabled={permissionMutation.isPending}
                        className={cn(
                          'btn-ghost p-1.5 transition-colors',
                          u.permissions?.canManageTables
                            ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-500'
                            : 'text-slate-400 hover:text-amber-500'
                        )}
                      >
                        {u.permissions?.canManageTables ? <Layout size={13} /> : <Lock size={13} />}
                      </button>
                    )}

                    {u.id !== user?.id && (
                      <button
                        onClick={() => setDeleteUser(u)}
                        className="btn-ghost p-1.5 text-red-600 dark:text-red-400 hover:text-red-300"
                      >
                        <UserX size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && filteredUsers.length === 0 && <tr><td colSpan={user?.role === 'owner' ? 7 : 6} className="text-center py-12 text-slate-900 dark:text-slate-500">No employees added yet</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">{editUser ? 'Edit Employee' : 'Add Employee'}</h3>

            <div>
              <label className="label">Department *</label>
              <div className="flex gap-2">
                {availableDepartments.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => handleDepartmentChange(dept)}
                    className={cn(
                      'flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all',
                      department === dept
                        ? 'bg-amber-500 text-slate-900 border-amber-500'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:border-slate-500'
                    )}
                  >
                    {DEPARTMENT_LABELS[dept]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">First Name *</label><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div><label className="label">Last Name</label><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
              <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editUser} /></div>
              <div><label className="label">Phone *</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!!editUser} /></div>
              <div>
                <label className="label">Role *</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={!!(editUser && editUser.id === user?.id)}>
                  {filteredRoles.map((r) => {
                    const label = r === 'manager' ? 'Branch Manager'
                      : r === 'restaurant_manager' ? 'Restaurant Manager'
                        : r === 'hotel_manager' ? 'Hotel Manager'
                          : r.charAt(0).toUpperCase() + r.slice(1);
                    return <option key={r} value={r}>{label}</option>
                  })}
                </select>
              </div>
              <div><label className="label">Employee Code</label><input className="input" value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} /></div>
              {user?.role === 'owner' && !branchId && form.role !== 'owner' && (
                <div>
                  <label className="label">Assign Branch *</label>
                  <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                    <option value="" disabled>Select a Branch</option>
                    {branches?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {user?.role === 'owner' && branchId && form.role !== 'owner' && (
                <div className="col-span-2 mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-400/10 p-2.5 rounded-lg border border-amber-300 dark:border-amber-400/20">
                  This employee will be automatically assigned to your currently selected branch. Switch to "All Branches" to assign to a different location.
                </div>
              )}
              {form.role === 'owner' && (
                <div className="col-span-2 mt-2 text-xs text-blue-400 bg-blue-400/10 p-2.5 rounded-lg border border-blue-400/20">
                  Owners have global system access and are not restricted to any specific branch.
                </div>
              )}
              <div>
                <label className="label">Password {editUser ? '(Leave blank to keep current)' : '*'}</label>
                <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => {
                if (editUser && form.password) {
                  if (!window.confirm('Are you sure you want to change this employee\'s password?')) return;
                }
                
                // Block non-owner roles from being Global
                if (!form.branchId && form.role !== 'owner') {
                  toast.error(`A specific branch must be assigned for the ${form.role.replace('_', ' ')} role.`);
                  return;
                }

                saveMutation.mutate();
              }} disabled={saveMutation.isPending || !form.firstName || (!editUser && !form.password)} className="btn-primary flex-1">
                {saveMutation.isPending ? 'Saving...' : 'Save Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 Delete Confirmation Modal - Permanent Deletion */}
      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                <UserX className="text-red-500" size={22} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Permanently Delete Employee
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  This action cannot be undone. The employee will be permanently removed from the system.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-slate-100 dark:bg-slate-800 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Are you sure you want to permanently delete:
              </p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-white">
                {deleteUser.firstName} {deleteUser.lastName}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                {deleteUser.role === 'manager' ? 'Branch Manager' :
                  deleteUser.role === 'restaurant_manager' ? 'Restaurant Manager' :
                    deleteUser.role === 'hotel_manager' ? 'Hotel Manager' :
                      deleteUser.role.charAt(0).toUpperCase() + deleteUser.role.slice(1).replace('_', ' ')}
              </p>
              {deleteUser.email && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  Email: {deleteUser.email}
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteUser(null)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate(deleteUser.id);
                  setDeleteUser(null);
                }}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-white hover:bg-red-700 transition disabled:opacity-50"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}