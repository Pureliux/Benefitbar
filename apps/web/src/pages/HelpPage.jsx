
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/Header.jsx';
import pb from '@/lib/pocketbaseClient';
import { ChevronDown, ChevronUp, Calendar, Mail } from 'lucide-react';
import { format } from 'date-fns';

const HelpPage = () => {
  const [benefitYear, setBenefitYear] = useState(null);
  const [expandedFaq, setExpandedFaq] = useState(null);

  useEffect(() => {
    const fetchBenefitYear = async () => {
      try {
        const yearRecord = await pb.collection('benefitYears').getFirstListItem(
          'status="open"',
          { $autoCancel: false }
        );
        setBenefitYear(yearRecord);
      } catch (err) {
        console.error('Failed to fetch benefit year:', err);
      }
    };

    fetchBenefitYear();
  }, []);

  const faqs = [
    {
      question: 'Was ist die Benefit-Bar?',
      answer: 'Die Benefit-Bar ist ein jährliches Programm, bei dem du aus verschiedenen Benefits wählen kannst, um dein persönliches Budget optimal zu nutzen. Du kannst aus vordefinierten Benefits wählen oder eigene Vorschläge einreichen.'
    },
    {
      question: 'Wie hoch ist mein Budget?',
      answer: 'Jede/r berechtigte Mitarbeitende erhält ein jährliches Budget von 1.000 €. Dieses Budget kann für verschiedene Benefits verwendet werden.'
    },
    {
      question: 'Was passiert, wenn ich mehr als mein Budget auswähle?',
      answer: 'Wenn die Gesamtsumme deiner ausgewählten Benefits dein Budget übersteigt, wird der überschreitende Betrag als Eigenanteil ausgewiesen. Dieser Eigenanteil wird von dir selbst getragen.'
    },
    {
      question: 'Wann bin ich teilnahmeberechtigt?',
      answer: 'Die Teilnahmeberechtigung ist in deinem Mitarbeitendenprofil hinterlegt. Du kannst dein Eligibility-Datum auf dem Dashboard einsehen. Neue Mitarbeitende sind in der Regel nach einer bestimmten Betriebszugehörigkeit berechtigt.'
    },
    {
      question: 'Wie reiche ich einen eigenen Benefit ein?',
      answer: 'Auf der Seite "Benefits auswählen" findest du die Option "Eigenen Benefit einreichen". Dort kannst du Titel, Beschreibung und Betrag angeben. Eigene Benefits werden von der HR-Abteilung geprüft.'
    },
    {
      question: 'Welche Nachweise muss ich hochladen?',
      answer: 'Für bestimmte Benefits ist ein Nachweis erforderlich (z.B. Rechnung, Quittung). Dies ist bei jedem Benefit gekennzeichnet. Lade die Nachweise als PDF, JPG, PNG oder DOCX hoch.'
    },
    {
      question: 'Kann ich meine Auswahl noch ändern?',
      answer: 'Solange deine Einreichung den Status "Entwurf" hat, kannst du jederzeit Änderungen vornehmen. Nach der finalen Einreichung ist keine Änderung mehr möglich.'
    },
    {
      question: 'Was bedeutet "Monatlich (12x)" bei der Auszahlung?',
      answer: 'Einige Benefits werden monatlich über 12 Monate ausgezahlt (z.B. Öffi-Ticket). Andere Benefits werden einmalig ausgezahlt.'
    },
    {
      question: 'Wann wird meine Einreichung bearbeitet?',
      answer: 'Nach der finalen Einreichung wird deine Auswahl von der HR-Abteilung geprüft. Du erhältst eine Benachrichtigung, sobald deine Einreichung genehmigt wurde oder zusätzliche Informationen benötigt werden.'
    },
    {
      question: 'Was passiert nach der Genehmigung?',
      answer: 'Nach der Genehmigung werden die Benefits entsprechend der gewählten Auszahlungsart (einmalig oder monatlich) ausgezahlt. Du erhältst eine Bestätigung per E-Mail.'
    }
  ];

  const glossary = [
    { term: 'Benefit-Bar', definition: 'Das jährliche Programm zur Auswahl von Benefits' },
    { term: 'Mein Budget', definition: 'Dein persönliches jährliches Budget von 1.000 €' },
    { term: 'Eigenanteil', definition: 'Der Betrag, der dein Budget übersteigt und von dir selbst getragen wird' },
    { term: 'Einreichung', definition: 'Deine finale Auswahl an Benefits, die zur Genehmigung eingereicht wird' },
    { term: 'Nachweis', definition: 'Dokument (Rechnung, Quittung), das für bestimmte Benefits erforderlich ist' },
    { term: 'Entwurf', definition: 'Status einer Einreichung, die noch bearbeitet werden kann' },
    { term: 'Eingereicht', definition: 'Status einer Einreichung, die zur Prüfung vorliegt' },
    { term: 'Genehmigt', definition: 'Status einer Einreichung, die von HR genehmigt wurde' }
  ];

  return (
    <>
      <Helmet>
        <title>Hilfe & FAQ - Tchibo Benefit-Bar</title>
        <meta name="description" content="Häufig gestellte Fragen zur Benefit-Bar" />
      </Helmet>

      <Header />

      <div className="min-h-[calc(100vh-4rem)] bg-background py-8 transition-colors duration-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-8">Hilfe & FAQ</h1>

          {benefitYear && (
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
              <h2 className="text-2xl font-bold text-card-foreground mb-6">Benefit-Bar Timeline {benefitYear.year}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {benefitYear.processOpenDate && (
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-card-foreground">Prozess geöffnet</p>
                      <p className="text-sm text-muted-foreground">{format(new Date(benefitYear.processOpenDate), 'dd.MM.yyyy')}</p>
                    </div>
                  </div>
                )}
                {benefitYear.submissionDeadline && (
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-destructive/10 rounded-lg shrink-0">
                      <Calendar className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="font-semibold text-card-foreground">Einreichungsfrist</p>
                      <p className="text-sm text-muted-foreground">{format(new Date(benefitYear.submissionDeadline), 'dd.MM.yyyy')}</p>
                    </div>
                  </div>
                )}
                {benefitYear.autoAssignmentDate && (
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-secondary/10 rounded-lg shrink-0">
                      <Calendar className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-semibold text-card-foreground">Auto-Zuweisung</p>
                      <p className="text-sm text-muted-foreground">{format(new Date(benefitYear.autoAssignmentDate), 'dd.MM.yyyy')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-card border border-border shadow-sm rounded-xl p-6 mb-8 transition-colors duration-200">
            <h2 className="text-2xl font-bold text-card-foreground mb-6">Häufig gestellte Fragen</h2>
            <div className="space-y-2">
              {faqs.map((faq, index) => (
                <div key={index} className="border border-border rounded-lg overflow-hidden transition-colors">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                    className="w-full flex items-center justify-between text-left p-4 hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium text-card-foreground">{faq.question}</span>
                    <div className="p-1 bg-muted rounded-full shrink-0 ml-4">
                      {expandedFaq === index ? (
                        <ChevronUp className="h-4 w-4 text-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                  {expandedFaq === index && (
                    <div className="p-4 pt-0 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/20">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-card border border-border shadow-sm rounded-xl p-6 transition-colors duration-200">
              <h2 className="text-2xl font-bold text-card-foreground mb-6">Glossar</h2>
              <div className="space-y-4">
                {glossary.map((item, index) => (
                  <div key={index} className="border-b border-border last:border-b-0 pb-4 last:pb-0">
                    <p className="font-semibold text-card-foreground mb-1">{item.term}</p>
                    <p className="text-sm text-muted-foreground">{item.definition}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border shadow-sm rounded-xl p-6 transition-colors duration-200 h-fit">
              <h2 className="text-2xl font-bold text-card-foreground mb-6">Kontakt & Support</h2>
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-full shrink-0">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-card-foreground mb-1">HR-Abteilung</p>
                  <p className="text-muted-foreground mb-4">
                    Bei Fragen zur Benefit-Bar wende dich bitte an die HR-Abteilung deines Standorts.
                  </p>
                  <a 
                    href="mailto:hr@eduscho.at" 
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                  >
                    Nachricht senden
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default HelpPage;
