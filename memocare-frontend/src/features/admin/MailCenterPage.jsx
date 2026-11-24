import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Send, RefreshCw, ShieldCheck, Mail, Trash2 } from 'lucide-react';
import { mailService } from '../../api';
import { PageHeader, Card, Button, Badge, FormRow, LoadingState, EmptyState, ErrorState } from '../../components/ui/primitives';

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  { label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, secure: false },
  { label: 'Outlook', host: 'smtp.office365.com', port: 587, secure: false },
];

const emptyForm = {
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromName: 'MemoCare',
  fromEmail: '',
};

const ROLE_LABEL = {
  ADMIN: 'Management',
  HOSPITAL_STAFF: 'Hospital staff',
  FAMILY: 'Family',
  CARETAKER: 'Caretaker',
  MEDICAL_STORE: 'Medical store',
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function MailCenterPage() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['mail-settings'], queryFn: mailService.settings });
  const recipientsQuery = useQuery({ queryKey: ['mail-recipients'], queryFn: mailService.recipients });
  const historyQuery = useQuery({ queryKey: ['mail-history'], queryFn: mailService.history });

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { tone: 'success' | 'error', text }
  const [testing, setTesting] = useState(false);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [extraEmails, setExtraEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [deletingId, setDeletingId] = useState('');
  // Demo (in-app) mode hides the optional SMTP form until it is asked for.
  const [showSmtp, setShowSmtp] = useState(false);

  const settings = settingsQuery.data;
  const demoMode = Boolean(settings) && !settings.configured;

  useEffect(() => {
    if (settings?.configured) setShowSmtp(true);
  }, [settings?.configured]);

  useEffect(() => {
    if (!settings) return;
    setForm({
      host: settings.host || '',
      port: settings.port || 587,
      secure: Boolean(settings.secure),
      username: settings.username || '',
      password: '',
      fromName: settings.fromName || 'MemoCare',
      fromEmail: settings.fromEmail || '',
    });
  }, [settings]);

  const set = (key) => (e) => {
    const value = key === 'secure' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const recipients = useMemo(() => recipientsQuery.data || [], [recipientsQuery.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((u) =>
      `${u.firstName} ${u.lastName} ${u.email} ${u.role} ${u.medicalStore?.storeName || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [recipients, search]);

  // A medical-store account is known by its shop name; everyone else by name.
  const displayName = (u) => u?.medicalStore?.storeName || `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
  const nameByEmail = useMemo(() => {
    const map = new Map();
    recipients.forEach((u) => map.set(String(u.email).toLowerCase(), displayName(u)));
    return map;
  }, [recipients]);

  const toggleRecipient = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected((current) => {
      const next = new Set(current);
      filtered.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await mailService.saveSettings({ ...form, port: Number(form.port) });
      setSaveMsg(
        result?.verification?.ok
          ? { tone: 'success', text: 'SMTP settings saved and the server connected successfully.' }
          : {
              tone: 'error',
              text: `Settings saved, but the connection test failed: ${result?.verification?.error || 'unknown error'}`,
            }
      );
      qc.invalidateQueries({ queryKey: ['mail-settings'] });
      qc.invalidateQueries({ queryKey: ['mail-history'] });
    } catch (err) {
      setSaveMsg({ tone: 'error', text: err.message || 'Could not save the SMTP settings.' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setSaveMsg(null);
    try {
      const result = await mailService.testConnection({
        host: form.host,
        port: Number(form.port),
        secure: Boolean(form.secure),
        username: form.username,
        password: form.password,
      });
      setSaveMsg(
        result?.ok
          ? { tone: 'success', text: 'Connection successful — the SMTP server accepted these credentials.' }
          : { tone: 'error', text: `Connection failed: ${result?.error || 'unknown error'}` }
      );
    } catch (err) {
      setSaveMsg({ tone: 'error', text: err.message || 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    setSending(true);
    setSendResult(null);
    try {
      const result = await mailService.send({
        userIds: Array.from(selected),
        emails: extraEmails.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean),
        subject,
        message,
      });
      setSendResult(result);
      if (!result.failed) {
        setMessage('');
        setSelected(new Set());
        setExtraEmails('');
      }
      qc.invalidateQueries({ queryKey: ['mail-history'] });
      qc.invalidateQueries({ queryKey: ['mail-settings'] });
    } catch (err) {
      setSendResult({ total: 0, sent: 0, failed: 0, error: err.message || 'The message could not be sent.' });
    } finally {
      setSending(false);
    }
  };

  const preset = (p) => setForm((f) => ({ ...f, host: p.host, port: p.port, secure: p.secure }));

  // Remove a single row from the delivery history.
  const deleteHistoryRow = async (id) => {
    setDeletingId(id);
    try {
      await mailService.deleteSent(id);
      qc.invalidateQueries({ queryKey: ['mail-history'] });
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Mail Center" />

      {settingsQuery.isLoading && <LoadingState rows={3} />}
      {settingsQuery.isError && <ErrorState error={settingsQuery.error} onRetry={settingsQuery.refetch} />}

      {settings && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 }}>
            {(!demoMode || showSmtp) && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>SMTP account <span className="field-hint">(optional)</span></h3>
                <Button size="sm" variant="ghost" onClick={() => setForm(emptyForm)}>Reset fields</Button>
              </div>

              {saveMsg && (
                <div
                  className={`auth-banner ${saveMsg.tone === 'success' ? 'auth-banner-success' : 'auth-banner-error'}`}
                  style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  {saveMsg.tone === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                  <span>{saveMsg.text}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {PRESETS.map((p) => (
                  <Button key={p.label} type="button" size="sm" variant="secondary" onClick={() => preset(p)}>
                    {p.label}
                  </Button>
                ))}
              </div>

              <form onSubmit={saveSettings}>
                <FormRow label="SMTP host" hint="e.g. smtp.gmail.com, smtp-relay.brevo.com">
                  <input required value={form.host} onChange={set('host')} placeholder="smtp.gmail.com" />
                </FormRow>
                <div style={{ display: 'flex', gap: 10 }}>
                  <FormRow label="Port">
                    <input type="number" required min={1} max={65535} value={form.port} onChange={set('port')} />
                  </FormRow>
                  <FormRow label="Encryption">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, fontSize: 13.5 }}>
                      <input type="checkbox" checked={form.secure} onChange={set('secure')} /> Implicit TLS (port 465)
                    </label>
                  </FormRow>
                </div>
                <FormRow label="Username" hint="Usually the full email address of the sending account.">
                  <input value={form.username} onChange={set('username')} placeholder="you@example.com" autoComplete="off" />
                </FormRow>
                <FormRow
                  label="Password / app password / API key"
                  hint={settings.passwordSet && settings.source === 'database' ? 'A password is saved — leave blank to keep it.' : 'For Gmail use a 16-character app password, not your normal password.'}
                >
                  <input
                    type="password"
                    value={form.password}
                    onChange={set('password')}
                    placeholder={settings.passwordSet ? '•••••••• (saved)' : 'Required'}
                    autoComplete="new-password"
                  />
                </FormRow>
                <div style={{ display: 'flex', gap: 10 }}>
                  <FormRow label="Sender name">
                    <input value={form.fromName} onChange={set('fromName')} placeholder="MemoCare" />
                  </FormRow>
                  <FormRow label="Sender email" hint="Must be verified with the provider.">
                    <input type="email" required value={form.fromEmail} onChange={set('fromEmail')} placeholder="no-reply@yourdomain.com" />
                  </FormRow>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <Button type="submit" loading={saving}>Save SMTP settings</Button>
                  <Button type="button" variant="secondary" loading={testing} onClick={testConnection}>Test connection</Button>
                </div>
              </form>
            </Card>
            )}

            <Card>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>Send a message</h3>
              <p className="field-hint" style={{ marginTop: 0 }}>
                Choose one or more people below. Each recipient gets their own copy, stored in the database and visible on their <strong>Mail</strong> page the moment you send — no SMTP account needed.
              </p>
              <form onSubmit={sendMessage}>
                <FormRow label={`Recipients (${selected.size} selected)`}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search users by name, email or role…"
                      style={{ flex: 1 }}
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={selectAllFiltered}>
                      Select all
                    </Button>
                  </div>
                  <div
                    style={{
                      maxHeight: 210, overflowY: 'auto', border: '1px solid var(--line)',
                      borderRadius: 10, padding: 6, background: 'var(--paper-raised)',
                    }}
                  >
                    {recipientsQuery.isLoading && <div style={{ padding: 10 }}><LoadingState rows={2} /></div>}
                    {!recipientsQuery.isLoading && filtered.length === 0 && (
                      <div className="field-hint" style={{ padding: 10 }}>No users match that search.</div>
                    )}
                    {filtered.map((u) => (
                      <label
                        key={u.id}
                        style={{
                          display: 'flex', gap: 9, alignItems: 'center', padding: '7px 8px',
                          borderRadius: 8, cursor: 'pointer',
                          background: selected.has(u.id) ? 'var(--primary-tint)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleRecipient(u.id)}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>
                            {displayName(u)}
                          </span>
                          <span className="field-hint" style={{ fontSize: 12 }}>
                            {u.medicalStore?.storeName ? `${u.firstName} ${u.lastName} · ` : ''}
                            {u.email}
                          </span>
                        </span>
                        <Badge tone="info">{ROLE_LABEL[u.role] || u.role}</Badge>
                      </label>
                    ))}
                  </div>
                </FormRow>

                <FormRow label="Extra addresses" hint="Optional, comma-separated. Works for people without a MemoCare account.">
                  <input value={extraEmails} onChange={(e) => setExtraEmails(e.target.value)} placeholder="relative@example.com, carer@example.com" />
                </FormRow>
                <FormRow label="Subject">
                  <input required value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                </FormRow>
                <FormRow label="Message">
                  <textarea
                    required
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write the message that will arrive in their inbox…"
                  />
                </FormRow>
                <Button type="submit" loading={sending} disabled={!selected.size && !extraEmails.trim()}>
                  <Send size={15} /> Send email
                </Button>
              </form>

              {sendResult && (
                <div
                  className={`auth-banner ${sendResult.failed ? 'auth-banner-error' : 'auth-banner-success'}`}
                  style={{ marginTop: 14 }}
                >
                  {sendResult.error
                    ? sendResult.error
                    : `${sendResult.sent} of ${sendResult.total} message(s) delivered${
                        sendResult.results?.some((r) => r.delivery === 'inbox') ? ' to in-app Mail' : ''
                      }${sendResult.failed ? `, ${sendResult.failed} failed.` : ' — sign in as the recipient and open Mail to read it.'}`}
                  {!!sendResult.results?.filter((r) => r.status === 'failed').length && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      {sendResult.results.filter((r) => r.status === 'failed').map((r) => (
                        <li key={r.to}><strong>{r.to}</strong>: {r.error}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          </div>

          {demoMode && !showSmtp && (
            <div style={{ marginBottom: 20 }}>
              <Button variant="secondary" onClick={() => setShowSmtp(true)}>
                <ShieldCheck size={15} /> Connect real email (SMTP) — optional
              </Button>
            </div>
          )}

          <Card style={{ padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Delivery history</h3>
                <p className="field-hint" style={{ margin: '4px 0 0' }}>Every delivery, newest first — emailed, in-app only, or failed.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => historyQuery.refetch()} loading={historyQuery.isFetching}>
                <RefreshCw size={13} /> Refresh
              </Button>
            </div>
            {historyQuery.isLoading && <div style={{ padding: 20 }}><LoadingState rows={4} /></div>}
            {historyQuery.isError && <div style={{ padding: 20 }}><ErrorState error={historyQuery.error} onRetry={historyQuery.refetch} /></div>}
            {historyQuery.data?.length === 0 && (
              <div style={{ padding: 20 }}>
                <EmptyState icon={<Mail size={26} />} title="Nothing sent yet" description="Send a message above — it appears in the recipient's Mail page immediately." />
              </div>
            )}
            {historyQuery.data?.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr><th>When</th><th>To</th><th>Subject</th><th>Type</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {historyQuery.data.map((row) => (
                    <tr key={row.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(row.createdAt)}</td>
                      <td>
                        {nameByEmail.get(String(row.toEmail).toLowerCase()) ? (
                          <>
                            <div>{nameByEmail.get(String(row.toEmail).toLowerCase())}</div>
                            <div className="field-hint" style={{ fontSize: 12 }}>{row.toEmail}</div>
                          </>
                        ) : (
                          row.toEmail
                        )}
                      </td>
                      <td>
                        {row.subject}
                        {row.error && <div className="field-hint" style={{ color: 'var(--danger)' }}>{row.error}</div>}
                      </td>
                      <td><span className="field-hint">{row.tag || '—'}</span></td>
                      <td>
                        <Badge tone={row.status === 'SENT' ? 'success' : row.status === 'INBOX' ? 'info' : 'danger'}>
                          {row.status === 'SENT' ? 'Emailed' : row.status === 'INBOX' ? 'In-app' : 'Failed'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => deleteHistoryRow(row.id)}
                          disabled={deletingId === row.id}
                          aria-label={`Delete delivery record for ${row.toEmail}`}
                          title="Delete this delivery record"
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
