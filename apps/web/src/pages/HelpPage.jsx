import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Header from '@/components/Header.jsx';

const faqs = [
  {
    question: 'Was ist die Benefit-Bar?',
    answer: 'Die Benefit-Bar ist das interne Programm, mit dem du dein jährliches Benefit-Budget für passende Angebote nutzen kannst.',
  },
  {
    question: 'Wie hoch ist mein Budget?',
    answer: 'Das Standardbudget beträgt 1.000 EUR pro Benefit-Jahr. Abweichungen können durch HR/Prozessmanagement im Admin-Bereich gepflegt werden.',
  },
  {
    question: 'Was passiert, wenn ich mehr als mein Budget auswähle?',
    answer: 'Die App zeigt dir sofort den Unternehmensanteil und einen möglichen Eigenanteil. Vor der finalen Einreichung musst du den Eigenanteil aktiv bestätigen.',
  },
  {
    question: 'Wie reiche ich einen eigenen Benefit ein?',
    answer: 'Unter "Benefits auswählen" findest du die Kachel "Eigenen Benefit vorschlagen". Eigene Benefits werden als in Prüfung markiert und durch HR bewertet.',
  },
  {
    question: 'Welche Nachweise kann ich hochladen?',
    answer: 'Unterstützt werden PDF, JPG, PNG und DOCX. Wenn für einen Benefit ein Nachweis notwendig ist, wird das im Status deutlich angezeigt.',
  },
  {
    question: 'Kann ich meine Auswahl noch ändern?',
    answer: 'Solange deine Einreichung ein Entwurf ist oder Unterlagen fehlen, kannst du sie bearbeiten. Nach der finalen Einreichung ist die Auswahl gesperrt.',
  },
  {
    question: 'Was bedeutet monatliche Auszahlung?',
    answer: 'Einige Benefits werden über 12 Monate verteilt ausgewiesen. Die Budgetberechnung zeigt dir den Gesamtbetrag und den monatlichen Anteil.',
  },
  {
    question: 'Wann wird meine Einreichung bearbeitet?',
    answer: 'Nach der finalen Einreichung liegt dein Antrag bei HR/Prozessmanagement. Den Bearbeitungsstand findest du jederzeit im Reiter Status.',
  },
];

const HelpPage = () => {
  const [expandedFaq, setExpandedFaq] = useState(null);

  return (
    <>
      <Helmet>
        <title>Hilfe & FAQ - Tchibo Benefit-Bar</title>
        <meta name="description" content="Häufig gestellte Fragen zur Benefit-Bar" />
      </Helmet>

      <Header />

      <main className="benefit-ambient-bg min-h-[calc(100vh-4rem)] py-8 text-[#222222] transition-colors dark:text-[#F7F2E8]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase text-[#C0A468]">Support</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Hilfe & FAQ</h1>
            <p className="mt-2 text-sm text-muted-foreground">Die wichtigsten Fragen zur Benefit-Bar kompakt beantwortet.</p>
          </div>

          <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-6 text-2xl font-bold">Häufig gestellte Fragen</h2>
            <div className="space-y-2">
              {faqs.map((faq, index) => (
                <div key={faq.question} className="overflow-hidden rounded-lg border border-border">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium">{faq.question}</span>
                    <span className="rounded-full bg-muted p-1">
                      {expandedFaq === index ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>
                  {expandedFaq === index && (
                    <div className="border-t border-border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
};

export default HelpPage;
