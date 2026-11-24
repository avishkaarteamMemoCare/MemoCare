import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, RefreshCw, UserPlus, UsersRound } from 'lucide-react';
import { adminService } from '../../api';
import { PageHeader, Card, Button, Badge, FormRow, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

const STATUSES = ['', 'ACTIVE', 'SUSPENDED', 'PENDING'];

// The Users tab is the roster of doctors under this management account.
const STAFF_TITLES = [{ value: 'DOCTOR', label: 'Doctor' }];

export default function UsersAdminPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rotatingId, setRotatingId] = useState(null);
  const [copied, setCopied] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-users', status],
    queryFn: () => adminService.listUsers({ status: status || undefined }),
  });
  const hospitalsQuery = useQuery({ queryKey: ['admin-hospitals'], queryFn: adminService.listHospitals });
  const hospitals = hospitalsQuery.data || [];

  const act = async (fn, userId) => {
    setBusyId(userId);
    try {
      await fn(userId);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } finally {
      setBusyId(null);
    }
  };

  const rotate = async (hospitalId) => {
    setRotatingId(hospitalId);
    try {
      await adminService.rotateInviteCode(hospitalId);
      qc.invalidateQueries({ queryKey: ['admin-hospitals'] });
    } finally {
      setRotatingId(null);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="The doctors under your management account, plus their access codes. Family members, caretakers and medical stores are not listed here."
        actions={<Button onClick={() => setShowCreate(true)}><UserPlus size={15} /> Add doctor login</Button>}
      />

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <KeyRound size={17} />
          <h3 style={{ margin: 0 }}>Staff access codes</h3>
        </div>
        <p className="field-hint" style={{ marginTop: 0 }}>
          A doctor or nurse can <strong>create their own account</strong> at the sign-up page by choosing “Hospital Staff”
          and entering one of these invite codes. The account then appears in <strong>Staff approvals</strong> for you to
          approve. Alternatively use <strong>Add staff login</strong> above to create an already-active account instantly.
        </p>
        {hospitalsQuery.isLoading && <LoadingState rows={2} />}
        {hospitalsQuery.isError && <ErrorState error={hospitalsQuery.error} onRetry={hospitalsQuery.refetch} />}
        {!hospitalsQuery.isLoading && hospitals.length === 0 && (
          <EmptyState title="No hospital yet" description="Create a hospital under Hospital management first." />
        )}
        {hospitals.map((h) => (
          <div className="list-row" key={h.id} style={{ padding: '12px 0' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{h.name}</div>
              <div className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Invite code: <code style={{ fontSize: 13 }}>{h.inviteCode}</code>
                <button
                  type="button"
                  onClick={() => copyCode(h.inviteCode)}
                  className="icon-btn"
                  style={{ width: 22, height: 22 }}
                  aria-label="Copy invite code"
                  title="Copy invite code"
                >
                  <Copy size={12} />
                </button>
                {copied === h.inviteCode && <span style={{ color: 'var(--success, #1e7a45)' }}>Copied</span>}
              </div>
            </div>
            <Button size="sm" variant="secondary" loading={rotatingId === h.id} onClick={() => rotate(h.id)}>
              <RefreshCw size={13} /> New code
            </Button>
          </div>
        ))}
      </Card>

      <div className="table-toolbar" style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', background: 'var(--paper-raised)' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)' }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      <Card style={{ padding: 0, borderRadius: '0 0 var(--radius-md) var(--radius-md)', borderTop: 'none' }}>
        {isLoading && <div style={{ padding: 20 }}><LoadingState rows={4} /></div>}
        {isError && <div style={{ padding: 20 }}><ErrorState error={error} onRetry={refetch} /></div>}
        {data?.length === 0 && <div style={{ padding: 20 }}><EmptyState icon={<UsersRound size={26} />} title="No doctors yet" description="Add a doctor login above, or share a staff access code." /></div>}
        {data?.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>
                    <Badge tone="info">{u.staffTitle === 'DOCTOR' ? 'Doctor' : u.staffTitle?.replaceAll('_', ' ') || u.role}</Badge>
                  </td>
                  <td><Badge tone={u.status === 'SUSPENDED' ? 'danger' : 'success'}>{u.status}</Badge></td>
                  <td style={{ textAlign: 'right' }}>
                    {u.role !== 'HOSPITAL_STAFF' ? (
                      <span className="field-hint">No suspend access</span>
                    ) : u.status === 'SUSPENDED' ? (
                      <Button size="sm" variant="secondary" loading={busyId === u.id} onClick={() => act(adminService.reactivateUser, u.id)}>Reactivate</Button>
                    ) : (
                      <Button size="sm" variant="danger" loading={busyId === u.id} onClick={() => act(adminService.suspendUser, u.id)}>Suspend</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showCreate && (
        <CreateStaffModal
          hospitals={hospitals}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['admin-users'] })}
        />
      )}
    </div>
  );
}

function CreateStaffModal({ hospitals, onClose, onCreated }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    staffTitle: 'DOCTOR',
    hospitalId: hospitals[0]?.id || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await adminService.createStaff({ ...form, hospitalId: form.hospitalId || undefined });
      setCreated({ ...result, password: form.password });
      onCreated?.();
    } catch (err) {
      setError(err.message || 'Could not create the staff account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Add doctor login</h3>

        {created ? (
          <>
            <div className="auth-banner auth-banner-success">
              <strong>{created.user.firstName} {created.user.lastName}</strong> can sign in immediately at <code>/login</code>.
              {created.emailSent
                ? ' A welcome email with these details was sent.'
                : ` No email was sent${created.emailError ? ` (${created.emailError})` : ''} — share these credentials securely.`}
            </div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, margin: '6px 0 16px', fontSize: 13.5, lineHeight: 1.8 }}>
              <div><strong>Email:</strong> {created.user.email}</div>
              <div><strong>Password:</strong> {created.password}</div>
              <div><strong>Role:</strong> {created.user.staffTitle?.replaceAll('_', ' ').toLowerCase()}</div>
              <div><strong>Hospital:</strong> {created.hospitalName}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        ) : (
          <>
            {error && <div className="auth-banner auth-banner-error">{error}</div>}
            <form onSubmit={submit}>
              <div style={{ display: 'flex', gap: 10 }}>
                <FormRow label="First name"><input required value={form.firstName} onChange={set('firstName')} /></FormRow>
                <FormRow label="Last name"><input required value={form.lastName} onChange={set('lastName')} /></FormRow>
              </div>
              <FormRow label="Email"><input type="email" required value={form.email} onChange={set('email')} placeholder="doctor@example.com" /></FormRow>
              <FormRow label="Temporary password" hint="At least 8 characters. Share it with the staff member.">
                <input type="text" required minLength={8} value={form.password} onChange={set('password')} placeholder="e.g. MemoCare-2026" />
              </FormRow>
              <div style={{ display: 'flex', gap: 10 }}>
                <FormRow label="Profession">
                  <select value={form.staffTitle} onChange={set('staffTitle')} style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)' }}>
                    {STAFF_TITLES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Hospital">
                  <select value={form.hospitalId} onChange={set('hospitalId')} style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line)' }}>
                    {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </FormRow>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" loading={loading}><Plus size={14} /> Create login</Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
