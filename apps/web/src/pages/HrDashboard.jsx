import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Maximize2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import apiServerClient, { API_SERVER_URL } from '@/lib/apiServerClient';
import Header from '@/components/Header.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const currency = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });

const submissionStatuses = {
  draft: { label: 'Entwurf', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  submitted: { label: 'In Prüfung', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  needs_info: { label: 'Unterlagen fehlen', className: 'bg-red-100 text-red-700 border-red-200' },
  approved: { label: 'Genehmigt', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Abgelehnt', className: 'bg-red-100 text-red-700 border-red-200' },
};

const reviewStatuses = {
  open: { label: 'Offen', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  checked: { label: 'Geprüft', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  needs_info: { label: 'Rückfrage', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  rejected: { label: 'Abgelehnt', className: 'bg-red-100 text-red-700 border-red-200' },
};

function StatusBadge({ status, type = 'submission' }) {
  const config = type === 'review'
    ? reviewStatuses[status] || reviewStatuses.open
    : submissionStatuses[status] || submissionStatuses.draft;

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

function employeeName(employee) {
  const name = `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim();
  return name || employee?.email || 'Unbekannt';
}

function itemName(item) {
  return item?.isCustomBenefit ? item.customTitle : item?.benefit?.title;
}

function employeeFeedbackInfo(submission) {
  if (!submission) return null;
  const reason = submission.needsInfoReason || submission.adminComment;

  const map = {
    draft: {
      title: 'Mitarbeiteransicht',
      text: 'Der Mitarbeitende sieht aktuell einen bearbeitbaren Entwurf.',
      className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
    },
    submitted: {
      title: 'Mitarbeiteransicht',
      text: 'Der Mitarbeitende sieht aktuell: HR prüft deine Einreichung, du musst im Moment nichts tun.',
      className: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100',
    },
    needs_info: {
      title: 'Mitarbeiteransicht',
      text: `Der Mitarbeitende sieht aktuell: Unterlagen fehlen${reason ? ` - ${reason}` : ''}.`,
      className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100',
    },
    approved: {
      title: 'Mitarbeiteransicht',
      text: 'Der Mitarbeitende sieht aktuell: Genehmigt, die Benefits sind bestätigt.',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100',
    },
    rejected: {
      title: 'Mitarbeiteransicht',
      text: `Der Mitarbeitende sieht aktuell: Abgelehnt${reason ? ` - ${reason}` : ''}.`,
      className: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-100',
    },
  };

  return map[submission.status] || map.draft;
}

const HrDashboard = () => {
  const [submissions, setSubmissions] = useState([]);
  const [years, setYears] = useState([]);
  const [queue, setQueue] = useState('open');
  const [year, setYear] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reviewNotes, setReviewNotes] = useState({});
  const [decisionReason, setDecisionReason] = useState('');
  const [savingAction, setSavingAction] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [expandedNoteId, setExpandedNoteId] = useState(null);

  const loadSubmissions = async ({ silent = false } = {}) => {
    if (!silent) setLoadingList(true);
    try {
      const params = new URLSearchParams({ queue });
      if (year !== 'all') params.set('year', year);
      if (status !== 'all') params.set('status', status);
      if (search.trim()) params.set('q', search.trim());

      const res = await apiServerClient.fetch(`/hr/submissions?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'HR-Daten konnten nicht geladen werden.');
      }

      setSubmissions(data.submissions || []);
      setYears(data.years || []);
      const nextSelected = selectedId && (silent || (data.submissions || []).some((item) => item.id === selectedId))
        ? selectedId
        : data.submissions?.[0]?.id || null;
      setSelectedId(nextSelected);
    } catch (error) {
      toast.error(error.message || 'HR-Daten konnten nicht geladen werden.');
    } finally {
      if (!silent) setLoadingList(false);
    }
  };

  const loadDetail = async (id = selectedId, { silent = false } = {}) => {
    if (!id) {
      setDetail(null);
      return;
    }

    if (!silent) setLoadingDetail(true);
    try {
      const res = await apiServerClient.fetch(`/hr/submissions/detail?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Einreichung konnte nicht geladen werden.');
      }

      setDetail(data.submission);
      setDecisionReason('');
      setReviewNotes(
        Object.fromEntries((data.submission?.selectedBenefits || []).map((item) => [item.id, item.hrReviewNote || '']))
      );
    } catch (error) {
      toast.error(error.message || 'Einreichung konnte nicht geladen werden.');
    } finally {
      if (!silent) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, [queue, year, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadSubmissions();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const selectedSummary = useMemo(
    () => submissions.find((item) => item.id === selectedId),
    [selectedId, submissions]
  );

  const allChecked = detail?.selectedBenefits?.length
    ? detail.selectedBenefits.every((item) => item.hrReviewStatus === 'checked')
    : false;
  const employeeFeedback = employeeFeedbackInfo(detail);
  const expandedNoteItem = detail?.selectedBenefits?.find((item) => item.id === expandedNoteId);

  const attachmentUrl = (attachment) => {
    const params = new URLSearchParams({ id: attachment.id });
    const token = localStorage.getItem('backend_token');
    if (token) params.set('token', token);
    return `${API_SERVER_URL}/attachments/file?${params.toString()}`;
  };

  const refreshCurrent = async ({ preserveScroll = false, silent = false } = {}) => {
    const scrollPosition = preserveScroll ? { x: window.scrollX, y: window.scrollY } : null;
    await Promise.all([
      loadSubmissions({ silent }),
      loadDetail(selectedId, { silent }),
    ]);
    if (scrollPosition) {
      window.requestAnimationFrame(() => window.scrollTo(scrollPosition.x, scrollPosition.y));
    }
  };

  const reviewBenefit = async (selectedBenefitId, nextStatus) => {
    const reviewedItem = detail?.selectedBenefits?.find((item) => item.id === selectedBenefitId);
    const statusLabel = reviewStatuses[nextStatus]?.label || nextStatus;
    setSavingAction(`${selectedBenefitId}-${nextStatus}`);
    try {
      const res = await apiServerClient.fetch('/hr/selected-benefit/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedBenefitId,
          status: nextStatus,
          note: reviewNotes[selectedBenefitId] || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Prüfstatus konnte nicht gespeichert werden.');
      }
      const actionText = `${itemName(reviewedItem) || 'Benefit'} steht jetzt auf "${statusLabel}".`;
      setLastAction({
        title: 'Prüfstatus gespeichert',
        text: actionText,
        className: nextStatus === 'rejected'
          ? 'border-red-200 bg-red-50 text-red-800'
          : nextStatus === 'needs_info'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800',
      });
      toast.success('Prüfstatus gespeichert.', { description: actionText });
      await refreshCurrent({ preserveScroll: true, silent: true });
    } catch (error) {
      toast.error(error.message || 'Prüfstatus konnte nicht gespeichert werden.');
    } finally {
      setSavingAction(null);
    }
  };

  const decideSubmission = async (decision) => {
    if (decision !== 'approved' && !decisionReason.trim()) {
      toast.error('Bitte eine Begründung angeben.');
      return;
    }

    setSavingAction(`decision-${decision}`);
    try {
      const res = await apiServerClient.fetch('/hr/submissions/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: detail.id,
          decision,
          reason: decisionReason,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Entscheidung konnte nicht gespeichert werden.');
      }
      const actionByDecision = {
        approved: {
          title: 'Einreichung genehmigt',
          text: `${employeeName(detail?.employee)} sieht jetzt, dass die Benefits genehmigt sind.`,
          className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        },
        needs_info: {
          title: 'Unterlagen angefordert',
          text: `${employeeName(detail?.employee)} sieht jetzt deine Rückfrage und kann nachbessern.`,
          className: 'border-amber-200 bg-amber-50 text-amber-900',
        },
        rejected: {
          title: 'Einreichung abgelehnt',
          text: `${employeeName(detail?.employee)} sieht jetzt die Ablehnung mit Begründung.`,
          className: 'border-red-200 bg-red-50 text-red-800',
        },
      };
      const action = actionByDecision[decision];
      setLastAction(action);
      toast.success(action?.title || data.message || 'Entscheidung gespeichert.', { description: action?.text });
      await refreshCurrent({ preserveScroll: true, silent: true });
    } catch (error) {
      toast.error(error.message || 'Entscheidung konnte nicht gespeichert werden.');
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <>
      <Helmet>
        <title>HR-Bereich - Tchibo Benefitbar</title>
      </Helmet>

      <Header />

      <main className="min-h-[calc(100vh-4rem)] bg-slate-100 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">HR-Bereich</p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Einreichungen prüfen</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Queue, Nachweise, Checklist und Entscheidungen für Benefitbar.</p>
            </div>
            <Button onClick={() => refreshCurrent()} variant="outline" className="border-blue-200 bg-white text-blue-800 hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-200">
              <RefreshCw className="mr-2 h-4 w-4" />
              Aktualisieren
            </Button>
          </div>

          {lastAction && (
            <div className={`mb-6 rounded-lg border p-4 text-sm shadow-sm ${lastAction.className}`}>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">{lastAction.title}</p>
                  <p className="mt-1 leading-relaxed">{lastAction.text}</p>
                </div>
              </div>
            </div>
          )}

          <section className="mb-6 grid gap-3 rounded-lg border border-blue-100 bg-white p-4 shadow-sm dark:border-blue-900/40 dark:bg-slate-900 lg:grid-cols-[10rem_10rem_12rem_minmax(0,1fr)]">
            <Select value={queue} onValueChange={setQueue}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Offene Queue</SelectItem>
                <SelectItem value="all">Alle</SelectItem>
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Jahre</SelectItem>
                {years.map((item) => (
                  <SelectItem key={item} value={String(item)}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="submitted">In Prüfung</SelectItem>
                <SelectItem value="needs_info">Unterlagen fehlen</SelectItem>
                <SelectItem value="rejected">Abgelehnt</SelectItem>
                <SelectItem value="approved">Genehmigt</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name oder E-Mail suchen"
                className="bg-background pl-9"
              />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[25rem_minmax(0,1fr)]">
            <section className="rounded-lg border border-blue-100 bg-white shadow-sm dark:border-blue-900/40 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-blue-50 p-4 dark:border-blue-900/40">
                <h2 className="text-lg font-semibold">Queue</h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">{submissions.length}</span>
              </div>
              <div className="max-h-[42rem] overflow-auto">
                {loadingList ? (
                  <div className="p-6 text-sm text-slate-500">Lädt …</div>
                ) : submissions.length ? submissions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`block w-full border-b border-slate-100 p-4 text-left transition hover:bg-blue-50/70 dark:border-slate-800 dark:hover:bg-blue-950/20 ${
                      item.id === selectedId ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{employeeName(item.employee)}</p>
                        <p className="truncate text-xs text-slate-500">{item.employee?.email}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Benefit-Jahr {item.benefitYear?.year}</span>
                      <span>{item.checkedCount}/{item.selectedCount} geprüft</span>
                    </div>
                    <div className="mt-2 text-sm font-bold text-blue-800 dark:text-blue-200">{currency.format(item.totalSelectedAmount || 0)}</div>
                  </button>
                )) : (
                  <div className="p-8 text-center text-sm text-slate-500">Keine Einreichungen gefunden.</div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm dark:border-blue-900/40 dark:bg-slate-900">
              {!selectedSummary && !detail ? (
                <div className="flex min-h-96 items-center justify-center text-sm text-slate-500">Wähle eine Einreichung aus.</div>
              ) : loadingDetail ? (
                <div className="flex min-h-96 items-center justify-center text-sm text-slate-500">Details laden …</div>
              ) : detail && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={detail.status} />
                        <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">Benefit-Jahr {detail.benefitYear?.year}</span>
                      </div>
                      <h2 className="text-2xl font-bold">{employeeName(detail.employee)}</h2>
                      <p className="text-sm text-slate-500">{detail.employee?.email}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-slate-500">Gesamt</p>
                        <p className="font-bold">{currency.format(detail.totalSelectedAmount || 0)}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-slate-500">Unternehmen</p>
                        <p className="font-bold text-emerald-700">{currency.format(detail.coveredByCompanyAmount || 0)}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-slate-500">Eigenanteil</p>
                        <p className="font-bold text-red-700">{currency.format(detail.employeeOwnContributionAmount || 0)}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-slate-500">Monatlich</p>
                        <p className="font-bold">{currency.format(detail.monthlyPayoutAmount || 0)}</p>
                      </div>
                    </div>
                  </div>

                  {employeeFeedback && (
                    <div className={`rounded-lg border p-4 text-sm ${employeeFeedback.className}`}>
                      <p className="font-semibold">{employeeFeedback.title}</p>
                      <p className="mt-1 leading-relaxed">{employeeFeedback.text}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {detail.selectedBenefits.map((item) => (
                      <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold">{item.isCustomBenefit ? item.customTitle : item.benefit?.title}</h3>
                              <StatusBadge status={item.hrReviewStatus || 'open'} type="review" />
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                              {currency.format(item.requestedAmount)} · Unternehmen {currency.format(item.coveredAmount)}
                              {item.ownContributionAmount > 0 ? ` · Eigenanteil ${currency.format(item.ownContributionAmount)}` : ''}
                            </p>
                            {item.isCustomBenefit && item.customDescription && (
                              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.customDescription}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => reviewBenefit(item.id, 'checked')} disabled={savingAction === `${item.id}-checked`}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                              Erledigt
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => reviewBenefit(item.id, 'needs_info')} disabled={savingAction === `${item.id}-needs_info`}>
                              <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" />
                              Rückfrage
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => reviewBenefit(item.id, 'rejected')} disabled={savingAction === `${item.id}-rejected`}>
                              <XCircle className="mr-2 h-4 w-4 text-red-600" />
                              Ablehnen
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
                            <p className="mb-2 text-xs font-bold uppercase text-slate-500">Nachweise</p>
                            {item.attachments?.length ? (
                              <div className="space-y-2">
                                {item.attachments.map((attachment) => (
                                  <a
                                    key={attachment.id}
                                    href={attachmentUrl(attachment)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-200"
                                  >
                                    <FileText className="h-4 w-4" />
                                    <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500">Keine Nachweise vorhanden.</p>
                            )}
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-bold uppercase text-slate-500">HR-Notiz</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setExpandedNoteId(item.id)}
                                className="h-7 px-2 text-xs text-blue-800 hover:bg-blue-50 hover:text-blue-900 dark:text-blue-200 dark:hover:bg-blue-950/30"
                              >
                                <Maximize2 className="mr-1 h-3.5 w-3.5" />
                                Groß
                              </Button>
                            </div>
                            <Textarea
                              value={reviewNotes[item.id] || ''}
                              onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                              placeholder="Interne Notiz oder Rückfrage"
                              className="min-h-28 bg-background"
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <div className="mb-3 flex items-center gap-2 font-semibold text-blue-950 dark:text-blue-100">
                      <ClipboardCheck className="h-5 w-5" />
                      Entscheidung
                    </div>
                    <Textarea
                      value={decisionReason}
                      onChange={(event) => setDecisionReason(event.target.value)}
                      placeholder="Begründung für Rückfrage oder Ablehnung"
                      className="mb-3 bg-white dark:bg-slate-900"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button onClick={() => decideSubmission('approved')} disabled={!allChecked || savingAction === 'decision-approved'} className="bg-emerald-700 text-white hover:bg-emerald-800">
                        Genehmigen
                      </Button>
                      <Button onClick={() => decideSubmission('needs_info')} disabled={savingAction === 'decision-needs_info'} className="bg-amber-500 text-slate-950 hover:bg-amber-600">
                        Unterlagen anfordern
                      </Button>
                      <Button onClick={() => decideSubmission('rejected')} disabled={savingAction === 'decision-rejected'} className="bg-red-600 text-white hover:bg-red-700">
                        Ablehnen
                      </Button>
                    </div>
                    {!allChecked && (
                      <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-300">Genehmigen ist möglich, sobald alle Benefits als erledigt markiert sind.</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <Dialog open={Boolean(expandedNoteId)} onOpenChange={(open) => {
        if (!open) setExpandedNoteId(null);
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>HR-Notiz bearbeiten</DialogTitle>
            <DialogDescription>
              {itemName(expandedNoteItem) || 'Benefit'} · Die Notiz wird beim nächsten Prüfstatus mitgespeichert.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={expandedNoteId ? (reviewNotes[expandedNoteId] || '') : ''}
            onChange={(event) => {
              const value = event.target.value;
              setReviewNotes((current) => ({ ...current, [expandedNoteId]: value }));
            }}
            placeholder="Interne Notiz, Rückfrage oder Ablehnungsgrund ausführlich formulieren"
            className="min-h-[22rem] bg-background text-base leading-relaxed"
          />
          <DialogFooter>
            <Button type="button" onClick={() => setExpandedNoteId(null)} className="bg-blue-700 text-white hover:bg-blue-800">
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HrDashboard;
