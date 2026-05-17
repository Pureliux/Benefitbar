
import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import pb from "@/lib/pocketbaseClient";

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

  // Sync from local to DB when user changes theme
  useEffect(() => {
    if (employee && synced && theme !== employee.themePreference) {
      // Note: We use pb.collection('users') if the themePreference is on the user record.
      // But the prompt said "Extended 'users' Collection - themePreference"
      // Wait, in PocketBase, employees is a separate collection, or user is the auth collection?
      // Assuming employee is linked or we just update the user record.
      if (pb.authStore.model?.id) {
        pb.collection('users').update(pb.authStore.model.id, {
          themePreference: theme
        }, { $autoCancel: false }).catch(console.error);
      }
    }
  }, [theme, employee, synced]);

  return null;
}
