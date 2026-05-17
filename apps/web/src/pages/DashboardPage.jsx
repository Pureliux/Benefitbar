
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext.jsx';
import Header from '@/components/Header.jsx';
import pb from '@/lib/pocketbaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Calendar, Euro, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const DashboardPage = () => {
  const { employee, isEligible } = useAuth();
  const navigate = useNavigate();
  const [benefitYear, setBenefitYear] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [selectedBenefits, setSelectedBenefits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const yearRecord = await pb.collection('benefitYears').getFirstListItem(
          'status="open"',
          { $autoCancel: false }
        );
        setBenefitYear(yearRecord);

        try {
          const submissionRecord = await pb.collection('submissions').getFirstListItem(
            `employeeId="${employee.id}" && benefitYearId="${yearRecord.id}"`,
            { $autoCancel: false }
          );
          setSubmission(submissionRecord);

          const benefits = await pb.collection('selectedBenefits').getFullList({
            filter: `submissionId="${submissionRecord.id}"`,
            expand: 'benefitId',
            $autoCancel: false
          });
          setSelectedBenefits(benefits);
        } catch (err) {
          setSubmission(null);
          setSelectedBenefits([]);
        }
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

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-foreground text-lg">Lädt...</div>
        </div>
      </>
    );
  }

  const totalBudget = benefitYear?.annualBudget || 1000;
  const selectedAmount = submission?.totalSelectedAmount || 0;
  const remainingBudget = totalBudget - selectedAmount;
  const ownContribution = submission?.employeeOwnContributionAmount || 0;

  const chartData = [
    ...selectedBenefits.map((sb) => ({
      name: sb.isCustomBenefit ? sb.customTitle : sb.expand?.benefitId?.title,
      value: sb.coveredAmount || 0,
      color: 'hsl(var(--primary))'
    })),
    { name: 'Verbleibendes Budget', value: remainingBudget, color: 'hsl(var(--muted))' }
  ];

  if (ownContribution > 0) {
    chartData.push({ name: 'Eigenanteil', value: ownContribution, color: 'hsl(var(--destructive))' });
  }

  const getStatusBadge = (status) => {
    const badges = {
      draft: { label: 'Entwurf', color: 'bg-muted text-muted-foreground border-transparent' },
      submitted: { label: 'Eingereicht', color: 'bg-primary text-primary-foreground border-transparent' },
      needs_info: { label: 'Info benötigt', color: 'bg-destructive text-destructive-foreground border-transparent' },
      approved: { label: 'Genehmigt', color: 'bg-success text-success-foreground border-transparent' },
      rejected: { label: 'Abgelehnt', color: 'bg-destructive text-destructive-foreground border-transparent' },
      auto_assigned: { label: 'Auto-zugewiesen', color: 'bg-secondary text-secondary-foreground border-transparent' }
    };
    const badge = badges[status] || badges.draft;
    return <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badge.color}`}>{badge.label}</span>;
  };

  return (
    <>
      <Helmet>
        <title>Dashboard - Tchibo Benefit-Bar</title>
        <meta name="description" content="Dein Benefit-Bar Dashboard" />
      </Helmet>

      <Header />

      <div className="min-h-[calc(100vh-4rem)] bg-background py-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Willkommen, {employee?.firstName}!
            </h1>
            <p className="text-muted-foreground">
              Benefit-Jahr {benefitYear?.year || '2026'}
            </p>
          </div>

          {!isEligible && (
            <div className="bg-card border border-border rounded-xl p-6 mb-8 flex items-start gap-4 shadow-sm">
              <AlertCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-card-foreground font-semibold mb-1">Noch nicht teilnahmeberechtigt</h3>
                <p className="text-muted-foreground text-sm">
                  Du bist ab {employee?.eligibleFrom ? format(new Date(employee.eligibleFrom), 'dd.MM.yyyy') : 'Unbekannt'} für die Benefit-Bar teilnahmeberechtigt.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 transition-colors duration-200">
              <div className="flex items-center gap-3 mb-2">
                <Euro className="h-5 w-5 text-primary" />
                <h3 className="text-muted-foreground text-sm font-medium">Gesamtbudget</h3>
              </div>
              <p className="text-3xl font-bold text-card-foreground">{totalBudget} €</p>
            </div>

            <div className="bg-card border border-border shadow-sm rounded-xl p-6 transition-colors duration-200">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="h-5 w-5 text-success" />
                <h3 className="text-muted-foreground text-sm font-medium">Bereits ausgewählt</h3>
              </div>
              <p className="text-3xl font-bold text-card-foreground">{selectedAmount} €</p>
            </div>

            <div className="bg-card border border-border shadow-sm rounded-xl p-6 transition-colors duration-200">
              <div className="flex items-center gap-3 mb-2">
                <Calendar className="h-5 w-5 text-secondary" />
                <h3 className="text-muted-foreground text-sm font-medium">Verbleibendes Budget</h3>
              </div>
              <p className="text-3xl font-bold text-card-foreground">{remainingBudget} €</p>
            </div>
          </div>

          {submission && (
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-card-foreground">Deine Auswahl</h2>
                {getStatusBadge(submission.status)}
              </div>

              {selectedBenefits.length > 0 && (
                <div className="mb-6">
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
                </div>
              )}

              <div className="space-y-4">
                {selectedBenefits.map((sb) => (
                  <div key={sb.id} className="bg-background rounded-lg p-4 border border-border">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-foreground">
                        {sb.isCustomBenefit ? sb.customTitle : sb.expand?.benefitId?.title}
                      </h4>
                      <span className="text-primary font-bold">{sb.requestedAmount} €</span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Vom Unternehmen gedeckt: <span className="text-success font-medium">{sb.coveredAmount} €</span></p>
                      {sb.ownContributionAmount > 0 && (
                        <p>Eigenanteil: <span className="text-destructive font-medium">{sb.ownContributionAmount} €</span></p>
                      )}
                      <p>Auszahlung: {sb.payoutMode === 'monthly_12' ? 'Monatlich (12x)' : 'Einmalig'}</p>
                    </div>
                  </div>
                ))}
              </div>

              {ownContribution > 0 && (
                <div className="mt-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold text-destructive">Hinweis:</span> Dein Eigenanteil beträgt <span className="font-bold">{ownContribution} €</span>. Dieser wird von dir selbst getragen.
                  </p>
                </div>
              )}

              {submission.status === 'submitted' && (
                <div className="mt-6 bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-sm text-foreground">
                    Deine Einreichung wurde am <span className="font-medium">{format(new Date(submission.submittedAt), 'dd.MM.yyyy')}</span> eingereicht und wird derzeit geprüft.
                  </p>
                </div>
              )}

              {submission.status === 'needs_info' && submission.needsInfoReason && (
                <div className="mt-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <p className="text-sm font-semibold text-destructive mb-2">Zusätzliche Informationen benötigt:</p>
                  <p className="text-sm text-foreground">{submission.needsInfoReason}</p>
                </div>
              )}

              {submission.status === 'approved' && submission.adminComment && (
                <div className="mt-6 bg-success/10 border border-success/20 rounded-lg p-4">
                  <p className="text-sm font-semibold text-success mb-2">Kommentar:</p>
                  <p className="text-sm text-foreground">{submission.adminComment}</p>
                </div>
              )}
            </div>
          )}

          {!submission && isEligible && (
            <div className="bg-card border border-border shadow-sm rounded-xl p-8 text-center transition-colors duration-200">
              <h3 className="text-xl font-bold text-card-foreground mb-4">Noch keine Benefits ausgewählt</h3>
              <p className="text-muted-foreground mb-6">
                Wähle deine Benefits aus und nutze dein Budget von {totalBudget} €.
              </p>
              <Button
                onClick={() => navigate('/benefits')}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Benefits auswählen
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DashboardPage;
