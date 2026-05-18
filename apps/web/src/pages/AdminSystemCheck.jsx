
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/Header.jsx';
import apiServerClient from '@/lib/apiServerClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, ShieldAlert, CheckCircle2, XCircle, Database } from 'lucide-react';
import { format } from 'date-fns';
import ErrorAlert from '@/components/ErrorAlert.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';

const AdminSystemCheck = () => {
  const { createUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [testLoginEmail, setTestLoginEmail] = useState('test@eduscho.at');
  const [testLoginPassword, setTestLoginPassword] = useState('');
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);
  
  const [showAuthLogs, setShowAuthLogs] = useState(false);
  const [showEmailLogs, setShowEmailLogs] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await apiServerClient.fetch('/admin/system-check');
      if (res.ok) {
        setStats(await res.json());
      } else {
        const errorData = await res.json();
        setErrorMsg(errorData.error || errorData.message || 'System-Check fehlgeschlagen.');
      }
    } catch (err) {
      setErrorMsg('Verbindung zum Server konnte nicht hergestellt werden.');
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSendTestEmail = async () => {
    clearMessages();
    if (!testEmail) return setErrorMsg('E-Mail erforderlich');
    setIsSendingTest(true);
    try {
      const res = await apiServerClient.fetch('/admin/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Fehler beim Senden');
      setSuccessMsg(data.message || 'Test-E-Mail wurde versendet.');
      setTestEmail('');
      fetchStats();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleCreateTestUser = async () => {
    clearMessages();
    if (!testLoginEmail || !testLoginPassword) {
      setErrorMsg('Bitte E-Mail-Adresse und Passwort eingeben.');
      return;
    }
    setIsCreatingTest(true);
    const result = await createUser({
      email: testLoginEmail,
      firstName: 'Test',
      lastName: 'User',
      password: testLoginPassword,
      passwordConfirm: testLoginPassword,
      status: 'active',
      isAdmin: false
    });
    if (!result.success) {
      setErrorMsg(result.error);
    } else {
      setSuccessMsg('Test-User erfolgreich erstellt.');
      fetchStats();
    }
    setIsCreatingTest(false);
  };

  const handleTestLogin = async () => {
    clearMessages();
    if (!testLoginEmail || !testLoginPassword) {
      setErrorMsg('Bitte E-Mail-Adresse und Passwort eingeben.');
      return;
    }

    setIsCheckingLogin(true);
    try {
      const res = await apiServerClient.fetch('/admin/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testLoginEmail, password: testLoginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Test-Login konnte nicht geprüft werden.');
      setSuccessMsg(data.passed ? 'Test-Login erfolgreich.' : 'Test-Login fehlgeschlagen.');
      fetchStats();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsCheckingLogin(false);
    }
  };

  const handleResendActivation = async () => {
    clearMessages();
    if (!resendEmail) return setErrorMsg('E-Mail erforderlich');
    setIsResending(true);
    try {
      const res = await apiServerClient.fetch('/admin/resend-activation-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Fehler beim Senden');
      setSuccessMsg('Aktivierungslink versendet');
      setResendEmail('');
      fetchStats();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsResending(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-[calc(100vh-4rem)] bg-background flex items-center justify-center">
          <div className="text-foreground text-lg">System Check wird geladen...</div>
        </div>
      </>
    );
  }

  const StatusIcon = ({ status }) => status ? 
    <CheckCircle2 className="h-5 w-5 text-success inline-block mr-2" /> : 
    <XCircle className="h-5 w-5 text-destructive inline-block mr-2" />;

  return (
    <>
      <Helmet>
        <title>System-Check - Tchibo Benefit-Bar</title>
      </Helmet>

      <Header />

      <div className="min-h-[calc(100vh-4rem)] bg-background py-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 mb-8">
            <Server className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">System-Check</h1>
          </div>

          <ErrorAlert message={errorMsg} onDismiss={() => setErrorMsg(null)} />
          {successMsg && (
            <div className="flex items-start gap-3 p-4 bg-success/10 text-success border border-success/20 rounded-xl mb-6 shadow-sm">
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="flex-1 text-sm font-medium leading-relaxed">{successMsg}</div>
            </div>
          )}

          {stats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              
              <div className="bg-card border border-border shadow-sm rounded-2xl p-6">
                <h2 className="text-xl font-semibold text-card-foreground mb-6">Status-Checks</h2>
                <div className="space-y-4 text-sm font-medium">
                  <div className="flex justify-between items-center p-3 bg-background border border-border rounded-lg">
                    <span className="text-muted-foreground flex items-center gap-2"><Database className="h-4 w-4"/> Datenbank erreichbar</span>
                    <span><StatusIcon status={stats.databaseConnected} /></span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-background border border-border rounded-lg">
                    <span className="text-muted-foreground flex items-center gap-2"><ShieldAlert className="h-4 w-4"/> Auth-System aktiv</span>
                    <span><StatusIcon status={stats.authSystemActive} /></span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-background border border-border rounded-lg">
                    <span className="text-muted-foreground flex items-center gap-2"><Mail className="h-4 w-4"/> E-Mail-Service konfiguriert</span>
                    <span><StatusIcon status={stats.emailServiceConfigured} /></span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'].map((key) => (
                      <div key={key} className="flex justify-between items-center p-2 bg-background border border-border rounded">
                        <span className="text-muted-foreground">{key} vorhanden</span>
                        <StatusIcon status={Boolean(stats.smtp?.[key])} />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center p-3 bg-background border border-border rounded-lg">
                    <span className="text-muted-foreground flex items-center gap-2"><ShieldAlert className="h-4 w-4"/> Auth-Modus</span>
                    <span className="text-foreground">E-Mail und Passwort</span>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-card-foreground mt-8 mb-4">Nutzer-Statistiken</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 bg-muted/40 rounded-xl border border-border">
                    <p className="text-3xl font-bold text-foreground mb-1">{stats.activeUserCount}</p>
                    <p className="text-xs text-muted-foreground">Aktive User</p>
                  </div>
                  <div className="p-4 bg-muted/40 rounded-xl border border-border">
                    <p className="text-3xl font-bold text-foreground mb-1">{stats.usersWithPassword}</p>
                    <p className="text-xs text-muted-foreground">Mit Passwort</p>
                  </div>
                  <div className="p-4 bg-muted/40 rounded-xl border border-border">
                    <p className="text-3xl font-bold text-foreground mb-1">{stats.usersWithoutPassword}</p>
                    <p className="text-xs text-muted-foreground">Ohne passwordHash</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border shadow-sm rounded-2xl p-6">
                <h2 className="text-xl font-semibold text-card-foreground mb-6">Admin Aktionen</h2>
                
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground">Test-E-Mail senden</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="test@eduscho.at" 
                        value={testEmail} 
                        onChange={e => setTestEmail(e.target.value)} 
                        className="bg-background"
                      />
                      <Button onClick={handleSendTestEmail} disabled={isSendingTest} className="shrink-0 bg-primary hover:bg-primary/90">
                        {isSendingTest ? 'Senden...' : 'Senden'}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-border">
                    <label className="text-sm font-medium text-foreground">Aktivierungslink erneut senden</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="user@eduscho.at" 
                        value={resendEmail} 
                        onChange={e => setResendEmail(e.target.value)} 
                        className="bg-background"
                      />
                      <Button onClick={handleResendActivation} disabled={isResending} className="shrink-0 bg-primary hover:bg-primary/90">
                        {isResending ? 'Senden...' : 'Senden'}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border space-y-4">
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-foreground">Test-User / Test-Login</label>
                      <Input
                        placeholder="test@eduscho.at"
                        value={testLoginEmail}
                        onChange={e => setTestLoginEmail(e.target.value)}
                        className="bg-background"
                      />
                      <Input
                        type="password"
                        placeholder="Passwort"
                        value={testLoginPassword}
                        onChange={e => setTestLoginPassword(e.target.value)}
                        className="bg-background"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button onClick={handleCreateTestUser} disabled={isCreatingTest} variant="outline" className="w-full text-foreground border-border hover:bg-muted">
                          {isCreatingTest ? 'Wird erstellt...' : 'Test-User erstellen'}
                        </Button>
                        <Button onClick={handleTestLogin} disabled={isCheckingLogin} variant="outline" className="w-full text-foreground border-border hover:bg-muted">
                          {isCheckingLogin ? 'Wird geprüft...' : 'Test-Login prüfen'}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Button onClick={() => setShowAuthLogs(!showAuthLogs)} variant="secondary" className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80">
                        Auth-Logs {showAuthLogs ? 'ausblenden' : 'anzeigen'}
                      </Button>
                      <Button onClick={() => setShowEmailLogs(!showEmailLogs)} variant="secondary" className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80">
                        E-Mail-Logs {showEmailLogs ? 'ausblenden' : 'anzeigen'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {showAuthLogs && stats?.recentLoginErrors && (
            <div className="bg-card border border-border shadow-sm rounded-2xl p-6 mb-8 animate-in fade-in slide-in-from-top-4">
              <h2 className="text-xl font-semibold text-card-foreground mb-4">Letzte 10 Login Fehler (authLog)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-3 px-4 font-medium">Zeit</th>
                      <th className="py-3 px-4 font-medium">E-Mail</th>
                      <th className="py-3 px-4 font-medium">Code</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    {stats.recentLoginErrors.map((log, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{format(new Date(log.timestamp), 'dd.MM.yyyy HH:mm')}</td>
                        <td className="py-3 px-4">{log.email}</td>
                        <td className="py-3 px-4 font-mono text-destructive bg-destructive/10 px-2 py-1 rounded inline-block my-2 ml-4">{log.errorCode || 'unknown'}</td>
                      </tr>
                    ))}
                    {stats.recentLoginErrors.length === 0 && (
                      <tr><td colSpan="3" className="py-6 text-center text-muted-foreground">Keine Fehler gefunden.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showEmailLogs && stats?.recentEmailErrors && (
            <div className="bg-card border border-border shadow-sm rounded-2xl p-6 animate-in fade-in slide-in-from-top-4">
              <h2 className="text-xl font-semibold text-card-foreground mb-4">Letzte 10 E-Mail Fehler (emailLog)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-3 px-4 font-medium">Zeit</th>
                      <th className="py-3 px-4 font-medium">Empfänger</th>
                      <th className="py-3 px-4 font-medium">Fehlermeldung</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    {stats.recentEmailErrors.map((log, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{format(new Date(log.sentAt), 'dd.MM.yyyy HH:mm')}</td>
                        <td className="py-3 px-4">{log.recipient}</td>
                        <td className="py-3 px-4 text-destructive">{log.errorMessage || 'Unbekannt'}</td>
                      </tr>
                    ))}
                    {stats.recentEmailErrors.length === 0 && (
                      <tr><td colSpan="3" className="py-6 text-center text-muted-foreground">Keine Fehler gefunden.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default AdminSystemCheck;
