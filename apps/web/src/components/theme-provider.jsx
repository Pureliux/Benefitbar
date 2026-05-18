
import React, { useEffect, useState } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

export function ThemeProvider({ children, ...props }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

export function ThemeSync({ employee }) {
  const { theme, setTheme } = useTheme();
  const [synced, setSynced] = useState(false);

  // Sync from DB to local on initial load
  useEffect(() => {
    if (employee && employee.themePreference && !synced) {
      if (employee.themePreference !== theme) {
        setTheme(employee.themePreference);
      }
      setSynced(true);
    }
  }, [employee, theme, setTheme, synced]);

  return null;
}
