import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Check, ExternalLink, FileText, Info, PencilLine, Plus, ReceiptText, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext.jsx';
import apiServerClient, { API_SERVER_URL } from '@/lib/apiServerClient';
import { ActivePieCallout, ChartSegmentCallout, buildBenefitChartData } from '@/lib/benefitChart.jsx';
import Header from '@/components/Header.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const currency = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
const ownContributionNotice = 'Dein Budget ist überschritten. Der Mehrbetrag wird als Eigenanteil ausgewiesen.';
const budgetExceededMessage = 'Budget überschritten. Entferne zuerst einen Benefit, bevor du ein weiteres auswählst.';
const benefitDetailImage = '/brand/benefit-detail-strip.png';

const benefitDetails = {
  'Yoga-Kurs': {
    imagePosition: '0% center',
    summary: 'Für regelmäßige Bewegung, mentale Entlastung und einen bewussten Ausgleich zum Arbeitsalltag.',
    highlights: ['Yoga-, Pilates- oder Achtsamkeitskurse', 'Präsenz- und Onlineangebote', 'Einzelkurse oder Kursblöcke'],
    receipt: 'Rechnung, Zahlungsbestätigung oder Teilnahmebestätigung des Anbieters.',
    hrNote: 'Achte darauf, dass Anbieter, Zeitraum und Betrag auf dem Nachweis gut lesbar sind.',
  },
  'Wiener Öffi-Ticket': {
    imagePosition: '16.666% center',
    summary: 'Unterstützt nachhaltige Mobilität für deinen Arbeitsweg und private Fahrten im öffentlichen Verkehr.',
    highlights: ['Jahreskarte oder Zeitkarten', 'Öffi-Abos und digitale Tickets', 'Monatliche Auszahlung über das Benefit-Jahr'],
    receipt: 'Ticketbeleg, Rechnung oder Screenshot aus der Ticket-App mit Name, Zeitraum und Betrag.',
    hrNote: 'Bei Abos ist ein Nachweis mit Laufzeit besonders hilfreich.',
  },
  'Fitness-Zuschuss': {
    imagePosition: '33.333% center',
    summary: 'Für Fitnessstudio, Kurse und Trainingsangebote, die deine Gesundheit langfristig unterstützen.',
    highlights: ['Fitnessstudio-Mitgliedschaft', 'Sportkurse und Personal Training', 'Ausrüstung, wenn sie direkt zum Angebot gehört'],
    receipt: 'Rechnung oder Mitgliedschaftsbestätigung mit bezahltem Betrag und Leistungszeitraum.',
    hrNote: 'Der Nachweis sollte klar zeigen, dass es sich um ein Gesundheits- oder Fitnessangebot handelt.',
  },
  Weiterbildung: {
    imagePosition: '50% center',
    summary: 'Für berufliche Entwicklung, fachliche Vertiefung und Lernangebote, die dich im Job weiterbringen.',
    highlights: ['Seminare, Kurse und Zertifikate', 'Fachliteratur und Lernplattformen', 'Sprach- oder Softwaretrainings'],
    receipt: 'Rechnung, Kursbestätigung oder Buchungsbeleg mit Anbieter, Thema und Betrag.',
    hrNote: 'Eine kurze Beschreibung hilft HR, den beruflichen Bezug schneller zu prüfen.',
  },
  Gesundheitscheck: {
    imagePosition: '66.666% center',
    summary: 'Für Vorsorge, Beratung und anerkannte Gesundheitsleistungen, die präventiv wirken.',
    highlights: ['Vorsorgeuntersuchungen', 'Beratung und Diagnostik', 'Anerkannte Gesundheitsleistungen'],
    receipt: 'Honorarnote, Rechnung oder Bestätigung der Einrichtung mit Leistungsdatum und Betrag.',
    hrNote: 'Medizinische Details müssen nicht ausführlich offengelegt werden; relevant sind Leistung, Datum und Betrag.',
  },
  'Homeoffice-Ausstattung': {
    imagePosition: '83.333% center',
    summary: 'Für eine ergonomische, ruhige und produktive Arbeitsumgebung zuhause.',
    highlights: ['Ergonomischer Stuhl oder Tisch', 'Monitor, Tastatur, Maus oder Beleuchtung', 'Arbeitsmittel für den Homeoffice-Platz'],
    receipt: 'Kaufbeleg oder Rechnung mit Artikelbezeichnung und Betrag.',
    hrNote: 'Bitte lade den vollständigen Beleg hoch, damit Artikel und Preis nachvollziehbar sind.',
  },
  'Essens-/Verpflegungszuschuss': {
    imagePosition: '100% center',
    summary: 'Unterstützt regelmäßige Mahlzeiten und gesunde Ernährung im Arbeitsalltag.',
    highlights: ['Essenszuschüsse und Verpflegung', 'Gesunde Mahlzeiten im Arbeitskontext', 'Monatliche Auszahlung über das Benefit-Jahr'],
    receipt: 'Belege, Abrechnungen oder Nachweise des jeweiligen Angebots.',
    hrNote: 'Bei laufenden Zuschüssen sind Zeitraum und Betrag besonders wichtig.',
  },
};

