'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api } from '@/lib/api';

interface AuditLog {
  id: string;
  admin_email: string;
  target_user_id: string | null;
  action_type: string;
  amount: string | null;
  asset_symbol: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    api.get<{ logs: AuditLog[] }>('/api/admin/audit-logs').then((res) => setLogs(res.logs)).catch(() => {});
  }, []);

  return (
    <AdminShell title="Audit Logs">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-panel text-left text-muted">
            <tr>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Target user</th>
              <th className="px-3 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-3 py-2">{l.admin_email}</td>
                <td className="px-3 py-2">{l.action_type}</td>
                <td className="px-3 py-2">{l.asset_symbol || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{l.amount ? parseFloat(l.amount).toLocaleString() : '—'}</td>
                <td className="px-3 py-2 text-xs text-muted">{l.target_user_id || '—'}</td>
                <td className="px-3 py-2 text-xs text-muted">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
