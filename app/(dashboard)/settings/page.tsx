'use client'

import { useEffect, useState } from 'react'
import type { AppUser } from '@/lib/types'
import { UserPlus, Shield, Power, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { confirmAction } from '@/lib/confirm'
import { toast } from '@/lib/toast'

const ROLES = [
  { value: 'it',       label: 'IT (Full Access)' },
  { value: 'admin',    label: 'Admin (Employee + Financials)' },
  { value: 'employee', label: 'Employee (Dashboard, Members, Loans, Collections, Reports)' },
]

export default function SettingsPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)

  // Form State
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'employee',
    branch: 'ALL',
    active: true
  })
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.warn('loadUsers error status:', res.status, errText)
        setUsers([])
        return
      }
      const data = await res.json().catch(() => ({}))
      setUsers(data.users || [])
    } catch (err) {
      console.error('loadUsers failed:', err)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    const email = form.email.trim().toLowerCase()
    if (!email.endsWith('@aa2finance.com')) {
      setErrorMsg('Emails must belong to @aa2finance.com domain only.')
      return
    }
    if (!form.password || form.password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    try {
      // Create the user via the admin API route (uses Supabase service role)
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: form.password,
          displayName: form.name || email.split('@')[0],
          role: form.role,
          branchCode: form.branch === 'ALL' ? null : form.branch || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create user.')

      setSuccessMsg(`Account for ${form.name || email} created successfully!`)
      setForm({ email: '', name: '', password: '', role: 'employee', branch: 'ALL', active: true })
      await loadUsers()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create user account.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (email: string) => {
    const user = users.find(u => u.email === email)
    if (!user) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: email, active: !user.active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update status.')
      await loadUsers()
    } catch (err: any) {
      toast.error('Status Update Failed', err.message || 'Failed to update user status.')
    }
  }

  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({})

  const handleSaveRole = async (email: string) => {
    const newRole = pendingRoles[email]
    const userObj = users.find(u => u.email === email)
    if (!newRole || newRole === userObj?.role) return

    const roleLabel = ROLES.find(r => r.value === newRole)?.label || newRole

    const ok = await confirmAction({
      title: 'Confirm Role Change',
      message: `Are you sure you want to change the access role for ${userObj?.name || email} to "${roleLabel}"?`,
      confirmText: 'Save Role Change',
      variant: 'warning',
    })
    if (!ok) return

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: email, role: newRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update role.')
      
      toast.success('Role Updated Successfully', `Role for ${userObj?.name || email} changed to ${newRole.toUpperCase()}`)
      setPendingRoles(prev => {
        const next = { ...prev }
        delete next[email]
        return next
      })
      await loadUsers()
    } catch (err: any) {
      toast.error('Role Update Failed', err.message || 'Failed to update user role.')
    }
  }

  const handleCancelRoleChange = (email: string) => {
    setPendingRoles(prev => {
      const next = { ...prev }
      delete next[email]
      return next
    })
  }

  const handleDeleteUser = async (userId: string) => {
    if (userId === 'management@aa2finance.com') {
      toast.warning('Action Restricted', 'Cannot delete the primary IT account.')
      return
    }
    const ok = await confirmAction({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete user ${userId}?`,
      confirmText: 'Delete User',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete user.')
      await loadUsers()
    } catch (err: any) {
      toast.error('Deletion Failed', err.message || 'Failed to delete user.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">System Settings & Users</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage user access control, roles, and branch assignment parameters.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Create User Form */}
        <div className="lg:col-span-1 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4 h-fit">
          <h3 className="text-sm font-bold text-slate-800 pb-2 border-b border-slate-100 flex items-center gap-2">
            <UserPlus className="w-4.5 h-4.5 text-blue-500" /> Create Team Account
          </h3>

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {errorMsg}
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="username@aa2finance.com"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Ramesh Kumar"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Password *</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Branch Assignment</label>
                <input
                  type="text"
                  value={form.branch}
                  onChange={e => setForm(prev => ({ ...prev, branch: e.target.value }))}
                  placeholder="e.g. HARIDWAR or ALL"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-blue-500/10"
            >
              {submitting ? 'Creating…' : 'Create Team Account'}
            </button>
          </form>
        </div>

        {/* Right Column: User Management Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-semibold">Email</th>
                    <th className="text-left px-5 py-3 font-semibold">Name</th>
                    <th className="text-left px-5 py-3 font-semibold">Assigned Role</th>
                    <th className="text-left px-5 py-3 font-semibold">Branch</th>
                    <th className="text-center px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">Loading team users…</td></tr>
                  )}
                  {users.map(u => {
                    const currentSelectedRole = pendingRoles[u.email] !== undefined ? pendingRoles[u.email] : u.role
                    const isChanged = pendingRoles[u.email] !== undefined && pendingRoles[u.email] !== u.role

                    return (
                      <tr key={u.email} className="tbl-row align-middle">
                        <td className="px-5 py-3 font-mono font-semibold text-slate-600">{u.email}</td>
                        <td className="px-5 py-3 font-semibold text-slate-800">{u.name}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={currentSelectedRole}
                              onChange={e => setPendingRoles(prev => ({ ...prev, [u.email]: e.target.value }))}
                              className={`px-2 py-1 border rounded text-[11px] focus:outline-none transition ${isChanged ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' : 'bg-slate-50 border-slate-200'}`}
                            >
                              {ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label.split(' (')[0]}</option>
                              ))}
                            </select>
                            {isChanged && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleSaveRole(u.email)}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[10px] shadow-sm transition"
                                >
                                  Save Role
                                </button>
                                <button
                                  onClick={() => handleCancelRoleChange(u.email)}
                                  className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] transition"
                                  title="Cancel change"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      <td className="px-5 py-3 font-semibold text-slate-600">{u.branch || 'ALL'}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge text-[9px] ${u.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {u.active !== false ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleToggleActive(u.email)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            title={u.active !== false ? 'Suspend Account' : 'Activate Account'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.email)}
                            className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200/50 p-4 rounded-xl flex gap-2 items-start text-xs text-amber-900 leading-relaxed">
            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p>
              IT Admin accounts have implicit access to override all operations. Suspended accounts will be locked out from session validation instantly.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
