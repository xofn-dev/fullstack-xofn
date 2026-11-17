import { clsx, type ClassValue } from 'clsx';

// Satu pintu untuk kelas kondisional supaya pola penulisan seragam di semua komponen.
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
