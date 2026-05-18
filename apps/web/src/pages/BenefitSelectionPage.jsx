import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, ReceiptText, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext.jsx';
import apiServerClient from '@/lib/apiServerClient';
import Header from '@/components/Header.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const currency = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });

function payoutLabel(mode) {
  return mode === 'monthly_12' ? 'Monatlich ueber 12 Monate' : 'Einmalig';
}

const BenefitSelectionPage = () => {
  const { isEligible } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [customBenefit, setCustomBenefit] = useState({ title: '', description: '', amount: '' });

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
      toast.success('Benefit wurde ausgewaehlt.');
    } catch (error) {
      toast.error(error.message || 'Benefit konnte nicht ausgewaehlt werden.');
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
    const amount = Number(customBenefit.amount);
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
      toast.success('Eigener Benefit wurde hinzugefuegt.');
    } catch (error) {
      toast.error(error.message || 'Eigener Benefit konnte nicht hinzugefuegt werden.');
    } finally {
      setSavingId(null);
    }
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
          <div className="text-foreground">Laedt...</div>
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
              <p className="mt-2 text-muted-foreground">Du kannst Benefits auswaehlen, sobald du teilnahmeberechtigt bist.</p>
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

  return (
    <>
      <Helmet>
        <title>Benefits auswaehlen - Tchibo Benefit-Bar</title>
        <meta name="description" content="Benefits auswaehlen" />
      </Helmet>

      <Header />

      <main className="min-h-[calc(100vh-4rem)] bg-[#F4F1EA] py-8 text-[#222222] transition-colors dark:bg-[#171614] dark:text-[#F7F2E8]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-[#C0A468]">Benefit-Jahr {benefitYear?.year}</p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Benefits auswaehlen</h1>
              <p className="mt-2 text-sm text-muted-foreground">Waehle aus den Angeboten oder reiche einen eigenen Benefit zur Pruefung ein.</p>
            </div>
            <Button onClick={() => navigate('/submission')} className="bg-[#C0A468] text-white hover:bg-[#A98D52]">
              Zur Einreichung pruefen
            </Button>
          </div>

          <section className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Gesamtbudget</p>
              <p className="mt-1 text-2xl font-bold">{currency.format(benefitYear?.annualBudget || 1000)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Gesamt ausgewaehlt</p>
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

          <section className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                      <Button disabled className="flex-1 bg-[#719C6F] text-white">Ausgewaehlt</Button>
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
                      {savingId === benefit.id ? 'Wird gespeichert...' : 'Benefit auswaehlen'}
                    </Button>
                  )}
                </article>
              );
            })}

            {benefitYear?.allowCustomBenefits && (
              <article className="rounded-lg border border-dashed border-[#C0A468] bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-full bg-[#C0A468]/15 p-2">
                    <Sparkles className="h-5 w-5 text-[#C0A468]" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#C0A468]">Eigener Vorschlag</p>
                    <h2 className="text-xl font-bold">Eigenen Benefit einreichen</h2>
                  </div>
                </div>
                <div className="space-y-3">
                  <Input
                    value={customBenefit.title}
                    onChange={(event) => setCustomBenefit({ ...customBenefit, title: event.target.value })}
                    placeholder="Titel, z.B. Sprachkurs"
                    className="bg-background"
                  />
                  <Textarea
                    value={customBenefit.description}
                    onChange={(event) => setCustomBenefit({ ...customBenefit, description: event.target.value })}
                    placeholder="Kurz begruenden..."
                    rows={3}
                    className="resize-none bg-background"
                  />
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={customBenefit.amount}
                    onChange={(event) => setCustomBenefit({ ...customBenefit, amount: event.target.value })}
                    placeholder="Betrag in EUR"
                    className="bg-background"
                  />
                  <Button
                    onClick={handleAddCustomBenefit}
                    disabled={!editable || savingId === 'custom'}
                    className="w-full bg-[#23211D] text-white hover:bg-[#38342D] dark:bg-[#C0A468]"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {savingId === 'custom' ? 'Wird gespeichert...' : 'Eigenen Benefit hinzufuegen'}
                  </Button>
                </div>
              </article>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Deine Auswahl</h2>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{selectedBenefits.length} Positionen</span>
            </div>
            {selectedBenefits.length ? (
              <div className="divide-y divide-border">
                {selectedBenefits.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{item.isCustomBenefit ? item.customTitle : item.benefit?.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Unternehmen {currency.format(item.coveredAmount)}
                        {item.ownContributionAmount > 0 ? ` · Eigenanteil ${currency.format(item.ownContributionAmount)}` : ''}
                      </p>
                    </div>
                    <p className="font-bold text-[#C0A468]">{currency.format(item.requestedAmount)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">Noch keine Benefits ausgewaehlt.</p>
            )}
          </section>
        </div>
      </main>
    </>
  );
};

export default BenefitSelectionPage;
