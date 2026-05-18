import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, ReceiptText, Sparkles, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext.jsx';
import apiServerClient from '@/lib/apiServerClient';
import Header from '@/components/Header.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const currency = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const chartColors = ['#C0A468', '#719C6F', '#EDD38E', '#8D7A4D', '#4F7E68', '#D7B95C'];

function payoutLabel(mode) {
  return mode === 'monthly_12' ? 'Monatlich über 12 Monate' : 'Einmalig';
}

function parseEuroInput(value) {
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}

function formatEuroInput(value) {
  if (!value) return '';
  const parsed = parseEuroInput(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(parsed);
}

const BenefitSelectionPage = () => {
  const { isEligible } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [customBenefit, setCustomBenefit] = useState({ title: '', description: '', amount: '' });
  const repeatTimerRef = useRef(null);
  const repeatIntervalRef = useRef(null);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await apiServerClient.fetch('/benefits/overview');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Benefits konnten nicht geladen werden.');
      }
      setOverview(data);
    } catch (error) {
      toast.error(error.message || 'Benefits konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => () => {
    window.clearTimeout(repeatTimerRef.current);
    window.clearInterval(repeatIntervalRef.current);
  }, []);

  const updateFromResponse = async (res) => {
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Aktion konnte nicht abgeschlossen werden.');
    }
    setOverview(data);
  };

  const handleSelectBenefit = async (benefit) => {
    if (overview?.submission?.status !== 'draft' && overview?.submission?.status !== 'needs_info') {
      toast.error('Diese Einreichung kann aktuell nicht bearbeitet werden.');
      return;
    }

    setSavingId(benefit.id);
    try {
      const res = await apiServerClient.fetch('/benefits/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benefitId: benefit.id }),
      });
      await updateFromResponse(res);
      toast.success('Benefit wurde ausgewählt.');
    } catch (error) {
      toast.error(error.message || 'Benefit konnte nicht ausgewählt werden.');
    } finally {
      setSavingId(null);
    }
  };

  const handleRemove = async (selectedBenefitId) => {
    setSavingId(selectedBenefitId);
    try {
      const res = await apiServerClient.fetch('/benefits/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedBenefitId }),
      });
      await updateFromResponse(res);
      toast.success('Benefit wurde entfernt.');
    } catch (error) {
      toast.error(error.message || 'Benefit konnte nicht entfernt werden.');
    } finally {
      setSavingId(null);
    }
  };

  const handleAddCustomBenefit = async () => {
    const amount = parseEuroInput(customBenefit.amount);
    if (!customBenefit.title.trim() || !amount || amount <= 0) {
      toast.error('Bitte Titel und Betrag angeben.');
      return;
    }

    setSavingId('custom');
    try {
      const res = await apiServerClient.fetch('/benefits/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...customBenefit, amount }),
      });
      await updateFromResponse(res);
      setCustomBenefit({ title: '', description: '', amount: '' });
      toast.success('Eigener Benefit wurde hinzugefügt.');
    } catch (error) {
      toast.error(error.message || 'Eigener Benefit konnte nicht hinzugefügt werden.');
    } finally {
      setSavingId(null);
    }
  };

  const adjustCustomAmount = (delta) => {
    setCustomBenefit((current) => {
      const parsed = parseEuroInput(current.amount || '0');
      const next = Math.max(0, Math.round(((Number.isFinite(parsed) ? parsed : 0) + delta) * 100) / 100);
      return { ...current, amount: new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(next) };
    });
  };

  const stopAmountRepeat = () => {
    window.clearTimeout(repeatTimerRef.current);
    window.clearInterval(repeatIntervalRef.current);
    repeatTimerRef.current = null;
    repeatIntervalRef.current = null;
  };

  const startAmountRepeat = (delta) => {
    stopAmountRepeat();
    adjustCustomAmount(delta);
    repeatTimerRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(() => adjustCustomAmount(delta), 80);
    }, 350);
  };

  const selectedByBenefitId = useMemo(() => {
    const map = new Map();
    (overview?.selectedBenefits || []).forEach((item) => {
      if (item.benefitId) map.set(item.benefitId, item);
    });
    return map;
  }, [overview?.selectedBenefits]);

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

  if (!isEligible) {
    return (
      <>
        <Header />
        <main className="min-h-[calc(100vh-4rem)] bg-background py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
              <h1 className="text-2xl font-bold">Noch nicht teilnahmeberechtigt</h1>
              <p className="mt-2 text-muted-foreground">Du kannst Benefits auswählen, sobald du teilnahmeberechtigt bist.</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const benefitYear = overview?.benefitYear;
  const submission = overview?.submission || {};
  const benefits = overview?.benefits || [];
  const selectedBenefits = overview?.selectedBenefits || [];
  const editable = submission.status === 'draft' || submission.status === 'needs_info';
  const annualBudget = benefitYear?.annualBudget || 1000;
  const remainingBudget = submission.remainingBudget ?? annualBudget;
  const chartData = [
    ...selectedBenefits
      .map((item, index) => ({
        name: item.isCustomBenefit ? item.customTitle : item.benefit?.title,
        value: item.coveredAmount || 0,
        color: chartColors[index % chartColors.length],
      }))
      .filter((item) => item.value > 0),
    ...(remainingBudget > 0 ? [{ name: 'Noch verfügbar', value: remainingBudget, color: '#E8E2D6' }] : []),
  ];
  const safeChartData = chartData.length ? chartData : [{ name: 'Noch verfügbar', value: annualBudget, color: '#E8E2D6' }];

  return (
    <>
      <Helmet>
        <title>Benefits auswählen - Tchibo Benefit-Bar</title>
        <meta name="description" content="Benefits auswählen" />
      </Helmet>

      <Header />

      <main className="benefit-ambient-bg min-h-[calc(100vh-4rem)] py-8 text-[#222222] transition-colors dark:text-[#F7F2E8]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-[#C0A468]">Benefit-Jahr {benefitYear?.year}</p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Benefits auswählen</h1>
              <p className="mt-2 text-sm text-muted-foreground">Wähle aus den Angeboten oder reiche einen eigenen Benefit zur Prüfung ein.</p>
            </div>
            <Button onClick={() => navigate('/submission')} className="bg-[#C0A468] text-white hover:bg-[#A98D52]">
              Zur Einreichung prüfen
            </Button>
          </div>

          <section className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Gesamtbudget</p>
              <p className="mt-1 text-2xl font-bold">{currency.format(annualBudget)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Gesamt ausgewählt</p>
              <p className="mt-1 text-2xl font-bold">{currency.format(submission.totalSelectedAmount || 0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Vom Unternehmen gedeckt</p>
              <p className="mt-1 text-2xl font-bold text-[#719C6F]">{currency.format(submission.coveredByCompanyAmount || 0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Eigenanteil</p>
              <p className="mt-1 text-2xl font-bold text-[#EA5153]">{currency.format(submission.employeeOwnContributionAmount || 0)}</p>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
            <section className="grid gap-5 md:grid-cols-2">
              {benefits.map((benefit) => {
                const selected = selectedByBenefitId.get(benefit.id);
                return (
                  <article key={benefit.id} className={`rounded-lg border bg-card p-6 shadow-sm transition ${selected ? 'border-[#C0A468]' : 'border-border hover:border-[#C0A468]/70 hover:shadow-md'}`}>
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-[#C0A468]">{benefit.category}</p>
                        <h2 className="mt-1 text-xl font-bold">{benefit.title}</h2>
                      </div>
                      {selected && <Check className="h-5 w-5 text-[#719C6F]" />}
                    </div>
                    <p className="mb-5 min-h-16 text-sm text-muted-foreground">{benefit.description}</p>
                    <div className="mb-5 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-2xl font-bold text-[#C0A468]">{currency.format(benefit.fixedAmount)}</p>
                        <p className="text-xs text-muted-foreground">{payoutLabel(benefit.payoutMode)}</p>
                      </div>
                      {benefit.receiptRequired && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                          <ReceiptText className="h-3.5 w-3.5" />
                          Nachweis
                        </span>
                      )}
                    </div>
                    {selected ? (
                      <div className="flex gap-2">
                        <Button disabled className="flex-1 bg-[#719C6F] text-white">Ausgewählt</Button>
                        {editable && (
                          <Button variant="outline" size="icon" onClick={() => handleRemove(selected.id)} disabled={savingId === selected.id}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleSelectBenefit(benefit)}
                        disabled={!editable || savingId === benefit.id}
                        className="w-full bg-[#C0A468] text-white hover:bg-[#A98D52]"
                      >
                        {savingId === benefit.id ? 'Wird gespeichert …' : 'Benefit auswählen'}
                      </Button>
                    )}
                  </article>
                );
              })}

              {benefitYear?.allowCustomBenefits && (
                <article className="rounded-lg border border-dashed border-[#C0A468] bg-card p-6 shadow-sm md:col-span-2">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-[#C0A468]/15 p-2">
                      <Sparkles className="h-5 w-5 text-[#C0A468]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#C0A468]">Eigener Vorschlag</p>
                      <h2 className="text-xl font-bold">Eigenen Benefit vorschlagen</h2>
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_14rem]">
                    <Input
                      value={customBenefit.title}
                      onChange={(event) => setCustomBenefit({ ...customBenefit, title: event.target.value })}
                      placeholder="Titel, z. B. Sprachkurs"
                      className="bg-background"
                    />
                    <Textarea
                      value={customBenefit.description}
                      onChange={(event) => setCustomBenefit({ ...customBenefit, description: event.target.value })}
                      placeholder="Kurz begründen …"
                      rows={1}
                      className="min-h-9 resize-none bg-background"
                    />
                    <div className="flex overflow-hidden rounded-md border border-input bg-background">
                      <button
                        type="button"
                        className="w-10 border-r border-input text-lg font-semibold text-[#8B7138] hover:bg-muted"
                        onMouseDown={() => startAmountRepeat(-1)}
                        onMouseUp={stopAmountRepeat}
                        onMouseLeave={stopAmountRepeat}
                        onTouchStart={() => startAmountRepeat(-1)}
                        onTouchEnd={stopAmountRepeat}
                        aria-label="Betrag verringern"
                      >
                        -
                      </button>
                      <Input
                        inputMode="decimal"
                        value={customBenefit.amount}
                        onChange={(event) => setCustomBenefit({ ...customBenefit, amount: event.target.value })}
                        onBlur={() => setCustomBenefit((current) => ({ ...current, amount: formatEuroInput(current.amount) }))}
                        placeholder="0,00 EUR"
                        className="h-9 border-0 bg-transparent text-center focus-visible:ring-0"
                      />
                      <button
                        type="button"
                        className="w-10 border-l border-input text-lg font-semibold text-[#8B7138] hover:bg-muted"
                        onMouseDown={() => startAmountRepeat(1)}
                        onMouseUp={stopAmountRepeat}
                        onMouseLeave={stopAmountRepeat}
                        onTouchStart={() => startAmountRepeat(1)}
                        onTouchEnd={stopAmountRepeat}
                        aria-label="Betrag erhöhen"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <Button
                    onClick={handleAddCustomBenefit}
                    disabled={!editable || savingId === 'custom'}
                    className="mt-4 bg-[#23211D] text-white hover:bg-[#38342D] dark:bg-[#C0A468]"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {savingId === 'custom' ? 'Wird gespeichert …' : 'Eigenen Benefit hinzufügen'}
                  </Button>
                </article>
              )}
            </section>

            <aside className="sticky top-24 space-y-5 rounded-lg border border-border bg-card/95 p-5 shadow-lg backdrop-blur-sm dark:bg-card/92">
              <div>
                <p className="text-sm font-semibold uppercase text-[#C0A468]">Mein Budget</p>
                <h2 className="mt-1 text-xl font-bold">Aktuelle Übersicht</h2>
              </div>

              <div className="relative h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={safeChartData} dataKey="value" innerRadius={86} outerRadius={124} paddingAngle={3} stroke="transparent">
                      {safeChartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => currency.format(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase text-muted-foreground">Noch frei</span>
                  <strong className="max-w-[9rem] text-balance text-xl leading-tight">{currency.format(remainingBudget)}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-muted-foreground">Ausgewählt</p>
                  <p className="font-bold">{currency.format(submission.totalSelectedAmount || 0)}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <p className="text-muted-foreground">Eigenanteil</p>
                  <p className="font-bold text-[#EA5153]">{currency.format(submission.employeeOwnContributionAmount || 0)}</p>
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Deine Auswahl</h3>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{selectedBenefits.length}</span>
                </div>
                {selectedBenefits.length ? (
                  <div className="max-h-72 space-y-3 overflow-auto pr-1">
                    {selectedBenefits.map((item) => (
                      <div key={item.id} className="rounded-md border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium leading-snug">{item.isCustomBenefit ? item.customTitle : item.benefit?.title}</p>
                          <p className="shrink-0 font-bold text-[#C0A468]">{currency.format(item.requestedAmount)}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Unternehmen {currency.format(item.coveredAmount)}
                          {item.ownContributionAmount > 0 ? ` · Eigenanteil ${currency.format(item.ownContributionAmount)}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground">Noch keine Benefits ausgewählt.</p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
};

export default BenefitSelectionPage;
