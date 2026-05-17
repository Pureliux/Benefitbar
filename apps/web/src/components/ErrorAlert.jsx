
import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function ErrorAlert({ message, icon: Icon = AlertCircle, onDismiss }) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-3 p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl mb-6 shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1 text-sm font-medium leading-relaxed">{message}</div>
      {onDismiss && (
        <button 
          onClick={onDismiss} 
          className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-md p-1 shrink-0 transition-colors"
          aria-label="Fehlermeldung schließen"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