function payoutLabel(mode) {
  return mode === 'monthly_12' ? 'Monatlich über 12 Monate' : 'Einmalig';
}

function parseEuroInput(value) {
  const compactValue = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(/euro?/gi, '')
    .replace(/'/g, '');

  if (!compactValue) return NaN;

  if (compactValue.includes(',')) {
    return Number(compactValue.replace(/\./g, '').replace(',', '.'));
  }

  const dotParts = compactValue.split('.');
  if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[0].length <= 3 && dotParts[1].length === 3)) {
    return Number(compactValue.replace(/\./g, ''));
  }

  return Number(compactValue);
}

function formatEuroInput(value) {
  if (!value) return '';
  const parsed = parseEuroInput(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(parsed);
}

function detailForBenefit(benefit) {
  return benefitDetails[benefit.title] || {
    imagePosition: '50% center',
    summary: benefit.description || 'Zusätzliche Informationen zu diesem Benefit.',
    highlights: ['Betrag und Zweck prüfen', 'Passende Nachweise sammeln', 'Bei Fragen HR kontaktieren'],
    receipt: benefit.receiptRequired ? 'Bitte lade einen passenden Zahlungs- oder Leistungsnachweis hoch.' : 'Für diesen Benefit ist aktuell kein Nachweis erforderlich.',
    hrNote: 'Die Prüfung erfolgt anhand deiner Angaben und der hinterlegten Unterlagen.',
  };
}

function benefitImageStyle(detail) {
  return {
    backgroundImage: `url(${benefitDetailImage})`,
    backgroundPosition: detail.imagePosition,
    backgroundSize: '700% 100%',
  };
}

const BenefitSelectionPage = () => {
  const { isEligible } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [customBenefit, setCustomBenefit] = useState({ title: '', description: '', amount: '' });
  const [editingCustomId, setEditingCustomId] = useState(null);
  const [customEdit, setCustomEdit] = useState({ title: '', description: '', amount: '' });
  const [activeChartIndex, setActiveChartIndex] = useState(null);
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

  const isBudgetExceeded = () => {
    const submission = overview?.submission || {};
    const annualBudget = overview?.benefitYear?.annualBudget || 1000;

    return (submission.employeeOwnContributionAmount || 0) > 0
      || (submission.totalSelectedAmount || 0) > annualBudget;
  };

  const handleSelectBenefit = async (benefit) => {
    if (!['draft', 'needs_info', 'rejected'].includes(overview?.submission?.status)) {
      toast.error('Diese Einreichung kann aktuell nicht bearbeitet werden.');
      return;
    }

    if ((overview?.window?.canEdit ?? true) === false) {
      toast.error(overview?.window?.notice || 'Die Auswahl ist aktuell nicht aktiv.');
      return;
    }

    if (isBudgetExceeded()) {
      toast.error(budgetExceededMessage);
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

  const handleFileUpload = async (selectedBenefitId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('selectedBenefitId', selectedBenefitId);

    setUploadingId(selectedBenefitId);
    try {
      const res = await apiServerClient.fetch('/attachments/upload', {
        method: 'POST',
        body: formData,
      });
      await updateFromResponse(res);
      toast.success('Nachweis wurde hochgeladen.');
    } catch (error) {
      toast.error(error.message || 'Upload fehlgeschlagen.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    setDeletingAttachmentId(attachmentId);
    try {
      const res = await apiServerClient.fetch('/attachments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId }),
      });
      await updateFromResponse(res);
      toast.success('Nachweis wurde entfernt.');
    } catch (error) {
      toast.error(error.message || 'Nachweis konnte nicht entfernt werden.');
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const attachmentUrl = (attachment) => {
    const params = new URLSearchParams({ id: attachment.id });
    const token = localStorage.getItem('backend_token');
    if (token) params.set('token', token);
    return `${API_SERVER_URL}/attachments/file?${params.toString()}`;
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

  const startEditingCustom = (item) => {
    setEditingCustomId(item.id);
    setCustomEdit({
      title: item.customTitle || '',
      description: item.customDescription || '',
      amount: formatEuroInput(item.requestedAmount),
    });
  };

  const cancelEditingCustom = () => {
    setEditingCustomId(null);
    setCustomEdit({ title: '', description: '', amount: '' });
  };

  const handleUpdateCustomBenefit = async (selectedBenefitId) => {
    const amount = parseEuroInput(customEdit.amount);
    if (!customEdit.title.trim() || !amount || amount <= 0) {
      toast.error('Bitte Titel und Betrag angeben.');
      return;
    }

    setSavingId(selectedBenefitId);
    try {
      const res = await apiServerClient.fetch('/benefits/custom/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedBenefitId,
          title: customEdit.title,
          description: customEdit.description,
          amount,
        }),
      });
      await updateFromResponse(res);
      cancelEditingCustom();
      toast.success('Eigener Benefit wurde aktualisiert.');
    } catch (error) {
      toast.error(error.message || 'Eigener Benefit konnte nicht aktualisiert werden.');
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

  const attachmentsBySelectedId = useMemo(() => {
    const map = new Map();
    (overview?.attachments || []).forEach((attachment) => {
      const key = attachment.selectedBenefitId;
      const list = map.get(key) || [];
      list.push(attachment);
      map.set(key, list);
    });
    return map;
  }, [overview?.attachments]);

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
  const windowInfo = overview?.window || {};
  const benefits = overview?.benefits || [];
  const selectedBenefits = overview?.selectedBenefits || [];
  const editable = (submission.status === 'draft' || submission.status === 'needs_info' || submission.status === 'rejected') && (windowInfo.canEdit ?? true);
  const annualBudget = benefitYear?.annualBudget || 1000;
  const remainingBudget = submission.remainingBudget ?? annualBudget;
  const budgetExceeded = isBudgetExceeded();
  const safeChartData = buildBenefitChartData(selectedBenefits, remainingBudget, annualBudget);
  const handleChartEnter = (_entry, index) => setActiveChartIndex(index);
  const renderReceiptUpload = (selectedItem, compact = false) => {
    if (!selectedItem) return null;
    const itemAttachments = attachmentsBySelectedId.get(selectedItem.id) || [];
    const isUploading = uploadingId === selectedItem.id;

    return (
      <div className={compact ? 'mt-3 space-y-2' : 'mb-5 space-y-2 rounded-lg border border-dashed border-border bg-muted/25 p-3'}>
        {editable && (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-[#C0A468]/12 px-3 py-2 text-sm font-semibold text-[#8B7138] transition hover:bg-[#C0A468]/20 dark:text-[#EDD38E]">
            <Upload className="h-4 w-4" />
            {isUploading ? 'Lädt hoch …' : itemAttachments.length ? 'Weiteren Nachweis hochladen' : 'Nachweis hochladen'}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              className="hidden"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFileUpload(selectedItem.id, file);
                event.target.value = '';
              }}
            />
          </label>
        )}

        {itemAttachments.length > 0 && (
          <div className="space-y-2">
            {itemAttachments.map((attachment) => (
              <div key={attachment.id} className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <a
                  href={attachmentUrl(attachment)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-2 font-medium text-[#8B7138] hover:underline dark:text-[#EDD38E]"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{attachment.fileName}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAttachment(attachment.id)}
                    disabled={deletingAttachmentId === attachment.id}
                    className="justify-start text-[#EA5153] hover:bg-[#EA5153]/10 hover:text-[#EA5153] sm:justify-center"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Entfernen
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Benefits auswählen - Tchibo Benefitbar</title>
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
              Nachweise & Status
            </Button>
          </div>

          {windowInfo.notice && (
            <div className={`mb-8 rounded-lg border p-4 text-sm font-medium ${
              windowInfo.isUrgent
                ? 'border-[#EA5153]/30 bg-[#EA5153]/10 text-[#EA5153]'
                : 'border-[#C0A468]/30 bg-[#C0A468]/10 text-[#8B7138]'
            }`}>
              {windowInfo.notice}
            </div>
          )}

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
                const detail = detailForBenefit(benefit);
                const selectedAttachments = selected ? attachmentsBySelectedId.get(selected.id) || [] : [];
                return (
                  <article key={benefit.id} className={`rounded-lg border bg-card p-6 shadow-sm transition ${selected ? 'border-[#C0A468]' : 'border-border hover:border-[#C0A468]/70 hover:shadow-md'}`}>
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase text-[#C0A468]">{benefit.category}</p>
                        <h2 className="mt-1 text-xl font-bold">{benefit.title}</h2>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full border-[#C0A468]/40 text-[#8B7138] hover:bg-[#C0A468]/12 dark:text-[#EDD38E]"
                              aria-label={`Mehr Informationen zu ${benefit.title}`}
                              title="Mehr Informationen"
                            >
                              <Info className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-3xl">
                            <div className="h-56 rounded-t-lg bg-cover bg-center sm:h-72" style={benefitImageStyle(detail)} />
                            <div className="p-6">
                              <DialogHeader>
                                <DialogTitle className="text-2xl">{benefit.title}</DialogTitle>
                                <DialogDescription>{detail.summary}</DialogDescription>
                              </DialogHeader>

                              <div className="mt-6 grid gap-4 md:grid-cols-[1fr_16rem]">
                                <div className="space-y-4">
                                  <div>
                                    <p className="mb-2 text-sm font-semibold uppercase text-[#C0A468]">Wofür gedacht</p>
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                      {detail.highlights.map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#719C6F]" />
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                                    <p className="text-sm font-semibold">Nachweis</p>
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail.receipt}</p>
                                  </div>
                                  <div className="rounded-lg border border-[#C0A468]/25 bg-[#C0A468]/10 p-4">
                                    <p className="text-sm font-semibold text-[#8B7138] dark:text-[#EDD38E]">Gut zu wissen</p>
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail.hrNote}</p>
                                  </div>
                                </div>

                                <div className="rounded-lg border border-border bg-card p-4">
                                  <p className="text-sm text-muted-foreground">Benefit-Wert</p>
                                  <p className="mt-1 text-2xl font-bold text-[#C0A468]">{currency.format(benefit.fixedAmount)}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{payoutLabel(benefit.payoutMode)}</p>
                                  <div className="mt-4 rounded-md bg-muted/40 p-3 text-sm">
                                    <p className="font-medium">{benefit.category}</p>
                                    <p className="mt-1 text-muted-foreground">{benefit.receiptRequired ? 'Nachweis erforderlich' : 'Kein Nachweis erforderlich'}</p>
                                  </div>
                                  {selected && (
                                    <div className="mt-4 rounded-md bg-[#719C6F]/10 p-3 text-sm font-medium text-[#315B30] dark:text-[#A9D0A6]">
                                      Bereits ausgewählt
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        {selected && <Check className="h-5 w-5 text-[#719C6F]" />}
                      </div>
                    </div>
                    <p className="mb-5 min-h-16 text-sm text-muted-foreground">{benefit.description}</p>
                    <div className="mb-5 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-2xl font-bold text-[#C0A468]">{currency.format(benefit.fixedAmount)}</p>
                        <p className="text-xs text-muted-foreground">{payoutLabel(benefit.payoutMode)}</p>
                      </div>
                      {benefit.receiptRequired && (
                        selected && editable ? (
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[#C0A468]/12 px-2.5 py-1 text-xs font-semibold text-[#8B7138] hover:bg-[#C0A468]/20 dark:text-[#EDD38E]">
                            <ReceiptText className="h-3.5 w-3.5" />
                            {uploadingId === selected.id ? 'Lädt hoch …' : selectedAttachments.length ? `${selectedAttachments.length} Nachweis${selectedAttachments.length === 1 ? '' : 'e'}` : 'Nachweis hochladen'}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.docx"
                              className="hidden"
                              disabled={uploadingId === selected.id}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) handleFileUpload(selected.id, file);
                                event.target.value = '';
                              }}
                            />
                          </label>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!selected) {
                                toast.info('Wähle den Benefit zuerst aus, dann kannst du hier den Nachweis hochladen.');
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium transition hover:bg-muted/80"
                          >
                            <ReceiptText className="h-3.5 w-3.5" />
                            Nachweis
                          </button>
                        )
                      )}
                    </div>
                    {benefit.receiptRequired && selected && selectedAttachments.length > 0 && renderReceiptUpload(selected)}
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
                        disabled={!editable || budgetExceeded || savingId === benefit.id}
                        className="w-full bg-[#E5E5E5] text-[#222222] hover:bg-[#D6D6D6] dark:bg-[#3A3A3A] dark:text-[#F7F2E8] dark:hover:bg-[#4A4A4A]"
                      >
                        {budgetExceeded ? 'Budget überschritten' : (savingId === benefit.id ? 'Wird gespeichert …' : 'Benefit auswählen')}
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

              {budgetExceeded && (
                <div className="rounded-lg border border-[#EA5153]/30 bg-[#EA5153]/10 p-3 text-sm font-medium text-[#EA5153]">
                  {ownContributionNotice}
                </div>
              )}

              <div className="relative h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={safeChartData}
                      dataKey="value"
                      innerRadius={86}
                      outerRadius={124}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={3}
                      stroke="transparent"
                      activeIndex={activeChartIndex ?? undefined}
                      activeShape={ActivePieCallout}
                      onMouseEnter={handleChartEnter}
                      onMouseLeave={() => setActiveChartIndex(null)}
                    >
                      {safeChartData.map((entry) => <Cell key={entry.id} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <ChartSegmentCallout data={safeChartData} activeIndex={activeChartIndex} />
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
                        {item.isCustomBenefit && editingCustomId === item.id ? (
                          <div className="space-y-2">
                            <Input
                              value={customEdit.title}
                              onChange={(event) => setCustomEdit({ ...customEdit, title: event.target.value })}
                              className="h-9 bg-background"
                              placeholder="Titel"
                            />
                            <Textarea
                              value={customEdit.description}
                              onChange={(event) => setCustomEdit({ ...customEdit, description: event.target.value })}
                              className="min-h-20 resize-none bg-background"
                              placeholder="Beschreibung"
                            />
                            <Input
                              inputMode="decimal"
                              value={customEdit.amount}
                              onChange={(event) => setCustomEdit({ ...customEdit, amount: event.target.value })}
                              onBlur={() => setCustomEdit((current) => ({ ...current, amount: formatEuroInput(current.amount) }))}
                              className="h-9 bg-background"
                              placeholder="0,00"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleUpdateCustomBenefit(item.id)}
                                disabled={savingId === item.id}
                                className="flex-1 bg-[#C0A468] text-white hover:bg-[#A98D52]"
                              >
                                Speichern
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={cancelEditingCustom}>
                                <X className="mr-1 h-4 w-4" />
                                Abbrechen
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-medium leading-snug">{item.isCustomBenefit ? item.customTitle : item.benefit?.title}</p>
                              <p className="shrink-0 font-bold text-[#C0A468]">{currency.format(item.requestedAmount)}</p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Unternehmen {currency.format(item.coveredAmount)}
                              {item.ownContributionAmount > 0 ? ` · Eigenanteil ${currency.format(item.ownContributionAmount)}` : ''}
                            </p>
                            {(item.benefit?.receiptRequired || item.isCustomBenefit) && renderReceiptUpload(item, true)}
                            {item.isCustomBenefit && editable && (
                              <div className="mt-3 flex gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => startEditingCustom(item)} className="flex-1">
                                  <PencilLine className="mr-2 h-4 w-4" />
                                  Bearbeiten
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemove(item.id)}
                                  disabled={savingId === item.id}
                                  className="text-[#EA5153] hover:bg-[#EA5153]/10 hover:text-[#EA5153]"
                                  aria-label="Eigenen Benefit entfernen"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </>
                        )}
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
