import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext.jsx';
import Header from '@/components/Header.jsx';
import ErrorAlert from '@/components/ErrorAlert.jsx';
import { CheckCircle2 } from 'lucide-react';
import { validateAllowedLoginEmail } from '@/lib/emailAccess';

const neutralResetMessage = 'Falls für diese Adresse ein aktiver Zugang besteht, wurde eine E-Mail zum Zurücksetzen des Passworts versendet.';

const ForgotPasswordPage = () => {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const emailError = validateAllowedLoginEmail(email);
    if (emailError) {
      setErrorMsg(emailError);
      return;
    }

    setIsLoading(true);
    const result = await forgotPassword(email);

    if (!result.success) {
      setErrorMsg(result.error || 'Die Anfrage konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.');
    } else {
      setSuccessMsg(result.message || neutralResetMessage);
    }
    setIsLoading(false);
  };

  return (
    <>
      <Helmet>
        <title>Passwort vergessen - Tchibo BenefitBar</title>
      </Helmet>

      <Header />

      <div className="min-h-[calc(100vh-4rem)] bg-background flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="bg-card rounded-lg p-8 shadow-lg border border-border">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">Passwort zurücksetzen</h1>
              {!successMsg && (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Gib deine E-Mail-Adresse ein. Falls ein aktiver Zugang besteht, erhältst du einen Reset-Link.
                </p>
              )}
            </div>

            <ErrorAlert message={errorMsg} onDismiss={() => setErrorMsg(null)} />

            {successMsg ? (
              <div className="text-center space-y-6">
                <div className="flex items-start gap-3 p-4 bg-success/10 text-success border border-success/20 rounded-lg shadow-sm text-left">
                  <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm font-medium leading-relaxed">{successMsg}</div>
                </div>
                <Link to="/login" className="inline-block w-full">
                  <Button variant="outline" className="w-full border-border text-foreground hover:bg-muted">
                    Zurück zur Anmeldung
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRequestReset} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">E-Mail Adresse</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="name@eduscho.at"
                    className="bg-background text-foreground border-border focus:border-primary transition-all"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  {isLoading ? 'E-Mail wird versendet …' : 'Passwort zurücksetzen'}
                </Button>

                <div className="text-center mt-6">
                  <Link to="/login" className="text-sm font-medium text-primary hover:underline">
                    Zurück zur Anmeldung
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordPage;
