import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Header from '@/components/Header.jsx';

const faqs = [
  {
    question: 'Was ist die Benefit-Bar?',
    answer: 'Die Benefit-Bar ist das interne Programm, mit dem du dein jaehrliches Benefit-Budget fuer passende Angebote nutzen kannst.',
  },
  {
    question: 'Wie hoch ist mein Budget?',
    answer: 'Das Standardbudget betraegt 1.000 EUR pro Benefit-Jahr. Abweichungen koennen durch HR/Prozessmanagement im Admin-Bereich gepflegt werden.',
  },
  {
    question: 'Was passiert, wenn ich mehr als mein Budget auswaehle?',
    answer: 'Die App zeigt dir sofort den Unternehmensanteil und einen moeglichen Eigenanteil. Vor der finalen Einreichung musst du den Eigenanteil aktiv bestaetigen.',
  },
  {
    question: 'Wie reiche ich einen eigenen Benefit ein?',
    answer: 'Unter "Benefits auswaehlen" findest du die Kachel "Eigenen Benefit einreichen". Eigene Benefits werden als in Pruefung markiert und durch HR bewertet.',
  },
  {
    question: 'Welche Nachweise kann ich hochladen?',
    answer: 'Unterstuetzt werden PDF, JPG, PNG und DOCX. Wenn fuer einen Benefit ein Nachweis notwendig ist, wird das im Status deutlich angezeigt.',
  },
  {
    question: 'Kann ich meine Auswahl noch aendern?',
    answer: 'Solange deine Einreichung ein Entwurf ist oder Unterlagen fehlen, kannst du sie bearbeiten. Nach der finalen Einreichung ist die Auswahl gesperrt.',
  },
  {
    question: 'Was bedeutet monatliche Auszahlung?',
    answer: 'Einige Benefits werden ueber 12 Monate verteilt ausgewiesen. Die Budgetberechnung zeigt dir den Gesamtbetrag und den monatlichen Anteil.',
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
        <meta name="description" content="Haeufig gestellte Fragen zur Benefit-Bar" />
      </Helmet>

      <Header />

      <main className="min-h-[calc(100vh-4rem)] bg-[#F4F1EA] py-8 text-[#222222] transition-colors dark:bg-[#171614] dark:text-[#F7F2E8]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase text-[#C0A468]">Support</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Hilfe & FAQ</h1>
            <p className="mt-2 text-sm text-muted-foreground">Die wichtigsten Fragen zur Benefit-Bar kompakt beantwortet.</p>
          </div>

          <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-6 text-2xl font-bold">Haeufig gestellte Fragen</h2>
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
