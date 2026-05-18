import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header.jsx';
import ErrorAlert from '@/components/ErrorAlert.jsx';

const accessSuccessMessage = 'Falls für diese E-Mail-Adresse ein aktiver Zugang besteht, wurde eine E-Mail mit weiteren Schritten versendet.';

const benefitCards = [
  {
    label: 'Gesundheit',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=900&q=80',
    className: 'left-[5.5%] top-[4%] -rotate-3 hidden xl:block',
    objectPosition: 'center',
    pinColor: '#EA5153',
  },
  {
    label: 'Mobilität',
    image: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=900&q=80',
    className: 'left-[calc(17.5%_-_2.5rem)] top-[38%] rotate-2 hidden xl:block',
    objectPosition: 'center',
    pinColor: '#4F6D8A',
  },
  {
    label: 'Fitness',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80',
    className: 'left-[6%] bottom-[5%] -rotate-2 hidden xl:block',
    objectPosition: 'center',
    pinColor: '#719C6F',
  },
  {
    label: 'Weiterbildung',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80',
    className: 'right-[5.5%] top-[4%] rotate-3 hidden xl:block',
    objectPosition: 'center',
    pinColor: '#E4C35A',
  },
  {
    label: 'Homeoffice',
    image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=900&q=80',
    className: 'right-[calc(17.5%_-_2.5rem)] top-[38%] -rotate-2 hidden xl:block',
    objectPosition: 'center',
    pinColor: '#E08A5B',
  },
  {
    label: 'Ernährung',
    image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80',
    className: 'right-[6%] bottom-[5%] rotate-2 hidden xl:block',
    objectPosition: 'center',
    pinColor: '#7E6BA8',
  },
];

const tabletCards = [
  benefitCards[0],
  benefitCards[3],
];

function BenefitImageCard({ card, compact = false }) {
  return (
    <div
      className={
        compact
          ? 'relative h-28 w-48 overflow-visible rounded-lg border-[6px] border-white bg-white shadow-xl ring-1 ring-black/5 dark:border-white dark:ring-white/10'
          : `absolute h-[13.5rem] w-[23rem] overflow-visible rounded-lg border-[8px] border-white bg-white shadow-2xl ring-1 ring-black/5 dark:border-white dark:ring-white/10 2xl:h-56 2xl:w-96 ${card.className}`
      }
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-[-0.7rem] z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <span className="absolute left-1/2 top-3 z-0 h-5 w-[2px] -translate-x-1/2 rounded-b-full bg-[#111111] shadow-[0_0.2rem_0.25rem_rgba(0,0,0,0.35)]">
          <span className="absolute bottom-[-4px] left-1/2 h-2 w-[2px] -translate-x-1/2 rounded-full bg-[#C8CDD2] shadow-[0_0.1rem_0.18rem_rgba(0,0,0,0.25)]" />
        </span>
        <span
          className="relative z-10 h-6 w-6 rounded-full border-2 border-white shadow-[0_0.55rem_1rem_rgba(34,34,34,0.32),inset_0_0.2rem_0.35rem_rgba(255,255,255,0.55),inset_0_-0.2rem_0.35rem_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: card.pinColor || '#C0A468' }}
        >
          <span className="absolute left-1.5 top-1 h-2 w-2 rounded-full bg-white/70 blur-[0.5px]" />
        </span>
      </div>
      <div className="relative h-full w-full overflow-hidden rounded-[2px]">
        <img
          src={card.image}
          alt=""
          loading="eager"
          className="h-full w-full object-cover"
          style={{ objectPosition: card.objectPosition }}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4 pt-14">
          <span className="text-sm font-semibold text-white drop-shadow-sm">{card.label}</span>
        </div>
      </div>
    </div>
  );
}

