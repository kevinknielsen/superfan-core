/**
 * Standardized error handling system for points-related operations
 * Provides consistent error messages, codes, and user experience
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

// Error categories for better user experience
export enum ErrorCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION', 
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  INTERNAL_SERVER = 'INTERNAL_SERVER',
  RATE_LIMIT = 'RATE_LIMIT',
}

// Error severity levels for logging
export enum ErrorSeverity {
  LOW = 'LOW',       // Expected errors (validation, auth)
  MEDIUM = 'MEDIUM', // Business logic errors 
  HIGH = 'HIGH',     // Service failures
  CRITICAL = 'CRITICAL', // Data integrity issues
}

// Standardized error interface
export interface StandardError {
  code: string;
  message: string;
  userMessage: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  httpStatus: number;
  details?: any;
  suggestions?: string[];
}

// Pre-defined error definitions for consistency
export const ERROR_DEFINITIONS = {
  // Authentication errors
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
    userMessage: 'Please sign in to continue',
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.LOW,
    httpStatus: 401,
    suggestions: ['Sign in to your account', 'Check your internet connection']
  },

  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    message: 'User account not found',
    userMessage: 'Your account could not be found',
    category: ErrorCategory.NOT_FOUND,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 404,
    suggestions: ['Try signing in again', 'Contact support if the issue persists']
  },

  // Validation errors
  INVALID_REQUEST_DATA: {
    code: 'INVALID_REQUEST_DATA',
    message: 'Request data validation failed',
    userMessage: 'Please check your input and try again',
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    suggestions: ['Check that all required fields are filled', 'Ensure values are in the correct format']
  },

  CLUB_ID_REQUIRED: {
    code: 'CLUB_ID_REQUIRED',
    message: 'Club ID is required',
    userMessage: 'Please select a club',
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    suggestions: ['Select a club from your memberships']
  },

  // Points-specific errors
  INSUFFICIENT_POINTS: {
    code: 'INSUFFICIENT_POINTS',
    message: 'Not enough points available',
    userMessage: 'You don\'t have enough points for this action',
    category: ErrorCategory.BUSINESS_LOGIC,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    suggestions: ['Purchase more points', 'Try spending fewer points']
  },

  INSUFFICIENT_POINTS_STATUS_PROTECTION: {
    code: 'INSUFFICIENT_POINTS_STATUS_PROTECTION',
    message: 'Not enough points available (status protection enabled)',
    userMessage: 'This would lower your status. Disable status protection to continue.',
    category: ErrorCategory.BUSINESS_LOGIC,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    suggestions: ['Disable status protection', 'Purchase more points', 'Spend fewer points']
  },

  WALLET_NOT_FOUND: {
    code: 'WALLET_NOT_FOUND',
    message: 'Point wallet not found',
    userMessage: 'You don\'t have a wallet for this club yet',
    category: ErrorCategory.NOT_FOUND,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 404,
    suggestions: ['Join the club first', 'Refresh the page']
  },

  NOT_CLUB_MEMBER: {
    code: 'NOT_CLUB_MEMBER',
    message: 'User is not a member of this club',
    userMessage: 'You need to join this club first',
    category: ErrorCategory.AUTHORIZATION,
    severity: ErrorSeverity.LOW,
    httpStatus: 403,
    suggestions: ['Join the club to access this feature']
  },

  // Transfer errors
  TRANSFER_TO_SELF: {
    code: 'TRANSFER_TO_SELF',
    message: 'Cannot transfer points to yourself',
    userMessage: 'You cannot send points to yourself',
    category: ErrorCategory.BUSINESS_LOGIC,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    suggestions: ['Enter a different recipient email']
  },

  RECIPIENT_NOT_FOUND: {
    code: 'RECIPIENT_NOT_FOUND',
    message: 'Transfer recipient not found',
    userMessage: 'The recipient could not be found',
    category: ErrorCategory.NOT_FOUND,
    severity: ErrorSeverity.LOW,
    httpStatus: 404,
    suggestions: ['Check the recipient email address', 'Ask them to create an account first']
  },

  // Rate limiting
  TOO_MANY_REQUESTS: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests',
    userMessage: 'Please wait a moment before trying again',
    category: ErrorCategory.RATE_LIMIT,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 429,
    suggestions: ['Wait a few seconds and try again']
  },

  // Server errors
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'Database operation failed',
    userMessage: 'Something went wrong. Please try again.',
    category: ErrorCategory.INTERNAL_SERVER,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    suggestions: ['Try again in a few moments', 'Contact support if the issue persists']
  },

  EXTERNAL_SERVICE_ERROR: {
    code: 'EXTERNAL_SERVICE_ERROR',
    message: 'External service unavailable',
    userMessage: 'Service temporarily unavailable. Please try again.',
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.HIGH,
    httpStatus: 503,
    suggestions: ['Try again in a few minutes', 'Check our status page for updates']
  },

  BUSINESS_LOGIC: {
    code: 'BUSINESS_LOGIC_ERROR',
    message: 'Business logic constraint violated',
    userMessage: 'This action cannot be completed',
    category: ErrorCategory.BUSINESS_LOGIC,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    suggestions: ['Check the requirements and try again']
  },

  UNKNOWN_ERROR: {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    userMessage: 'Something unexpected happened. Please try again.',
    category: ErrorCategory.INTERNAL_SERVER,
    severity: ErrorSeverity.HIGH,
    httpStatus: 500,
    suggestions: ['Try refreshing the page', 'Contact support if the issue continues']
  }
} as const;

/**
 * Create a standardized error with optional details
 */
