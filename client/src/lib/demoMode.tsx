import { createContext, useContext } from "react";

export const DemoModeContext = createContext<boolean>(false);

export function useDemoMode(): boolean {
  return useContext(DemoModeContext);
}

/**
 * Redacts a string by greying out alternating characters.
 * Spaces are preserved. The first character of every word stays visible.
 * Returns an array of { char, greyed } tuples for rendering.
 */
export function obscureChars(text: string): Array<{ char: string; greyed: boolean }> {
  let wordCharIndex = 0;
  let prevWasSpace = true;
  return text.split("").map((char) => {
    if (char === " ") {
      prevWasSpace = true;
      wordCharIndex = 0;
      return { char, greyed: false };
    }
    if (prevWasSpace) {
      prevWasSpace = false;
      wordCharIndex = 0;
    }
    const greyed = wordCharIndex % 2 !== 0;
    wordCharIndex++;
    return { char, greyed };
  });
}

/**
 * Returns a safe demo-mode amount string.
 */
export function demoAmount(): string {
  return "£**.00";
}
