import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function goBack(fallback: string, setLocation: (to: string) => void) {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    setLocation(fallback)
  }
}