export function createStandardError(
  errorKey: keyof typeof ERROR_DEFINITIONS,
  details?: any,
  customMessage?: string
): StandardError {
  const baseError = ERROR_DEFINITIONS[errorKey];
  
  return {
    ...baseError,
    userMessage: customMessage || baseError.userMessage,
    details,
  };
}

/**
 * Create a NextResponse with standardized error format
 */
export function createErrorResponse(error: StandardError): NextResponse {
  // Log error with appropriate level
  const logData = {
    code: error.code,
    message: error.message,
    category: error.category,
    severity: error.severity,
    details: error.details,
    timestamp: new Date().toISOString(),
  };

  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.HIGH:
      console.error('[ERROR]', logData);
      break;
    case ErrorSeverity.MEDIUM:
      console.warn('[WARN]', logData);
      break;
    case ErrorSeverity.LOW:
    default:
      console.info('[INFO]', logData);
      break;
  }

  // Return user-friendly response
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.userMessage,
        suggestions: error.suggestions,
        ...(process.env.NODE_ENV === 'development' && {
          debug: {
            originalMessage: error.message,
            details: error.details,
          }
        })
      }
    },
    { status: error.httpStatus }
  );
}

/**
 * Handle Zod validation errors with user-friendly messages
 */
export function handleValidationError(error: z.ZodError): StandardError {
  const firstError = error.errors[0];
  let userMessage = 'Please check your input and try again';
  
  // Create more specific user messages based on the validation error
  if (firstError) {
    const field = firstError.path.join('.');
    switch (firstError.code) {
      case 'invalid_type':
        userMessage = `${field} is required and must be a valid value`;
        break;
      case 'too_small':
        userMessage = `${field} must be at least ${firstError.minimum}`;
        break;
      case 'too_big':
        userMessage = `${field} must be no more than ${firstError.maximum}`;
        break;
      case 'invalid_string':
        if (firstError.validation === 'email') {
          userMessage = `Please enter a valid email address`;
        } else if (firstError.validation === 'uuid') {
          userMessage = `Invalid ${field} format`;
        }
        break;
      default:
        userMessage = `${field}: ${firstError.message}`;
    }
  }

  return createStandardError('INVALID_REQUEST_DATA', error.errors, userMessage);
}

/**
 * Generic error handler for API routes
 */
export function handleApiError(error: unknown, context?: string): NextResponse {
  // Handle known error types
  if (error instanceof z.ZodError) {
    return createErrorResponse(handleValidationError(error));
  }

  // Handle database errors
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as any;
    
    // Common Supabase/PostgreSQL errors
    switch (dbError.code) {
      case 'PGRST116': // Row not found
        return createErrorResponse(createStandardError('NOT_FOUND', dbError));
      case '23505': // Unique constraint violation
        return createErrorResponse(createStandardError('BUSINESS_LOGIC', dbError, 'This action conflicts with existing data'));
      case '23503': // Foreign key constraint violation
        return createErrorResponse(createStandardError('BUSINESS_LOGIC', dbError, 'This action references data that no longer exists'));
      default:
        return createErrorResponse(createStandardError('DATABASE_ERROR', dbError));
    }
  }

  // Handle generic Error objects
  if (error instanceof Error) {
    return createErrorResponse(createStandardError('UNKNOWN_ERROR', { 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      context 
    }));
  }

  // Fallback for unknown error types
  return createErrorResponse(createStandardError('UNKNOWN_ERROR', { error, context }));
}
