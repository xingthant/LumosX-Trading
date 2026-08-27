'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  is_merchant: boolean;
}

export default function AdminMerchantsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);

  function load() {
    api.get<{ users: AdminUser[] }>('/api/admin/users').then((res) => setUsers(res.users)).catch(() => {});
  }

  useEffect(load, []);

  async function toggle(u: AdminUser) {
    await api.patch(`/api/admin/users/${u.id}/merchant`, { isMerchant: !u.is_merchant });
    load();
  }

  return (
    <AdminShell title="Merchants">
      <p className="mb-4 text-sm text-muted">
        Grant merchant status to let a user publish P2P buy/sell ads and appear in the marketplace.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-panel text-left text-muted">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Merchant</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">
                  <span className={u.is_merchant ? 'text-accent' : 'text-muted'}>{u.is_merchant ? 'Yes' : 'No'}</span>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => toggle(u)} className="rounded-lg border border-border px-2 py-1 text-xs">
                    {u.is_merchant ? 'Revoke' : 'Grant'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
