import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Maps a 0-1 input value linearly to a min-max range
 * @param value - Input value between 0 and 1
 * @param min - Minimum output value
 * @param max - Maximum output value
 * @returns Linearly mapped value between min and max
 */
export function mapLinear(value: number, min: number, max: number): number {
  return min + (max - min) * value
}

/**
 * Maps a 0-1 input value exponentially to a min-max range
 * @param value - Input value between 0 and 1
 * @param min - Minimum output value
 * @param max - Maximum output value
 * @param curve - Exponential curve factor (default 2.0, higher = more exponential)
 * @returns Exponentially mapped value between min and max
 */
export function mapExponential(value: number, min: number, max: number, curve = 2.0): number {
  const exponentialValue = Math.pow(value, curve)
  return min + (max - min) * exponentialValue
}

/**
 * Maps a 0-1 input value logarithmically to a min-max range
 * @param value - Input value between 0 and 1
 * @param min - Minimum output value (must be > 0 for true logarithmic scaling)
 * @param max - Maximum output value
 * @returns Logarithmically mapped value between min and max
 */
export function mapLogarithmic(value: number, min: number, max: number): number {
  if (min <= 0) {
    throw new Error("Minimum value must be greater than 0 for logarithmic scaling")
  }

  const logMin = Math.log(min)
  const logMax = Math.log(max)
  const logValue = logMin + (logMax - logMin) * value

  return Math.exp(logValue)
}
