import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header.jsx';
import ErrorAlert from '@/components/ErrorAlert.jsx';
import {
  Armchair,
  CheckCircle2,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  Salad,
  TrainFront,
} from 'lucide-react';

const accessSuccessMessage = 'Falls für diese E-Mail-Adresse ein aktiver Zugang besteht, wurde eine E-Mail mit weiteren Schritten versendet.';

const benefitCards = [
  { icon: HeartPulse, label: 'Gesundheit', className: 'left-8 top-20 -rotate-6 hidden xl:flex' },
  { icon: TrainFront, label: 'Mobilität', className: 'left-24 bottom-24 rotate-3 hidden lg:flex' },
  { icon: Dumbbell, label: 'Fitness', className: 'left-2 bottom-56 -rotate-3 hidden 2xl:flex' },
  { icon: GraduationCap, label: 'Weiterbildung', className: 'right-8 top-24 rotate-6 hidden xl:flex' },
  { icon: Armchair, label: 'Ergonomie', className: 'right-24 bottom-28 -rotate-4 hidden lg:flex' },
  { icon: Salad, label: 'Ernährung', className: 'right-2 bottom-60 rotate-3 hidden 2xl:flex' },
];

const LoginPage = () => {
  const { login, requestAccess, loginWithMicrosoft, microsoftMessages } = useAuth();
  const navigate = useNavigate();
  const { notConfigured: microsoftNotConfigured, failed: microsoftFailed } = microsoftMessages;

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('authError');
    if (authError === 'microsoft_not_configured') {
      setErrorMsg(microsoftNotConfigured);
    }
    if (authError === 'microsoft_failed') {
      setErrorMsg(microsoftFailed);
    }
    if (authError) {
      const url = new URL(window.location.href);
      url.searchParams.delete('authError');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
  }, [microsoftFailed, microsoftNotConfigured]);

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const validateEduschoEmail = (email, emptyMessage) => {
    if (!email) return emptyMessage;
    if (!email.toLowerCase().trim().endsWith('@eduscho.at')) {
      return 'Bitte verwende deine @eduscho.at-E-Mail-Adresse.';
    }
    return null;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!loginEmail || !loginPassword) {
      setErrorMsg('Bitte E-Mail-Adresse und Passwort eingeben.');
      return;
    }

    const emailError = validateEduschoEmail(loginEmail, 'Bitte E-Mail-Adresse und Passwort eingeben.');
    if (emailError) {
      setErrorMsg(emailError);
      return;
    }

    setLoadingAction('login');
    const result = await login(loginEmail, loginPassword);

    if (!result.success) {
      setErrorMsg(result.error || 'Die Anmeldung konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.');
      setLoadingAction(null);
      return;
    }

    navigate(result.redirectUrl || '/dashboard');
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    clearMessages();

    const emailError = validateEduschoEmail(signupEmail, 'Bitte gib deine E-Mail-Adresse ein.');
    if (emailError) {
      setErrorMsg(emailError);
      return;
    }

    setLoadingAction('signup');
    const result = await requestAccess(signupEmail);

    if (!result.success) {
      setErrorMsg(result.error || 'Die Anfrage konnte technisch nicht verarbeitet werden. Bitte später erneut versuchen.');
    } else {
      setSuccessMsg(result.message || accessSuccessMessage);
      setSignupEmail('');
    }
    setLoadingAction(null);
  };

  const handleMicrosoftLogin = async () => {
    clearMessages();
    setLoadingAction('microsoft');
    const result = await loginWithMicrosoft();
    if (!result.success) {
      setErrorMsg(result.error || microsoftNotConfigured);
      setLoadingAction(null);
    }
  };

  return (
    <>
      <Helmet>
        <title>Anmelden - Tchibo Benefit-Bar</title>
      </Helmet>

      <Header />

      <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#F4F1EA] px-4 py-10 text-[#222222]">
        {benefitCards.map(({ icon: Icon, label, className }) => (
          <div
            key={label}
            className={`absolute h-40 w-32 items-center justify-center rounded-lg border-[10px] border-white bg-[#EDD38E] shadow-xl ${className}`}
            aria-hidden="true"
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white/45">
              <Icon className="h-10 w-10 text-[#719C6F]" />
              <span className="text-sm font-semibold text-[#222222]">{label}</span>
            </div>
          </div>
        ))}

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-9rem)] max-w-md items-center justify-center">
          <section className="w-full rounded-lg border border-[#E7DDBF] bg-white p-6 shadow-xl sm:p-8">
            <div className="mb-7 text-center">
              <p className="mb-2 text-sm font-semibold uppercase text-[#C0A468]">Tchibo Österreich</p>
              <h1 className="text-3xl font-bold text-[#222222]">Benefit-Bar</h1>
              <p className="mx-auto mt-2 text-sm text-[#666666]">
                Willkommen zurück. Bitte melde dich mit deiner Eduscho E-Mail-Adresse an.
              </p>
            </div>

            <ErrorAlert message={errorMsg} onDismiss={() => setErrorMsg(null)} />

            {successMsg && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#719C6F]/30 bg-[#719C6F]/10 p-4 text-[#315B30] shadow-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 text-sm font-medium leading-relaxed">{successMsg}</div>
              </div>
            )}

            <Tabs defaultValue="login" className="w-full" onValueChange={clearMessages}>
              <TabsList className="mb-6 grid w-full grid-cols-2 rounded-lg bg-[#F4F1EA] p-1">
                <TabsTrigger value="login" className="rounded-md">Einloggen</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-md">Zugang anfordern</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#222222]">E-Mail Adresse</label>
                    <Input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => {
                        setLoginEmail(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder="vorname.nachname@eduscho.at"
                      className="border-[#D7C99F] bg-white text-[#222222] focus:border-[#C0A468]"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-sm font-medium text-[#222222]">Passwort</label>
                      <Link to="/forgot-password" className="text-xs font-medium text-[#8B7138] hover:underline">
                        Passwort vergessen?
                      </Link>
                    </div>
                    <Input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder="Passwort"
                      className="border-[#D7C99F] bg-white text-[#222222] focus:border-[#C0A468]"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={Boolean(loadingAction)}
                    className="w-full bg-[#C0A468] text-white hover:bg-[#A98D52]"
                  >
                    {loadingAction === 'login' ? 'Anmeldung läuft …' : 'Einloggen'}
                  </Button>
                </form>

                <div className="mt-7">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-[#E7DDBF]" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-3 font-medium text-[#777777]">Oder</span>
                    </div>
                  </div>

                  <Button
                    onClick={handleMicrosoftLogin}
                    disabled={Boolean(loadingAction)}
                    variant="outline"
                    className="mt-5 w-full border-[#D7C99F] bg-white text-[#222222] hover:bg-[#F4F1EA]"
                  >
                    {loadingAction === 'microsoft' ? 'Wird geprüft …' : 'Mit Microsoft anmelden'}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#222222]">E-Mail Adresse</label>
                    <Input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => {
                        setSignupEmail(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                        if (successMsg) setSuccessMsg(null);
                      }}
                      placeholder="vorname.nachname@eduscho.at"
                      className="border-[#D7C99F] bg-white text-[#222222] focus:border-[#C0A468]"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={Boolean(loadingAction)}
                    className="w-full bg-[#C0A468] text-white hover:bg-[#A98D52]"
                  >
                    {loadingAction === 'signup' ? 'Zugang wird geprüft …' : 'Zugang anfordern'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </>
  );
};

export default LoginPage;
