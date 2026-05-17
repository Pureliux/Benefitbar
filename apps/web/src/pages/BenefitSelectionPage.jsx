
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext.jsx';
import Header from '@/components/Header.jsx';
import pb from '@/lib/pocketbaseClient';
import { Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const BenefitSelectionPage = () => {
  const { employee, isEligible } = useAuth();
  const navigate = useNavigate();
  const [benefitYear, setBenefitYear] = useState(null);
  const [benefits, setBenefits] = useState([]);
  const [submission, setSubmission] = useState(null);
  const [selectedBenefits, setSelectedBenefits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customBenefit, setCustomBenefit] = useState({
    title: '',
    description: '',
    amount: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const yearRecord = await pb.collection('benefitYears').getFirstListItem(
          'status="open"',
          { $autoCancel: false }
        );
        setBenefitYear(yearRecord);

        const benefitsList = await pb.collection('benefits').getFullList({
          filter: `benefitYearId="${yearRecord.id}" && active=true`,
          sort: 'sortOrder',
          $autoCancel: false
        });
        setBenefits(benefitsList);

        try {
          const submissionRecord = await pb.collection('submissions').getFirstListItem(
            `employeeId="${employee.id}" && benefitYearId="${yearRecord.id}"`,
            { $autoCancel: false }
          );
          setSubmission(submissionRecord);

          const selectedList = await pb.collection('selectedBenefits').getFullList({
            filter: `submissionId="${submissionRecord.id}"`,
            $autoCancel: false
          });
          setSelectedBenefits(selectedList);
        } catch (err) {
          const newSubmission = await pb.collection('submissions').create({
            employeeId: employee.id,
            benefitYearId: yearRecord.id,
            status: 'draft',
            totalSelectedAmount: 0,
            coveredByCompanyAmount: 0,
            employeeOwnContributionAmount: 0,
            remainingBudget: yearRecord.annualBudget
          }, { $autoCancel: false });
          setSubmission(newSubmission);
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

  const calculateBudget = (amount) => {
    const budget = benefitYear?.annualBudget || 1000;
    const currentTotal = selectedBenefits.reduce((sum, sb) => sum + (sb.requestedAmount || 0), 0);
    const newTotal = currentTotal + amount;
    
    const covered = Math.min(newTotal, budget);
    const ownContribution = Math.max(0, newTotal - budget);
    
    return { covered, ownContribution };
  };

  const isBenefitSelected = (benefitId) => {
    return selectedBenefits.some(sb => sb.benefitId === benefitId);
  };

  const handleSelectBenefit = async (benefit) => {
    if (!submission || submission.status !== 'draft') {
      toast.error('Einreichung kann nicht bearbeitet werden');
      return;
    }

    try {
      const { covered, ownContribution } = calculateBudget(benefit.fixedAmount);
      
      await pb.collection('selectedBenefits').create({
        submissionId: submission.id,
        benefitId: benefit.id,
        isCustomBenefit: false,
        requestedAmount: benefit.fixedAmount,
        coveredAmount: Math.min(benefit.fixedAmount, benefitYear.annualBudget),
        ownContributionAmount: Math.max(0, benefit.fixedAmount - benefitYear.annualBudget),
        payoutMode: benefit.payoutMode,
        monthlyAmount: benefit.payoutMode === 'monthly_12' ? benefit.fixedAmount / 12 : 0,
        status: 'selected'
      }, { $autoCancel: false });

      const selectedList = await pb.collection('selectedBenefits').getFullList({
        filter: `submissionId="${submission.id}"`,
        $autoCancel: false
      });
      setSelectedBenefits(selectedList);

      const total = selectedList.reduce((sum, sb) => sum + sb.requestedAmount, 0);
      const coveredTotal = Math.min(total, benefitYear.annualBudget);
      const ownTotal = Math.max(0, total - benefitYear.annualBudget);

      await pb.collection('submissions').update(submission.id, {
        totalSelectedAmount: total,
        coveredByCompanyAmount: coveredTotal,
        employeeOwnContributionAmount: ownTotal,
        remainingBudget: benefitYear.annualBudget - coveredTotal
      }, { $autoCancel: false });

      toast.success('Benefit ausgewählt');
    } catch (err) {
      console.error('Failed to select benefit:', err);
      toast.error('Fehler beim Auswählen');
    }
  };

  const handleAddCustomBenefit = async () => {
    if (!customBenefit.title || !customBenefit.amount) {
      toast.error('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      const amount = parseFloat(customBenefit.amount);
      
      await pb.collection('selectedBenefits').create({
        submissionId: submission.id,
        isCustomBenefit: true,
        customTitle: customBenefit.title,
        customDescription: customBenefit.description,
        requestedAmount: amount,
        coveredAmount: Math.min(amount, benefitYear.annualBudget),
        ownContributionAmount: Math.max(0, amount - benefitYear.annualBudget),
        payoutMode: 'one_time',
        status: 'selected'
      }, { $autoCancel: false });

      const selectedList = await pb.collection('selectedBenefits').getFullList({
        filter: `submissionId="${submission.id}"`,
        $autoCancel: false
      });
      setSelectedBenefits(selectedList);

      const total = selectedList.reduce((sum, sb) => sum + sb.requestedAmount, 0);
      const coveredTotal = Math.min(total, benefitYear.annualBudget);
      const ownTotal = Math.max(0, total - benefitYear.annualBudget);

      await pb.collection('submissions').update(submission.id, {
        totalSelectedAmount: total,
        coveredByCompanyAmount: coveredTotal,
        employeeOwnContributionAmount: ownTotal,
        remainingBudget: benefitYear.annualBudget - coveredTotal
      }, { $autoCancel: false });

      setCustomBenefit({ title: '', description: '', amount: '' });
      toast.success('Eigener Benefit hinzugefügt');
    } catch (err) {
      console.error('Failed to add custom benefit:', err);
      toast.error('Fehler beim Hinzufügen');
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

  if (!isEligible) {
    return (
      <>
        <Header />
        <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-card border border-border shadow-sm rounded-xl p-8 text-center">
              <h2 className="text-2xl font-bold text-card-foreground mb-4">Noch nicht teilnahmeberechtigt</h2>
              <p className="text-muted-foreground">
                Du kannst Benefits auswählen, sobald du teilnahmeberechtigt bist.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const totalSelected = selectedBenefits.reduce((sum, sb) => sum + sb.requestedAmount, 0);
  const coveredAmount = Math.min(totalSelected, benefitYear?.annualBudget || 1000);
  const ownContribution = Math.max(0, totalSelected - (benefitYear?.annualBudget || 1000));

  return (
    <>
      <Helmet>
        <title>Benefits auswählen - Tchibo Benefit-Bar</title>
        <meta name="description" content="Wähle deine Benefits aus" />
      </Helmet>

      <Header />

      <div className="min-h-[calc(100vh-4rem)] bg-background py-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-8">Benefits auswählen</h1>

          <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-muted-foreground text-sm mb-1">Gesamt ausgewählt</p>
                <p className="text-2xl font-bold text-card-foreground">{totalSelected} €</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-1">Vom Unternehmen gedeckt</p>
                <p className="text-2xl font-bold text-success">{coveredAmount} €</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-1">Eigenanteil</p>
                <p className="text-2xl font-bold text-destructive">{ownContribution} €</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {benefits.map((benefit) => {
              const isSelected = isBenefitSelected(benefit.id);
              return (
                <div
                  key={benefit.id}
                  className={`bg-card border rounded-xl p-6 transition-all duration-200 ${
                    isSelected ? 'border-primary shadow-lg' : 'border-border shadow-sm hover:border-primary/50 hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-card-foreground">{benefit.title}</h3>
                    {isSelected && <Check className="h-5 w-5 text-primary" />}
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">{benefit.description}</p>
                  <div className="mb-4">
                    <p className="text-2xl font-bold text-primary">{benefit.fixedAmount} €</p>
                    <p className="text-xs text-muted-foreground">
                      {benefit.payoutMode === 'monthly_12' ? 'Monatlich (12x)' : 'Einmalig'}
                    </p>
                  </div>
                  {benefit.receiptRequired && (
                    <p className="text-xs text-muted-foreground font-medium mb-4">Nachweis erforderlich</p>
                  )}
                  <Button
                    onClick={() => handleSelectBenefit(benefit)}
                    disabled={isSelected || submission?.status !== 'draft'}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSelected ? 'Ausgewählt' : 'Auswählen'}
                  </Button>
                </div>
              );
            })}
          </div>

          {benefitYear?.allowCustomBenefits && (
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
              <h2 className="text-2xl font-bold text-card-foreground mb-6">Eigenen Benefit einreichen</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">Titel</label>
                  <Input
                    value={customBenefit.title}
                    onChange={(e) => setCustomBenefit({ ...customBenefit, title: e.target.value })}
                    placeholder="z.B. Sprachkurs Spanisch"
                    className="bg-background text-foreground border-border focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">Beschreibung/Begründung</label>
                  <Textarea
                    value={customBenefit.description}
                    onChange={(e) => setCustomBenefit({ ...customBenefit, description: e.target.value })}
                    placeholder="Beschreibe deinen Benefit-Wunsch..."
                    rows={4}
                    className="bg-background text-foreground border-border focus:border-primary resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">Betrag (€)</label>
                  <Input
                    type="number"
                    value={customBenefit.amount}
                    onChange={(e) => setCustomBenefit({ ...customBenefit, amount: e.target.value })}
                    placeholder="0"
                    className="bg-background text-foreground border-border focus:border-primary"
                  />
                </div>
                <Button
                  onClick={handleAddCustomBenefit}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Benefit hinzufügen
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-4 mt-8">
            <Button
              onClick={() => navigate('/submission')}
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              Zur Einreichung überprüfen
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BenefitSelectionPage;
