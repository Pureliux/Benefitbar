import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Menu, X, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle.jsx';

const Header = () => {
  const { employee, isAdmin, isHr, logout, currentUser } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', label: 'Übersicht' },
    { path: '/benefits', label: 'Benefits auswählen' },
    { path: '/submission', label: 'Status' },
    { path: '/help', label: 'Hilfe/FAQ' },
  ];

  if (isAdmin) {
    navItems.push({ path: '/admin', label: 'Admin-Bereich' });
  }

  if (isHr) {
    navItems.push({ path: '/hr', label: 'HR-Bereich' });
  }

  const isActive = (path) => location.pathname === path;
  const isSignedIn = Boolean(employee || currentUser);

  return (
    <header className="relative z-50 bg-primary text-primary-foreground shadow-sm transition-colors duration-200">
      <div className="w-full px-3 sm:px-5 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to={isSignedIn ? '/dashboard' : '/login'} className="flex items-center gap-2 transition-opacity hover:opacity-90">
            <img
              src="https://horizons-cdn.hostinger.com/a0c37664-cde7-4281-89d4-b0874c03bc7d/ee11994e7139cc01d2894b4d24e0e624.png"
              alt="Tchibo Logo"
              className="h-10 brightness-0 invert"
            />
          </Link>

          <nav className="hidden items-center gap-5 md:flex lg:gap-7">
            {isSignedIn && navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-all duration-200 ${
                  isActive(item.path)
                    ? 'border-b-2 border-primary-foreground pb-1 font-bold'
                    : 'hover:opacity-80'
                }`}
              >
                {item.label}
              </Link>
            ))}

            <div className="ml-1 flex items-center gap-2 border-l border-primary-foreground/20 pl-4">
              <ThemeToggle />
              {isSignedIn ? (
                <Button
                  onClick={logout}
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Abmelden
                </Button>
              ) : (
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/20">
                    Einloggen
                  </Button>
                </Link>
              )}
            </div>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-primary-foreground"
              aria-label="Navigation öffnen"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-primary-foreground/20 bg-primary py-4 md:hidden">
            {isSignedIn && navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-2 py-3 text-sm font-medium ${
                  isActive(item.path) ? 'rounded-md bg-primary-foreground/10 font-bold' : ''
                }`}
              >
                {item.label}
              </Link>
            ))}

            {isSignedIn ? (
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="mt-2 flex w-full items-center gap-2 border-t border-primary-foreground/20 px-2 py-3 text-sm font-medium"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 block border-t border-primary-foreground/20 px-2 py-3 text-sm font-medium"
              >
                Einloggen
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
