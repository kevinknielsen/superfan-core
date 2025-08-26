export type MetalErrorType =
  | "NETWORK_ERROR"
  | "API_ERROR"
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "UNKNOWN_ERROR";

export interface MetalError {
  type: MetalErrorType;
  message: string;
  statusCode?: number;
  details?: any;
}

export type Result<Data, Error> =
  | {
      data: Data;
      error: null;
    }
  | {
      data: null;
      error: Error;
    };

function getErrorType(statusCode: number): MetalErrorType {
  switch (statusCode) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
    case 403:
      return "AUTHENTICATION_ERROR";
    case 404:
      return "NOT_FOUND";
    case 429:
      return "RATE_LIMIT";
    case 500:
    case 502:
    case 503:
    case 504:
      return "API_ERROR";
    default:
      return "UNKNOWN_ERROR";
  }
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const errorData = (await response.json()) as any;
    return (
      errorData.message ||
      errorData.error ||
      `HTTP ${response.status}: ${response.statusText}`
    );
  } catch {
    return `HTTP ${response.status}: ${response.statusText}`;
  }
}

export async function fetchMetal<ResponseData extends object>(
  path: `/${string}`,
  options: RequestInit = {}
): Promise<Result<ResponseData, MetalError>> {
  try {
    const url = `https://api.metal.build${path}`;
    const requestHeaders = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers: requestHeaders,
    });

    if (!response.ok) {
      const errorType = getErrorType(response.status);
      const errorMessage = await getErrorMessage(response);

      return {
        data: null,
        error: {
          type: errorType,
          message: errorMessage,
          statusCode: response.status,
        },
      };
    }

    const data = (await response.json()) as ResponseData;

    if ("success" in data && data.success === false) {
      return {
        data: null,
        error: {
          type: "API_ERROR",
          message: "API request failed",
          statusCode: response.status,
        },
      };
    }

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        type: "UNKNOWN_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
