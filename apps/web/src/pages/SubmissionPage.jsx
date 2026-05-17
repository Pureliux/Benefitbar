
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext.jsx';
import Header from '@/components/Header.jsx';
import pb from '@/lib/pocketbaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';

const SubmissionPage = () => {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const [benefitYear, setBenefitYear] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [selectedBenefits, setSelectedBenefits] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const yearRecord = await pb.collection('benefitYears').getFirstListItem(
          'status="open"',
          { $autoCancel: false }
        );
        setBenefitYear(yearRecord);

        const submissionRecord = await pb.collection('submissions').getFirstListItem(
          `employeeId="${employee.id}" && benefitYearId="${yearRecord.id}"`,
          { expand: 'benefitYearId', $autoCancel: false }
        );
        setSubmission(submissionRecord);

        const benefitsList = await pb.collection('selectedBenefits').getFullList({
          filter: `submissionId="${submissionRecord.id}"`,
          expand: 'benefitId',
          $autoCancel: false
        });
        setSelectedBenefits(benefitsList);

        const attachmentsList = await pb.collection('attachments').getFullList({
          filter: `employeeId="${employee.id}"`,
          $autoCancel: false
        });
        setAttachments(attachmentsList);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (employee) {
      fetchData();
    }
  }, [employee]);

  const handleFileUpload = async (selectedBenefitId, file) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('selectedBenefitId', selectedBenefitId);
      formData.append('employeeId', employee.id);
      formData.append('fileName', file.name);
      formData.append('fileType', file.type);

      await pb.collection('attachments').create(formData, { $autoCancel: false });

      const attachmentsList = await pb.collection('attachments').getFullList({
        filter: `employeeId="${employee.id}"`,
        $autoCancel: false
      });
      setAttachments(attachmentsList);

      toast.success('Datei hochgeladen');
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await pb.collection('submissions').update(submission.id, {
        status: 'draft'
      }, { $autoCancel: false });

      toast.success('Als Entwurf gespeichert');
    } catch (err) {
      console.error('Failed to save draft:', err);
      toast.error('Fehler beim Speichern');
    }
  };

  const handleSubmit = async () => {
    if (!confirmed && submission.employeeOwnContributionAmount > 0) {
      toast.error('Bitte bestätige die Eigenanteil-Bedingung');
      return;
    }

    const missingReceipts = selectedBenefits.filter(sb => {
      const benefit = sb.expand?.benefitId;
      if (benefit?.receiptRequired) {
        return !attachments.some(att => att.selectedBenefitId === sb.id);
      }
      return false;
    });

    if (missingReceipts.length > 0) {
      toast.error('Bitte lade alle erforderlichen Nachweise hoch');
      return;
    }

    try {
      await pb.collection('submissions').update(submission.id, {
        status: 'submitted',
        submittedAt: new Date().toISOString()
      }, { $autoCancel: false });

      toast.success('Einreichung erfolgreich eingereicht');
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to submit:', err);
      toast.error('Fehler beim Einreichen');
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-[calc(100vh-4rem)] bg-background flex items-center justify-center">
          <div className="text-foreground text-lg">Lädt...</div>
        </div>
      </>
    );
  }

  if (!submission) {
    return (
      <>
        <Header />
        <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-card border border-border shadow-sm rounded-xl p-8 text-center">
              <h2 className="text-2xl font-bold text-card-foreground mb-4">Keine Einreichung vorhanden</h2>
              <p className="text-muted-foreground mb-6">Wähle zuerst Benefits aus.</p>
              <Button
                onClick={() => navigate('/benefits')}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Benefits auswählen
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const chartData = [
    ...selectedBenefits.map((sb) => ({
      name: sb.isCustomBenefit ? sb.customTitle : sb.expand?.benefitId?.title,
      value: sb.coveredAmount || 0,
      color: 'hsl(var(--primary))'
    })),
    { name: 'Verbleibendes Budget', value: submission.remainingBudget || 0, color: 'hsl(var(--muted))' }
  ];

  if (submission.employeeOwnContributionAmount > 0) {
    chartData.push({ 
      name: 'Eigenanteil', 
      value: submission.employeeOwnContributionAmount, 
      color: 'hsl(var(--destructive))' 
    });
  }

  const isLocked = submission.status !== 'draft' && submission.status !== 'needs_info';

  return (
    <>
      <Helmet>
        <title>Meine Einreichung - Tchibo Benefit-Bar</title>
        <meta name="description" content="Deine Benefit-Einreichung" />
      </Helmet>

      <Header />

      <div className="min-h-[calc(100vh-4rem)] bg-background py-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-8">Meine Einreichung</h1>

          {submission.status === 'needs_info' && submission.needsInfoReason && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-4">
                <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-foreground font-semibold mb-2">Zusätzliche Informationen benötigt</h3>
                  <p className="text-muted-foreground text-sm">{submission.needsInfoReason}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
            <h2 className="text-2xl font-bold text-card-foreground mb-6">Budget-Übersicht</h2>
            {selectedBenefits.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}€`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--card-foreground))'
                    }} 
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-background rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-sm mb-1">Gesamt ausgewählt</p>
                <p className="text-2xl font-bold text-foreground">{submission.totalSelectedAmount} €</p>
              </div>
              <div className="bg-background rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-sm mb-1">Vom Unternehmen gedeckt</p>
                <p className="text-2xl font-bold text-success">{submission.coveredByCompanyAmount} €</p>
              </div>
              <div className="bg-background rounded-lg p-4 border border-border">
                <p className="text-muted-foreground text-sm mb-1">Eigenanteil</p>
                <p className="text-2xl font-bold text-destructive">{submission.employeeOwnContributionAmount} €</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
            <h2 className="text-2xl font-bold text-card-foreground mb-6">Ausgewählte Benefits</h2>
            <div className="space-y-4">
              {selectedBenefits.map((sb) => {
                const benefit = sb.expand?.benefitId;
                const hasAttachment = attachments.some(att => att.selectedBenefitId === sb.id);
                const needsReceipt = benefit?.receiptRequired;

                return (
                  <div key={sb.id} className="bg-background rounded-lg p-4 border border-border">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">
                          {sb.isCustomBenefit ? sb.customTitle : benefit?.title}
                        </h4>
                        {sb.isCustomBenefit && sb.customDescription && (
                          <p className="text-sm text-muted-foreground">{sb.customDescription}</p>
                        )}
                      </div>
                      <span className="text-primary font-bold">{sb.requestedAmount} €</span>
                    </div>

                    <div className="text-sm text-muted-foreground space-y-1 mb-4">
                      <p>Vom Unternehmen gedeckt: <span className="text-success font-medium">{sb.coveredAmount} €</span></p>
                      {sb.ownContributionAmount > 0 && (
                        <p>Eigenanteil: <span className="text-destructive font-medium">{sb.ownContributionAmount} €</span></p>
                      )}
                      <p>Auszahlung: {sb.payoutMode === 'monthly_12' ? 'Monatlich (12x)' : 'Einmalig'}</p>
                    </div>

                    {needsReceipt && (
                      <div className="border-t border-border pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-foreground">Erforderlicher Nachweis</span>
                          {hasAttachment ? (
                            <div className="flex items-center gap-2 text-success bg-success/10 px-2 py-1 rounded">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs font-medium">Hochgeladen</span>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded">Nachweis fehlt</span>
                          )}
                        </div>
                        {!isLocked && (
                          <label className="block mt-2">
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.docx"
                              onChange={(e) => {
                                if (e.target.files[0]) {
                                  handleFileUpload(sb.id, e.target.files[0]);
                                }
                              }}
                              className="hidden"
                              disabled={uploading}
                            />
                            <div className="flex items-center justify-center gap-2 px-4 py-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors border border-dashed border-border hover:border-primary">
                              <Upload className="h-4 w-4 text-foreground" />
                              <span className="text-sm font-medium text-foreground">
                                {uploading ? 'Lädt hoch...' : 'Klicken zum Hochladen'}
                              </span>
                            </div>
                          </label>
                        )}
                        {hasAttachment && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {attachments.find(att => att.selectedBenefitId === sb.id)?.fileName}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {selectedBenefits.length === 0 && (
                <p className="text-muted-foreground text-center py-4">Keine Benefits ausgewählt.</p>
              )}
            </div>
          </div>

          {!isLocked && selectedBenefits.length > 0 && (
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
              {submission.employeeOwnContributionAmount > 0 && (
                <div className="flex items-start gap-3 mb-6 bg-muted p-4 rounded-lg">
                  <Checkbox
                    id="confirm"
                    checked={confirmed}
                    onCheckedChange={setConfirmed}
                    className="mt-1"
                  />
                  <label htmlFor="confirm" className="text-sm text-card-foreground cursor-pointer leading-relaxed">
                    Ich bestätige hiermit verbindlich, dass ich den Eigenanteil von <span className="font-bold">{submission.employeeOwnContributionAmount} €</span> selbst trage.
                  </label>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={handleSaveDraft}
                  variant="outline"
                  className="w-full sm:w-auto border-border text-foreground hover:bg-muted"
                >
                  Als Entwurf speichern
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={submission.employeeOwnContributionAmount > 0 && !confirmed}
                >
                  Verbindlich einreichen
                </Button>
              </div>
            </div>
          )}

          {isLocked && (
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 transition-colors duration-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
                <div className="p-3 bg-success/10 rounded-full shrink-0">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-card-foreground">Einreichung abgeschlossen</h3>
                  {submission.submittedAt && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Eingereicht am {format(new Date(submission.submittedAt), 'dd.MM.yyyy')}
                    </p>
                  )}
                </div>
              </div>
              {submission.adminComment && (
                <div className="bg-background rounded-lg p-4 border border-border mt-4">
                  <p className="text-sm font-semibold text-foreground mb-2">Kommentar der Verwaltung:</p>
                  <p className="text-sm text-muted-foreground">{submission.adminComment}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SubmissionPage;
