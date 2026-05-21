import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, FileText, Send, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import apiServerClient, { API_SERVER_URL } from '@/lib/apiServerClient';
import Header from '@/components/Header.jsx';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const currency = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });

const statusSteps = [
  { key: 'draft', label: 'Entwurf' },
  { key: 'submitted', label: 'In Prüfung' },
  { key: 'approved', label: 'Genehmigt' },
];

const stepVisuals = {
  done: {
    circle: 'bg-[#719C6F] text-white',
    text: 'text-[#315B30] dark:text-[#A9D0A6]',
  },
  active: {
    circle: 'bg-[#EDC948] text-[#3B2F0D]',
    text: 'text-[#8B7138] dark:text-[#EDD38E]',
  },
  pending: {
    circle: 'bg-muted text-muted-foreground',
    text: 'text-muted-foreground',
  },
  error: {
    circle: 'bg-[#EA5153] text-white',
    text: 'text-[#EA5153]',
  },
};

function statusInfo(status) {
  const map = {
    draft: { label: 'Entwurf', tone: 'bg-[#EDC948]/20 text-[#8B7138]', text: 'Deine Auswahl ist in Bearbeitung und wurde noch nicht final eingereicht.' },
    submitted: { label: 'In Prüfung', tone: 'bg-[#C0A468]/15 text-[#8B7138]', text: 'Deine Einreichung liegt bei HR/Prozessmanagement.' },
    needs_info: { label: 'Unterlagen fehlen', tone: 'bg-[#EA5153]/15 text-[#EA5153]', text: 'Bitte lade die angeforderten Unterlagen nach.' },
    approved: { label: 'Genehmigt', tone: 'bg-[#719C6F]/15 text-[#719C6F]', text: 'Deine Einreichung wurde genehmigt.' },
    rejected: { label: 'Abgelehnt', tone: 'bg-[#EA5153]/15 text-[#EA5153]', text: 'Deine Einreichung wurde abgelehnt.' },
    auto_assigned: { label: 'Automatisch zugewiesen', tone: 'bg-muted text-muted-foreground', text: 'Es wurde eine automatische Auswahl erstellt.' },
  };
  return map[status] || map.draft;
}

function statusStepState(status, stepKey) {
  const stateByStatus = {
    draft: { draft: 'active', submitted: 'pending', approved: 'pending' },
    submitted: { draft: 'done', submitted: 'active', approved: 'pending' },
    needs_info: { draft: 'done', submitted: 'active', approved: 'pending' },
    approved: { draft: 'done', submitted: 'done', approved: 'done' },
    rejected: { draft: 'done', submitted: 'error', approved: 'pending' },
    auto_assigned: { draft: 'active', submitted: 'pending', approved: 'pending' },
  };

  return stateByStatus[status]?.[stepKey] || stateByStatus.draft[stepKey];
}

function StepIcon({ state, index }) {
  if (state === 'done') {
    return <CheckCircle2 className="h-5 w-5" />;
  }
  if (state === 'error') {
    return <AlertCircle className="h-5 w-5" />;
  }
  if (state === 'active') {
    return <Clock3 className="h-5 w-5" />;
  }
  return index + 1;
}

