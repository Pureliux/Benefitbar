
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import Header from '@/components/Header.jsx';
import apiServerClient from '@/lib/apiServerClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Server, CheckCircle2, ShieldAlert, KeyRound, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import ErrorAlert from '@/components/ErrorAlert.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';

const AdminDashboard = () => {
  const { createUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [newUser, setNewUser] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    status: 'active',
    isAdmin: false
  });
  const [isCreating, setIsCreating] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const res = await apiServerClient.fetch('/admin/users');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Fehler beim Laden der Admin-Daten.');
      }
      setEmployees(data.users || []);
    } catch (err) {
      setErrorMsg(err.message || 'Fehler beim Laden der Admin-Daten.');
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const closeEmployeeDialog = () => {
    setSelectedEmployee(null);
    setEditPassword('');
    setEditPasswordConfirm('');
  };

  const validatePassword = (password, confirmPassword) => {
    if (!password || !confirmPassword) {
      return 'Passwort fehlt.';
    }
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return 'Passwort erfüllt nicht die Anforderungen (min. 10 Zeichen, Großbuchstabe, Kleinbuchstabe, Zahl).';
    }
    if (password !== confirmPassword) {
      return 'Passwörter stimmen nicht überein.';
    }
    return null;
  };

  const validateUserForm = () => {
    if (!newUser.password || !newUser.confirmPassword) {
      return 'Passwort fehlt.';
    }
    if (!newUser.email || !newUser.firstName || !newUser.lastName) {
      return 'Bitte alle Pflichtfelder ausfüllen.';
    }
    if (!newUser.email.toLowerCase().endsWith('@eduscho.at')) {
      return 'E-Mail-Adresse ist ungültig.';
    }
    return validatePassword(newUser.password, newUser.confirmPassword);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    clearMessages();

    const validationError = validateUserForm();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsCreating(true);
    const result = await createUser(newUser);
    
    if (!result.success) {
      setErrorMsg(result.error);
    } else {
      setSuccessMsg('User wurde erstellt und kann sich jetzt einloggen.');
      setNewUser({ email: '', firstName: '', lastName: '', password: '', confirmPassword: '', status: 'active', isAdmin: false });
      fetchAllData();
    }
    setIsCreating(false);
  };

  const handleUpdatePassword = async () => {
    clearMessages();
    if (!selectedEmployee) return;

    const validationError = validatePassword(editPassword, editPasswordConfirm);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await apiServerClient.fetch('/admin/update-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedEmployee.id,
          password: editPassword,
          passwordConfirm: editPasswordConfirm,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Passwort konnte nicht geändert werden.');
      }
      setSuccessMsg(data.message || 'Passwort wurde geändert.');
      setEditPassword('');
      setEditPasswordConfirm('');
      await fetchAllData();
    } catch (err) {
      setErrorMsg(err.message || 'Passwort konnte nicht geändert werden.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    clearMessages();
    if (!selectedEmployee) return;
    const confirmed = window.confirm(`User ${selectedEmployee.email} wirklich löschen?`);
    if (!confirmed) return;

    setIsDeletingUser(true);
    try {
      const res = await apiServerClient.fetch('/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedEmployee.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'User konnte nicht gelöscht werden.');
      }
      setSuccessMsg(data.message || 'User wurde gelöscht.');
      closeEmployeeDialog();
      await fetchAllData();
    } catch (err) {
      setErrorMsg(err.message || 'User konnte nicht gelöscht werden.');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.firstName && emp.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (emp.lastName && emp.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <>
        <Header />
        <div className="benefit-ambient-bg flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <div className="text-lg text-foreground">Lädt …</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Admin-Bereich - Tchibo Benefit-Bar</title>
      </Helmet>

      <Header />

      <div className="benefit-ambient-bg min-h-[calc(100vh-4rem)] py-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <h1 className="text-4xl font-bold text-foreground">Admin-Bereich</h1>
            <Link to="/admin/system-check">
              <Button variant="outline" className="bg-background text-foreground border-border hover:bg-muted flex items-center gap-2">
                <Server className="h-4 w-4" /> System-Check
              </Button>
            </Link>
          </div>

          <ErrorAlert message={errorMsg} onDismiss={() => setErrorMsg(null)} />
          {successMsg && (
            <div className="flex items-start gap-3 p-4 bg-success/10 text-success border border-success/20 rounded-xl mb-6 shadow-sm">
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="flex-1 text-sm font-medium leading-relaxed">{successMsg}</div>
            </div>
          )}

          <Tabs defaultValue="users" className="w-full">
            <div className="overflow-x-auto pb-2 mb-6">
              <TabsList className="inline-flex w-max bg-muted p-1 rounded-xl">
                <TabsTrigger value="users" className="flex items-center gap-2 rounded-lg">
                  <Users className="h-4 w-4" />
                  Benutzerverwaltung
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="users">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                <div className="lg:col-span-2 bg-card border border-border shadow-sm rounded-2xl p-6 transition-colors duration-200">
                  <div className="mb-6 flex justify-between items-center flex-wrap gap-4">
                    <h2 className="text-xl font-semibold text-card-foreground">Mitarbeitende</h2>
                    <Input
                      placeholder="Suche …"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="max-w-xs bg-background text-foreground border-border focus:border-primary"
                    />
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted text-muted-foreground border-b border-border">
                          <th className="py-3 px-4 font-semibold">Name & E-Mail</th>
                          <th className="py-3 px-4 font-semibold">Status / Auth</th>
                          <th className="py-3 px-4 font-semibold">Details</th>
                          <th className="py-3 px-4 font-semibold">Aktion</th>
                        </tr>
                      </thead>
                      <tbody className="bg-card text-card-foreground">
                        {filteredEmployees.map((emp) => (
                          <tr
                            key={emp.id}
                            onClick={() => {
                              clearMessages();
                              setSelectedEmployee(emp);
                              setEditPassword('');
                              setEditPasswordConfirm('');
                            }}
                            className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-muted/40"
                          >
                            <td className="py-4 px-4">
                              <div className="font-medium text-foreground flex items-center gap-2">
                                {emp.firstName} {emp.lastName} 
                                {emp.isAdmin && <ShieldAlert className="h-3 w-3 text-primary" aria-label="Admin" />}
                              </div>
                              <div className="text-muted-foreground mt-1">{emp.email}</div>
                            </td>
                            <td className="py-4 px-4 space-y-1">
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider inline-block ${
                                  emp.status === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'
                                }`}>
                                  {emp.status}
                                </span>
                              </div>
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider inline-block ${
                                  emp.authStatus === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'
                                }`}>
                                  Auth: {emp.authStatus || 'not_invited'}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-xs space-y-1 text-muted-foreground">
                              <div><span className="font-medium text-foreground">PW gesetzt:</span> {emp.passwordSet ? 'Ja' : 'Nein'}</div>
                              <div><span className="font-medium text-foreground">Methode:</span> {emp.loginMethod || '-'}</div>
                              <div><span className="font-medium text-foreground">Letzter Login:</span> {emp.lastLoginAt ? format(new Date(emp.lastLoginAt), 'dd.MM.yyyy HH:mm') : 'nie'}</div>
                              <div><span className="font-medium text-foreground">Admin:</span> {emp.isAdmin ? 'Ja' : 'Nein'}</div>
                            </td>
                            <td className="py-4 px-4">
                              <Button type="button" variant="outline" size="sm" className="text-foreground">
                                Bearbeiten
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {filteredEmployees.length === 0 && (
                          <tr><td colSpan="4" className="py-6 text-center text-muted-foreground">Keine Mitarbeitenden gefunden.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-card border border-border shadow-sm rounded-2xl p-6 transition-colors duration-200 h-fit">
                  <h2 className="text-xl font-semibold text-card-foreground mb-6">Neuen User erstellen</h2>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Vorname *</label>
                        <Input 
                          value={newUser.firstName} 
                          onChange={e => { setNewUser({...newUser, firstName: e.target.value}); clearMessages(); }} 
                          className="bg-background transition-colors focus:border-primary" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Nachname *</label>
                        <Input 
                          value={newUser.lastName} 
                          onChange={e => { setNewUser({...newUser, lastName: e.target.value}); clearMessages(); }} 
                          className="bg-background transition-colors focus:border-primary" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">E-Mail * (@eduscho.at)</label>
                      <Input 
                        type="email" 
                        value={newUser.email} 
                        onChange={e => { setNewUser({...newUser, email: e.target.value}); clearMessages(); }} 
                        className="bg-background transition-colors focus:border-primary" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Passwort *</label>
                      <Input 
                        type="password" 
                        value={newUser.password} 
                        onChange={e => { setNewUser({...newUser, password: e.target.value}); clearMessages(); }} 
                        className="bg-background transition-colors focus:border-primary" 
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Min. 10 Zeichen, 1 Großbuchstabe, 1 Kleinbuchstabe, 1 Zahl</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Passwort bestätigen *</label>
                      <Input 
                        type="password" 
                        value={newUser.confirmPassword} 
                        onChange={e => { setNewUser({...newUser, confirmPassword: e.target.value}); clearMessages(); }} 
                        className="bg-background transition-colors focus:border-primary" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">Status</label>
                      <Select 
                        value={newUser.status} 
                        onValueChange={(val) => setNewUser({...newUser, status: val})}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Status wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Aktiv</SelectItem>
                          <SelectItem value="inactive">Inaktiv</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 mt-4 bg-muted/40 p-3 rounded-lg border border-border">
                      <Checkbox 
                        id="isAdmin" 
                        checked={newUser.isAdmin} 
                        onCheckedChange={(checked) => setNewUser({...newUser, isAdmin: checked})} 
                      />
                      <label htmlFor="isAdmin" className="text-sm font-medium cursor-pointer text-foreground">Admin-Rechte vergeben</label>
                    </div>
                    <Button 
                      type="submit" 
                      disabled={isCreating} 
                      className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-[0.98]"
                    >
                      {isCreating ? 'Wird erstellt …' : 'User erstellen'}
                    </Button>
                  </form>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={Boolean(selectedEmployee)} onOpenChange={(open) => { if (!open) closeEmployeeDialog(); }}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>User bearbeiten</DialogTitle>
            <DialogDescription>
              {selectedEmployee ? `${selectedEmployee.firstName || ''} ${selectedEmployee.lastName || ''}`.trim() || selectedEmployee.email : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedEmployee && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div className="font-semibold text-foreground">{selectedEmployee.email}</div>
                <div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
                  <div>Status: {selectedEmployee.status || '-'}</div>
                  <div>Auth: {selectedEmployee.authStatus || '-'}</div>
                  <div>Passwort gesetzt: {selectedEmployee.passwordSet ? 'Ja' : 'Nein'}</div>
                  <div>Admin: {selectedEmployee.isAdmin ? 'Ja' : 'Nein'}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Passwort ändern
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="password"
                    placeholder="Neues Passwort"
                    value={editPassword}
                    onChange={(event) => { setEditPassword(event.target.value); clearMessages(); }}
                    className="bg-background"
                  />
                  <Input
                    type="password"
                    placeholder="Passwort bestätigen"
                    value={editPasswordConfirm}
                    onChange={(event) => { setEditPasswordConfirm(event.target.value); clearMessages(); }}
                    className="bg-background"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Mindestens 10 Zeichen, ein Großbuchstabe, ein Kleinbuchstabe und eine Zahl.</p>
                <Button onClick={handleUpdatePassword} disabled={isUpdatingPassword} className="w-full sm:w-auto">
                  {isUpdatingPassword ? 'Passwort wird geändert …' : 'Passwort speichern'}
                </Button>
              </div>

              <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="mt-0.5 h-4 w-4 text-destructive" />
                  <div className="flex-1">
                    <p className="font-semibold text-destructive">User löschen</p>
                    <p className="mt-1 text-sm text-muted-foreground">Der Zugang wird aus der Benutzerliste entfernt. Diese Aktion kann nicht rückgängig gemacht werden.</p>
                  </div>
                </div>
                <Button onClick={handleDeleteUser} disabled={isDeletingUser} variant="destructive" className="mt-4">
                  {isDeletingUser ? 'User wird gelöscht …' : 'User löschen'}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEmployeeDialog}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminDashboard;
