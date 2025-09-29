/**
 * Frontend error handling utilities
 * Provides consistent error display and user feedback across components
 */

import React from 'react';
import { useToast } from '@/hooks/use-toast';

// Standard API error response format
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    userMessage: string;
    suggestions?: string[];
    debug?: {
      originalMessage: string;
      details: any;
    };
  };
}

// Client-side error categories for different handling
export enum ClientErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION', 
  BUSINESS = 'BUSINESS',
  AUTHENTICATION = 'AUTHENTICATION',
  PERMISSION = 'PERMISSION',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN',
}

// Error display configuration
export interface ErrorDisplayConfig {
  showSuggestions: boolean;
  autoHide: boolean;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Parse API error response and categorize for appropriate handling
 */
export function parseApiError(error: any): {
  type: ClientErrorType;
  message: string;
  suggestions: string[];
  isUserFriendly: boolean;
} {
  // Handle fetch/network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: ClientErrorType.NETWORK,
      message: 'Connection problem. Please check your internet connection.',
      suggestions: ['Check your internet connection', 'Try again in a moment'],
      isUserFriendly: true,
    };
  }

  // Handle structured API error responses
  if (error && typeof error === 'object' && error.error) {
    const apiError = error as ApiErrorResponse;
    const errorCode = apiError.error.code;
    
    // Categorize by error code
    let type = ClientErrorType.UNKNOWN;
    if (errorCode.includes('UNAUTHORIZED') || errorCode.includes('AUTH')) {
      type = ClientErrorType.AUTHENTICATION;
    } else if (errorCode.includes('PERMISSION') || errorCode.includes('FORBIDDEN')) {
      type = ClientErrorType.PERMISSION;
    } else if (errorCode.includes('VALIDATION') || errorCode.includes('INVALID')) {
      type = ClientErrorType.VALIDATION;
    } else if (errorCode.includes('BUSINESS') || errorCode.includes('INSUFFICIENT')) {
      type = ClientErrorType.BUSINESS;
    } else if (errorCode.includes('SERVER') || errorCode.includes('DATABASE')) {
      type = ClientErrorType.SERVER;
    }

    return {
      type,
      message: apiError.error.userMessage,
      suggestions: apiError.error.suggestions || [],
      isUserFriendly: true,
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    return {
      type: ClientErrorType.UNKNOWN,
      message: error.message,
      suggestions: ['Try refreshing the page', 'Contact support if the issue persists'],
      isUserFriendly: false,
    };
  }

  // Fallback for unknown error types
  return {
    type: ClientErrorType.UNKNOWN,
    message: 'Something unexpected happened',
    suggestions: ['Try refreshing the page', 'Contact support if this continues'],
    isUserFriendly: false,
  };
}

/**
 * Hook for standardized error handling with toast notifications
 */
export function useErrorHandler() {
  const { toast } = useToast();

  const handleError = (
    error: any,
    config: Partial<ErrorDisplayConfig> = {}
  ) => {
    const {
      showSuggestions = true,
      autoHide = true,
      duration,
      actionLabel,
      onAction,
    } = config;

    const parsedError = parseApiError(error);

    // Determine toast variant based on error type
    let variant: 'default' | 'destructive' = 'destructive';
    let title = 'Error';

    switch (parsedError.type) {
      case ClientErrorType.NETWORK:
        title = 'Connection Problem';
        break;
      case ClientErrorType.AUTHENTICATION:
        title = 'Sign In Required';
        variant = 'default';
        break;
      case ClientErrorType.PERMISSION:
        title = 'Access Denied';
        break;
      case ClientErrorType.VALIDATION:
        title = 'Invalid Input';
        break;
      case ClientErrorType.BUSINESS:
        title = 'Unable to Complete';
        break;
      case ClientErrorType.SERVER:
        title = 'Service Unavailable';
        break;
      default:
        title = 'Something Went Wrong';
    }

    // Build description with suggestions if enabled
    let description = parsedError.message;
    if (showSuggestions && parsedError.suggestions.length > 0) {
      const suggestion = parsedError.suggestions[0]; // Show first suggestion
      description += ` ${suggestion}`;
    }

    // Show toast notification
    toast({
      title,
      description,
      variant,
      duration: duration || (autoHide ? 5000 : undefined),
      action: actionLabel && onAction ? {
        label: actionLabel,
        onClick: onAction,
      } : undefined,
    });

    // Log error for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Error handled:', {
        original: error,
        parsed: parsedError,
        config,
      });
    }

    return parsedError;
  };

  // Specific handlers for common error scenarios
  const handleAuthError = (error: any) => {
    return handleError(error, {
      showSuggestions: true,
      actionLabel: 'Sign In',
      onAction: () => {
        // TODO: Trigger sign in flow
        window.location.href = '/dashboard';
      },
    });
  };

  const handlePointsError = (error: any) => {
    const parsed = parseApiError(error);
    
    // Special handling for insufficient points
    if (parsed.message.includes('enough points')) {
      return handleError(error, {
        showSuggestions: true,
        actionLabel: 'Buy Points',
        onAction: () => {
          // TODO: Open points purchase modal
          console.log('Open points purchase modal');
        },
      });
    }

    return handleError(error);
  };

  const handleNetworkError = (error: any) => {
    return handleError(error, {
      showSuggestions: true,
      autoHide: false, // Keep network errors visible longer
      actionLabel: 'Retry',
      onAction: () => {
        window.location.reload();
      },
    });
  };

  return {
    handleError,
    handleAuthError,
    handlePointsError,
    handleNetworkError,
    parseError: parseApiError,
  };
}

/**
 * Utility for handling errors in React Query mutations
 */
export function createMutationErrorHandler(
  context: string,
  customHandler?: (error: any) => void
) {
  return (error: any) => {
    const parsed = parseApiError(error);
    
    // Call custom handler if provided
    if (customHandler) {
      customHandler(error);
      return;
    }

    // Default handling with context
    console.error(`[${context}] Mutation error:`, {
      original: error,
      parsed,
    });
    
    // Could integrate with error reporting service here
    // e.g., Sentry, LogRocket, etc.
  };
}

/**
 * Utility for handling async operations with consistent error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorHandler: (error: any) => void
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    errorHandler(error);
    return null;
  }
}

/**
 * Error boundary fallback for points-related components
 */
export function PointsErrorFallback({ 
  error, 
  resetError 
}: { 
  error: Error; 
  resetError: () => void;
}) {
  const { handleError } = useErrorHandler();

  React.useEffect(() => {
    handleError(error, {
      showSuggestions: true,
      autoHide: false,
      actionLabel: 'Try Again',
      onAction: resetError,
    });
  }, [error, handleError, resetError]);

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 text-red-500">
        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="mb-2 text-lg font-medium">Something went wrong</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        We're having trouble loading your points data.
      </p>
      <button
        onClick={resetError}
        className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90"
      >
        Try Again
      </button>
    </div>
  );
}
