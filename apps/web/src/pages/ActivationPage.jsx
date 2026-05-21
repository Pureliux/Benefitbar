import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle } from 'lucide-react';
import Header from '@/components/Header.jsx';
import ErrorAlert from '@/components/ErrorAlert.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';

const invalidActivationMessage = 'Aktivierungslink ist ungültig oder abgelaufen. Bitte fordere einen neuen Zugang an.';

const ActivationPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { validateToken, activateAccount } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const hasMinLength = password.length >= 10;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const allRequirementsMet = hasMinLength && hasUppercase && hasLowercase && hasNumber;
  const passwordsMatch = password === confirmPassword && password.length > 0;

  useEffect(() => {
    const checkToken = async () => {
      if (!token) {
        setErrorMsg(invalidActivationMessage);
        setTokenValid(false);
        setIsValidating(false);
        return;
      }

      const result = await validateToken(token);
      if (!result.valid || result.type !== 'activation') {
        setErrorMsg(invalidActivationMessage);
        setTokenValid(false);
      } else {
        setTokenValid(true);
      }
      setIsValidating(false);
    };
    checkToken();
  }, [token, validateToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!allRequirementsMet) {
      setErrorMsg('Passwort erfüllt nicht die Anforderungen (min. 10 Zeichen, Großbuchstabe, Kleinbuchstabe, Zahl).');
      return;
    }

    if (!passwordsMatch) {
      setErrorMsg('Passwörter stimmen nicht überein.');
      return;
    }

    setIsLoading(true);
    const result = await activateAccount(token, password, confirmPassword);

    if (!result.success) {
      setErrorMsg(result.error);
    } else {
      setSuccessMsg(result.message || 'Passwort wurde gesetzt. Du kannst dich jetzt einloggen.');
      setPassword('');
      setConfirmPassword('');
    }
    setIsLoading(false);
  };

  const RequirementItem = ({ met, text }) => {
    const stateColor = met ? '#2E7D32' : '#D32F2F';

    return (
      <div className="flex items-center gap-2 text-sm transition-colors" style={{ color: stateColor }}>
        {met ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        <span>{text}</span>
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Account aktivieren - Tchibo Benefitbar</title>
      </Helmet>

      <Header />

      <div className="min-h-[calc(100vh-4rem)] bg-background flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="bg-card rounded-lg p-8 shadow-lg border border-border">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">Account aktivieren</h1>
              {tokenValid && !successMsg && (
                <p className="text-muted-foreground text-sm">
                  Bitte setze ein sicheres Passwort für deinen Zugang.
                </p>
              )}
            </div>

            {isValidating ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Link wird überprüft …
              </div>
            ) : (
              <>
                <ErrorAlert message={errorMsg} onDismiss={tokenValid ? () => setErrorMsg(null) : null} />

                {successMsg && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-success/10 text-success border border-success/20 rounded-lg shadow-sm">
                      <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                      <div className="flex-1 text-sm font-medium leading-relaxed">{successMsg}</div>
                    </div>
                    <Link to="/login" className="block">
                      <Button variant="outline" className="w-full border-border text-foreground hover:bg-muted">
                        Zur Anmeldung
                      </Button>
                    </Link>
                  </div>
                )}

                {tokenValid && !successMsg && (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Neues Passwort</label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        placeholder="Dein neues Passwort"
                        className="bg-background text-foreground border-border focus:border-primary transition-all"
                      />
                    </div>

                    <div className="bg-muted/40 p-4 rounded-lg border border-border space-y-3">
                      <RequirementItem met={hasMinLength} text="Mindestens 10 Zeichen" />
                      <RequirementItem met={hasUppercase} text="Mindestens ein Großbuchstabe" />
                      <RequirementItem met={hasLowercase} text="Mindestens ein Kleinbuchstabe" />
                      <RequirementItem met={hasNumber} text="Mindestens eine Zahl" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">Passwort wiederholen</label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        placeholder="Passwort bestätigen"
                        className="bg-background text-foreground border-border focus:border-primary transition-all"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading || !allRequirementsMet || !passwordsMatch}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium mt-4"
                    >
                      {isLoading ? 'Passwort wird gesetzt …' : 'Passwort setzen'}
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ActivationPage;