const SubmissionPage = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await apiServerClient.fetch('/benefits/overview');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Status konnte nicht geladen werden.');
      }
      setOverview(data);
    } catch (error) {
      toast.error(error.message || 'Status konnte nicht geladen werden.');
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

  const handleSaveDraft = async () => {
    try {
      const res = await apiServerClient.fetch('/submission/save-draft', { method: 'POST' });
      await updateFromResponse(res);
      toast.success('Entwurf wurde gespeichert.');
    } catch (error) {
      toast.error(error.message || 'Entwurf konnte nicht gespeichert werden.');
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await apiServerClient.fetch('/submission/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmOwnContribution: confirmed }),
      });
      await updateFromResponse(res);
      toast.success('Einreichung wurde übermittelt.');
    } catch (error) {
      toast.error(error.message || 'Einreichung konnte nicht übermittelt werden.');
    } finally {
      setSubmitting(false);
    }
  };

  const submission = overview?.submission;
  const windowInfo = overview?.window || {};
  const selectedBenefits = overview?.selectedBenefits || [];
  const attachments = overview?.attachments || [];
  const status = statusInfo(submission?.status);
  const statusEditable = submission && ['draft', 'needs_info', 'rejected'].includes(submission.status);
  const canEdit = Boolean(statusEditable && (windowInfo.canEdit ?? true));
  const canSubmit = Boolean(canEdit && (windowInfo.canSubmit ?? true));
  const isLocked = !canEdit;
  const rejectionReason = submission?.adminComment || submission?.needsInfoReason;

  const attachmentsBySelectedId = useMemo(() => {
    const map = new Map();
    attachments.forEach((attachment) => {
      const key = attachment.selectedBenefitId;
      const list = map.get(key) || [];
      list.push(attachment);
      map.set(key, list);
    });
    return map;
  }, [attachments]);

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
        <title>Status - Tchibo BenefitBar</title>
        <meta name="description" content="Status deiner Benefit-Bar Einreichung" />
      </Helmet>

      <Header />

      <main className="benefit-ambient-bg min-h-[calc(100vh-4rem)] py-8 text-[#222222] transition-colors dark:text-[#F7F2E8]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-[#C0A468]">Einreichung</p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Status</h1>
              <p className="mt-2 text-sm text-muted-foreground">Hier prüfst du deine Auswahl, lädst Nachweise hoch und reichst final ein.</p>
            </div>
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>{status.label}</span>
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

          <section className="mb-8 rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              {statusSteps.map((step, index) => {
                const stepState = statusStepState(submission?.status, step.key);
                const visual = stepVisuals[stepState];
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${visual.circle}`}>
                      <StepIcon state={stepState} index={index} />
                    </div>
                    <div>
                      <p className={`font-semibold ${visual.text}`}>{step.label}</p>
                      <p className="text-xs text-muted-foreground">{index === 0 ? 'Auswahl bearbeiten' : index === 1 ? 'HR prüft' : 'Abgeschlossen'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{status.text}</p>
          </section>

          {submission?.status === 'rejected' && (
            <div className="mb-8 flex items-start gap-3 rounded-lg border border-[#EA5153]/30 bg-[#EA5153]/10 p-4 text-[#EA5153]">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <p className="text-sm font-medium">
                Abgelehnt: {rejectionReason || 'Keine Begründung hinterlegt.'} Bitte bearbeiten und erneut einreichen.
              </p>
            </div>
          )}

          <section className="mb-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Gesamt</p>
              <p className="mt-1 text-2xl font-bold">{currency.format(submission?.totalSelectedAmount || 0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Unternehmen</p>
              <p className="mt-1 text-2xl font-bold text-[#719C6F]">{currency.format(submission?.coveredByCompanyAmount || 0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Eigenanteil</p>
              <p className="mt-1 text-2xl font-bold text-[#EA5153]">{currency.format(submission?.employeeOwnContributionAmount || 0)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Monatlich</p>
              <p className="mt-1 text-2xl font-bold">{currency.format(submission?.monthlyPayoutAmount || 0)}</p>
            </div>
          </section>

          <section className="mb-8 rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Ausgewählte Benefits</h2>
              <Button variant="outline" onClick={() => navigate('/benefits')} disabled={isLocked}>
                Auswahl bearbeiten
              </Button>
            </div>

            {selectedBenefits.length ? (
              <div className="space-y-4">
                {selectedBenefits.map((item) => {
                  const itemAttachments = attachmentsBySelectedId.get(item.id) || [];
                  const needsReceipt = item.benefit?.receiptRequired || item.isCustomBenefit;
                  return (
                    <article key={item.id} className="rounded-lg border border-border bg-background p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="font-semibold">{item.isCustomBenefit ? item.customTitle : item.benefit?.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {currency.format(item.requestedAmount)} · Unternehmen {currency.format(item.coveredAmount)}
                            {item.ownContributionAmount > 0 ? ` · Eigenanteil ${currency.format(item.ownContributionAmount)}` : ''}
                          </p>
                        </div>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{item.status === 'pending_hr_review' ? 'In Prüfung' : 'Ausgewählt'}</span>
                      </div>

                      {needsReceipt && (
                        <div className="mt-4 rounded-lg border border-dashed border-border p-4">
                          <div className="mb-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Nachweis erforderlich</span>
                            </div>
                            {itemAttachments.length ? (
                              <span className="text-xs font-semibold text-[#719C6F]">{itemAttachments.length} Nachweis{itemAttachments.length === 1 ? '' : 'e'} hochgeladen</span>
                            ) : (
                              <span className="text-xs font-semibold text-[#EA5153]">Noch nicht hochgeladen</span>
                            )}
                          </div>
                          {itemAttachments.length > 0 && (
                            <div className="mb-3 space-y-2">
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
                                  {!isLocked && (
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
                          {!isLocked && (
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-muted px-4 py-3 text-sm font-medium transition hover:bg-muted/80">
                              <Upload className="h-4 w-4" />
                              {uploadingId === item.id ? 'Lädt hoch …' : 'Nachweis hochladen'}
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.docx"
                                className="hidden"
                                disabled={uploadingId === item.id}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) handleFileUpload(item.id, file);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                <Clock3 className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Keine Einreichung vorhanden</h3>
                <p className="mx-auto mt-2 text-sm text-muted-foreground">Wähle zuerst Benefits aus, danach kannst du sie hier final einreichen.</p>
                <Button onClick={() => navigate('/benefits')} className="mt-5 bg-[#C0A468] text-white hover:bg-[#A98D52]">
                  Benefits auswählen
                </Button>
              </div>
            )}
          </section>

          {canEdit && selectedBenefits.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
              {(submission?.employeeOwnContributionAmount || 0) > 0 && (
                <div className="mb-6 flex items-start gap-3 rounded-lg bg-[#EA5153]/10 p-4">
                  <Checkbox id="confirm-own" checked={confirmed} onCheckedChange={setConfirmed} className="mt-1" />
                  <label htmlFor="confirm-own" className="cursor-pointer text-sm leading-relaxed">
                    Ich bestätige, dass ein Eigenanteil von <strong>{currency.format(submission.employeeOwnContributionAmount)}</strong> von mir selbst getragen wird.
                  </label>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="outline" onClick={handleSaveDraft}>Als Entwurf speichern</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting || ((submission?.employeeOwnContributionAmount || 0) > 0 && !confirmed)}
                  className="bg-[#C0A468] text-white hover:bg-[#A98D52]"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? 'Wird eingereicht …' : 'Final einreichen'}
                </Button>
              </div>
            </section>
          )}

          {submission?.status === 'needs_info' && submission?.needsInfoReason && (
            <div className="mt-8 flex items-start gap-3 rounded-lg border border-[#EA5153]/30 bg-[#EA5153]/10 p-4 text-[#EA5153]">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <p className="text-sm font-medium">{submission.needsInfoReason}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default SubmissionPage;
