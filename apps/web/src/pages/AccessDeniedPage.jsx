
import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AccessDeniedPage = () => {
  return (
    <>
      <Helmet>
        <title>Kein Zugriff - Tchibo Benefit-Bar</title>
        <meta name="description" content="Zugriff verweigert" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-card rounded-2xl p-8 shadow-lg border border-border">
            <ShieldX className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-4">Kein Zugriff</h1>
            <p className="text-muted mb-6">
              Diese Anwendung ist nur für berechtigte Mitarbeitende von Tchibo/Eduscho Österreich freigegeben.
            </p>
            <p className="text-muted text-sm mb-6">
              Bitte stellen Sie sicher, dass Sie mit einer freigegebenen E-Mail-Adresse angemeldet sind und Ihr Mitarbeitendenstatus aktiv ist.
            </p>
            <Link to="/login">
              <Button className="bg-primary text-white hover:bg-primary/90">
                Zurück zur Anmeldung
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default AccessDeniedPage;
