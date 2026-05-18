import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { ChevronDown, ChevronUp } from 'lucide-react';
import Header from '@/components/Header.jsx';

const faqs = [
  {
    question: 'Was ist die Benefit-Bar?',
    answer: 'Placeholder',
  },
  {
    question: 'Wie hoch ist mein Budget?',
    answer: 'Placeholder',
  },
  {
    question: 'Was passiert, wenn ich mehr als mein Budget auswähle?',
    answer: 'Placeholder',
  },
  {
    question: 'Wie reiche ich einen eigenen Benefit ein?',
    answer: 'Placeholder',
  },
  {
    question: 'Welche Nachweise kann ich hochladen?',
    answer: 'Placeholder',
  },
  {
    question: 'Kann ich meine Auswahl noch ändern?',
    answer: 'Placeholder',
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
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase text-[#C0A468]">Support</p>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Hilfe & FAQ</h1>
              <p className="mt-2 text-sm text-muted-foreground">Die wichtigsten Fragen zur Benefit-Bar kompakt beantwortet.</p>
            </div>

            <figure className="relative hidden h-72 overflow-hidden rounded-lg border border-[#D8C894]/80 bg-gradient-to-br from-white via-[#F8EBCB] to-[#D9BE79] shadow-xl lg:block">
              <img
                src="/brand/superbean-help.png"
                alt="Super Bean Maskottchen der Benefit-Bar"
                className="h-full w-full translate-x-[-7%] scale-110 object-cover object-top opacity-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white/25 via-transparent to-[#C0A468]/10 mix-blend-screen" />
            </figure>
          </div>

          <section className="rounded-lg border border-border bg-card/95 p-6 shadow-sm backdrop-blur-sm dark:bg-card/92">
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
