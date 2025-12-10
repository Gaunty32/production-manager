import { createContext, useContext, useEffect } from "react";

type Theme = "light";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always use light mode - remove any stored dark preference
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    localStorage.removeItem("theme");
  }, []);

  const toggleTheme = () => {
    // No-op - dark mode is disabled
  };

  return (
    <ThemeContext.Provider value={{ theme: "light", toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
