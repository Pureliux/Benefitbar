import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { AlertCircle, ArrowRight, CheckCircle2, CircleDollarSign, Clock, WalletCards } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import apiServerClient from '@/lib/apiServerClient';
import Header from '@/components/Header.jsx';
import { Button } from '@/components/ui/button';

const currency = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });

function firstNameFromUser(employee, currentUser) {
  const email = employee?.email || currentUser?.email || '';
  const local = email.split('@')[0] || 'du';
  const first = local.includes('.') ? local.split('.')[0] : (employee?.firstName || currentUser?.firstName || currentUser?.name || local);
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Willkommen';
  return 'Guten Abend';
}

function statusLabel(status) {
  const labels = {
    draft: 'Entwurf',
    submitted: 'In Prüfung',
    needs_info: 'Unterlagen fehlen',
    approved: 'Genehmigt',
    rejected: 'Abgelehnt',
    auto_assigned: 'Automatisch zugewiesen',
  };
  return labels[status] || 'Entwurf';
}

const DashboardPage = () => {
  const { employee, currentUser, isEligible } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [activeChartItem, setActiveChartItem] = useState(null);

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiServerClient.fetch('/benefits/overview');
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Daten konnten nicht geladen werden.');
        }
        setOverview(data);
      } catch (error) {
        setErrorMsg(error.message || 'Daten konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };

    loadOverview();
  }, []);

  const submission = overview?.submission;
  const benefitYear = overview?.benefitYear;
  const selectedBenefits = overview?.selectedBenefits || [];
  const totalBudget = benefitYear?.annualBudget || 1000;
  const selectedAmount = submission?.totalSelectedAmount || 0;
  const remainingBudget = submission?.remainingBudget ?? totalBudget;
  const ownContribution = submission?.employeeOwnContributionAmount || 0;
  const firstName = firstNameFromUser(employee, currentUser);

  const chartData = useMemo(() => {
    const segments = selectedBenefits.map((item, index) => ({
      name: item.isCustomBenefit ? item.customTitle : item.benefit?.title,
      value: item.coveredAmount || 0,
      color: ['#C0A468', '#719C6F', '#EDD38E', '#8D7A4D', '#4F7E68', '#D7B95C'][index % 6],
    })).filter((item) => item.value > 0);

    if (remainingBudget > 0) {
      segments.push({ name: 'Noch verfügbar', value: remainingBudget, color: '#E8E2D6' });
    }
    return segments.length ? segments : [{ name: 'Noch verfügbar', value: totalBudget, color: '#E8E2D6' }];
  }, [remainingBudget, selectedBenefits, totalBudget]);
  const chartDetail = activeChartItem;
  const handleChartEnter = (entry) => setActiveChartItem(entry?.payload || entry);

  if (loading) {
    return (
      <>
        <Header />
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
          <div className="text-foreground">Lädt …</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Übersicht - Tchibo Benefit-Bar</title>
        <meta name="description" content="Deine Benefit-Bar Übersicht" />
      </Helmet>

      <Header />

      <main className="benefit-ambient-bg min-h-[calc(100vh-4rem)] py-8 text-[#222222] transition-colors dark:text-[#F7F2E8]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <section className="mb-8 overflow-hidden rounded-lg border border-[#D8C894] bg-[#23211D] p-6 text-white shadow-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#EDD38E]">Benefit-Jahr {benefitYear?.year || new Date().getFullYear()}</p>
                <h1 className="text-3xl font-bold sm:text-4xl">{greetingForNow()} {firstName}!</h1>
                <p className="mt-3 text-sm text-white/70">Hier siehst du dein Budget, deine Auswahl und den aktuellen Status deiner Einreichung.</p>
              </div>
              <Button onClick={() => navigate('/benefits')} className="bg-[#C0A468] text-white hover:bg-[#A98D52]">
                Benefits auswählen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </section>

          {errorMsg && (
            <div className="mb-8 flex items-start gap-3 rounded-lg border border-[#EA5153]/30 bg-[#EA5153]/10 p-4 text-[#EA5153]">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <p className="text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          {!isEligible && (
            <div className="mb-8 rounded-lg border border-[#C0A468]/30 bg-white p-6 shadow-sm dark:bg-[#22201D]">
              <div className="flex items-start gap-4">
                <AlertCircle className="mt-1 h-6 w-6 shrink-0 text-[#C0A468]" />
                <div>
                  <h2 className="text-lg font-semibold">Noch nicht teilnahmeberechtigt</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Deine Teilnahmeberechtigung wird in deinem Profil verwaltet.</p>
                </div>
              </div>
            </div>
          )}

          <section className="grid gap-6 lg:grid-cols-[1.05fr_1.95fr]">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Mein Budget</h2>
                  <p className="text-sm text-muted-foreground">{statusLabel(submission?.status)}</p>
                </div>
                <WalletCards className="h-6 w-6 text-[#C0A468]" />
              </div>

              <div className="relative h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      innerRadius={92}
                      outerRadius={126}
                      paddingAngle={3}
                      stroke="transparent"
                      onMouseEnter={handleChartEnter}
                      onMouseLeave={() => setActiveChartItem(null)}
                    >
                      {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase text-muted-foreground">Noch frei</span>
                  <strong className="max-w-[9rem] text-balance text-xl leading-tight">{currency.format(remainingBudget)}</strong>
                </div>
              </div>

              {chartDetail && (
                <div className="rounded-lg border border-border bg-background p-3 shadow-sm dark:bg-muted/30">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: chartDetail.color }} />
                      <span className="truncate font-medium">{chartDetail.name}</span>
                    </span>
                    <span className="shrink-0 font-bold">{currency.format(chartDetail.value || 0)}</span>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {chartData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 truncate">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="font-medium">{currency.format(entry.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <CircleDollarSign className="mb-3 h-5 w-5 text-[#C0A468]" />
                  <p className="text-sm text-muted-foreground">Gesamtbudget</p>
                  <p className="mt-1 text-2xl font-bold">{currency.format(totalBudget)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <CheckCircle2 className="mb-3 h-5 w-5 text-[#719C6F]" />
                  <p className="text-sm text-muted-foreground">Ausgewählt</p>
                  <p className="mt-1 text-2xl font-bold">{currency.format(selectedAmount)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <WalletCards className="mb-3 h-5 w-5 text-[#719C6F]" />
                  <p className="text-sm text-muted-foreground">Noch verfügbar</p>
                  <p className="mt-1 text-2xl font-bold text-[#719C6F]">{currency.format(remainingBudget)}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <AlertCircle className="mb-3 h-5 w-5 text-[#EA5153]" />
                  <p className="text-sm text-muted-foreground">Eigenanteil</p>
                  <p className="mt-1 text-2xl font-bold text-[#EA5153]">{currency.format(ownContribution)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Aktuelle Auswahl</h2>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{selectedBenefits.length} Positionen</span>
                </div>

                {selectedBenefits.length ? (
                  <div className="divide-y divide-border">
                    {selectedBenefits.map((item) => (
                      <div key={item.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold">{item.isCustomBenefit ? item.customTitle : item.benefit?.title}</p>
                          <p className="text-sm text-muted-foreground">
                            Unternehmen {currency.format(item.coveredAmount)}
                            {item.ownContributionAmount > 0 ? ` · Eigenanteil ${currency.format(item.ownContributionAmount)}` : ''}
                          </p>
                        </div>
                        <span className="font-bold text-[#C0A468]">{currency.format(item.requestedAmount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                    <Clock className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">Noch keine Benefits ausgewählt</h3>
                    <p className="mx-auto mt-2 text-sm text-muted-foreground">Starte mit der Auswahl und sieh sofort, wie dein Budget aufgeteilt wird.</p>
                    <Button onClick={() => navigate('/benefits')} className="mt-5 bg-[#C0A468] text-white hover:bg-[#A98D52]">
                      Benefits auswählen
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
