import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
} 

/**
 * Helper function to safely handle errors
 * @param fn The function to execute
 * @param fallbackValue The value to return if the function fails
 * @param errorHandler Optional function to handle the error
 */
export async function safeFetch<T>(
  fn: () => Promise<T>,
  fallbackValue: T,
  errorHandler?: (error: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (errorHandler) {
      errorHandler(error);
    } else {
      console.error("Error in safeFetch:", error);
    }
    return fallbackValue;
  }
}

/**
 * Convert seconds to a readable time format
 * @param seconds Number of seconds
 * @returns Formatted time string (MM:SS)
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
} 