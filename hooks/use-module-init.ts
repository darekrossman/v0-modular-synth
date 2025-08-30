import { useState, useRef, useEffect, useCallback } from "react"

/**
 * Hook for safely initializing audio modules with proper guards and automatic re-rendering
 * 
 * Setting isReady state triggers a re-render which causes Port components to pick up
 * the newly initialized audio nodes from their refs.
 * 
 * @param initFn - Async initialization function that sets up audio nodes
 * @param moduleName - Name for console logging (e.g., "VCO", "FILTER")
 * @returns 
 * - isReady: boolean state that triggers re-render when initialization completes
 * - initError: any error that occurred during initialization
 * - retryInit: function to manually retry initialization after error
 */
export function useModuleInit(
  initFn: () => Promise<void>,
  moduleName: string
) {
  const isInitializedRef = useRef(false)
  const [isReady, setIsReady] = useState(false)
  const [initError, setInitError] = useState<Error | null>(null)

  const initialize = useCallback(async () => {
    // Guard against double initialization
    if (isInitializedRef.current) {
      return
    }

    // Set guard immediately to prevent race conditions
    isInitializedRef.current = true

    try {
      // Run the module's initialization function
      await initFn()
      
      // Success - trigger re-render by setting state
      // This causes Port components to re-render and pick up the initialized audio nodes
      setIsReady(true)
      setInitError(null)
      console.log(`[${moduleName}] Initialized successfully`)
    } catch (err) {
      // Error - reset guard so it can retry
      console.error(`[${moduleName}] Initialization error:`, err)
      isInitializedRef.current = false
      setInitError(err as Error)
      setIsReady(false)
    }
  }, [initFn, moduleName])

  // Initialize on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  // Manual retry function for error recovery
  const retryInit = useCallback(() => {
    if (initError) {
      console.log(`[${moduleName}] Retrying initialization...`)
      isInitializedRef.current = false
      setInitError(null)
      initialize()
    }
  }, [initError, initialize, moduleName])

  return {
    isReady,
    initError,
    retryInit
  }
}