const LoginPage = () => {
  const { login, requestAccess } = useAuth();
  const navigate = useNavigate();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

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

  return (
    <>
      <Helmet>
        <title>Anmelden - Tchibo Benefit-Bar</title>
      </Helmet>

      <Header />

      <main className="benefit-ambient-bg login-chalk-bg relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-8 text-[#222222] transition-colors duration-300 dark:text-[#F7F2E8] sm:py-10">
        <div className="login-chalk-layer pointer-events-none absolute inset-0 z-0" />
        <div className="pointer-events-none absolute inset-x-0 top-7 hidden justify-between px-8 lg:flex xl:hidden">
          {tabletCards.map((card) => (
            <BenefitImageCard key={`tablet-${card.label}`} card={card} compact />
          ))}
        </div>

        {benefitCards.map((card) => (
          <BenefitImageCard key={card.label} card={card} />
        ))}

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] max-w-md items-center justify-center lg:min-h-[calc(100vh-9rem)]">
          <section className="w-full rounded-lg border border-[#E7DDBF] bg-white/95 p-6 shadow-2xl shadow-black/10 backdrop-blur-sm transition-colors duration-300 dark:border-[#3A3E46] dark:bg-[#202329]/95 dark:shadow-black/40 sm:p-8">
            <div className="mb-7 text-center">
              <h1 className="text-3xl font-bold text-[#222222] dark:text-[#F7F2E8]">Tchibo Benefitbar</h1>
              <p className="mx-auto mt-2 text-sm text-[#5E5A52] dark:text-[#C8C0B1]">
                Bitte melde dich mit deiner E-Mail-Adresse an.
              </p>
            </div>

            <ErrorAlert message={errorMsg} onDismiss={() => setErrorMsg(null)} />

            {successMsg && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#719C6F]/30 bg-[#719C6F]/10 p-4 text-[#315B30] shadow-sm dark:text-[#A9D0A6]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 text-sm font-medium leading-relaxed">{successMsg}</div>
              </div>
            )}

            <Tabs defaultValue="login" className="w-full" onValueChange={clearMessages}>
              <TabsList className="mb-6 grid w-full grid-cols-2 rounded-lg bg-[#F4F1EA] p-1 dark:bg-[#2B2F36]">
                <TabsTrigger value="login" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-[#222222] dark:text-[#F7F2E8] dark:data-[state=active]:bg-[#3A3E46] dark:data-[state=active]:text-white">
                  Einloggen
                </TabsTrigger>
                <TabsTrigger value="signup" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-[#222222] dark:text-[#F7F2E8] dark:data-[state=active]:bg-[#3A3E46] dark:data-[state=active]:text-white">
                  Zugang anfordern
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#222222] dark:text-[#F7F2E8]">E-Mail-Adresse</label>
                    <Input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => {
                        setLoginEmail(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      placeholder="vorname.nachname@eduscho.at"
                      className="border-[#D7C99F] bg-white text-[#222222] placeholder:text-[#8B8578] focus:border-[#C0A468] dark:border-[#454A53] dark:bg-[#181B20] dark:text-[#F7F2E8] dark:placeholder:text-[#9BA1AA]"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-sm font-medium text-[#222222] dark:text-[#F7F2E8]">Passwort</label>
                      <Link to="/forgot-password" className="text-xs font-medium text-[#8B7138] hover:underline dark:text-[#D4B978]">
                        Passwort vergessen?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => {
                          setLoginPassword(e.target.value);
                          if (errorMsg) setErrorMsg(null);
                        }}
                        placeholder="Passwort"
                        className="border-[#D7C99F] bg-white pr-11 text-[#222222] placeholder:text-[#8B8578] focus:border-[#C0A468] dark:border-[#454A53] dark:bg-[#181B20] dark:text-[#F7F2E8] dark:placeholder:text-[#9BA1AA]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute inset-y-0 right-3 flex items-center text-[#8B7138] transition-colors hover:text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C0A468] focus:ring-offset-2 focus:ring-offset-white dark:text-[#D4B978] dark:hover:text-white dark:focus:ring-offset-[#202329]"
                        aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={Boolean(loadingAction)}
                    className="h-12 w-full bg-[#C0A468] text-base font-semibold text-white shadow-md shadow-[#C0A468]/20 hover:bg-[#A98D52] dark:bg-[#B99A56] dark:text-white dark:hover:bg-[#C0A468]"
                  >
                    {loadingAction === 'login' ? 'Anmeldung läuft …' : 'Einloggen'}
                  </Button>
                </form>

              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#222222] dark:text-[#F7F2E8]">E-Mail-Adresse</label>
                    <Input
                      type="email"
                      value={signupEmail}
                      onChange={(e) => {
                        setSignupEmail(e.target.value);
                        if (errorMsg) setErrorMsg(null);
                        if (successMsg) setSuccessMsg(null);
                      }}
                      placeholder="vorname.nachname@eduscho.at"
                      className="border-[#D7C99F] bg-white text-[#222222] placeholder:text-[#8B8578] focus:border-[#C0A468] dark:border-[#454A53] dark:bg-[#181B20] dark:text-[#F7F2E8] dark:placeholder:text-[#9BA1AA]"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={Boolean(loadingAction)}
                    className="w-full bg-[#C0A468] text-white shadow-md shadow-[#C0A468]/20 hover:bg-[#A98D52] dark:bg-[#B99A56] dark:text-white dark:hover:bg-[#C0A468]"
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
