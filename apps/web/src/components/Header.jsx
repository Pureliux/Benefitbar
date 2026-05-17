
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Menu, X, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle.jsx';

const Header = () => {
  const { employee, isAdmin, logout, currentUser } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/benefits', label: 'Benefits auswählen' },
    { path: '/submission', label: 'Meine Einreichung' },
    { path: '/help', label: 'Hilfe/FAQ' },
  ];

  if (isAdmin) {
    navItems.push({ path: '/admin', label: 'Admin-Bereich' });
  }

  const isActive = (path) => location.pathname === path;

  return (
    <header className="bg-primary text-primary-foreground shadow-sm relative z-50 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <img 
                src="https://horizons-cdn.hostinger.com/a0c37664-cde7-4281-89d4-b0874c03bc7d/ee11994e7139cc01d2894b4d24e0e624.png" 
                alt="Tchibo Logo" 
                className="h-10 brightness-0 invert"
              />
            </Link>
            {(employee || currentUser) && (
              <div className="hidden md:flex items-center gap-2">
                <img 
                  src="https://horizons-cdn.hostinger.com/a0c37664-cde7-4281-89d4-b0874c03bc7d/1d9c89cccb5ca1a9ae48dd4915094629.png" 
                  alt="Bean Mascot" 
                  className="h-6"
                />
                <span className="text-sm font-medium">
                  Hallo, {employee?.firstName || currentUser?.name || 'Mitarbeitende/r'}!
                </span>
              </div>
            )}
          </div>

          <nav className="hidden md:flex items-center gap-6">
            {(employee || currentUser) && navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-all duration-200 ${
                  isActive(item.path)
                    ? 'font-bold border-b-2 border-primary-foreground pb-1'
                    : 'hover:opacity-80'
                }`}
              >
                {item.label}
              </Link>
            ))}
            
            <div className="flex items-center gap-2 border-l border-primary-foreground/20 pl-4 ml-2">
              <ThemeToggle />
              {(employee || currentUser) ? (
                <Button
                  onClick={logout}
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <LogOut className="h-4 w-4 mr-2" />
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

          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-primary-foreground"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-primary-foreground/20 bg-primary">
            {(employee || currentUser) && (
              <div className="flex items-center gap-2 mb-4 px-2">
                <img 
                  src="https://horizons-cdn.hostinger.com/a0c37664-cde7-4281-89d4-b0874c03bc7d/1d9c89cccb5ca1a9ae48dd4915094629.png" 
                  alt="Bean Mascot" 
                  className="h-6"
                />
                <span className="text-sm font-medium">
                  Hallo, {employee?.firstName || currentUser?.name || 'Mitarbeitende/r'}!
                </span>
              </div>
            )}
            
            {(employee || currentUser) && navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-2 py-3 text-sm font-medium ${
                  isActive(item.path) ? 'font-bold bg-primary-foreground/10 rounded-md' : ''
                }`}
              >
                {item.label}
              </Link>
            ))}
            
            {(employee || currentUser) ? (
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 px-2 py-3 text-sm font-medium w-full mt-2 border-t border-primary-foreground/20"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-2 py-3 text-sm font-medium mt-2 border-t border-primary-foreground/20"
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
