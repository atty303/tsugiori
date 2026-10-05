export class ServiceError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "configuration_missing"
      | "authentication_failed"
      | "not_found"
      | "metadata_invalid"
      | "upstream_failure"
      | "rate_limited"
      | "timeout",
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "ServiceError";
  }
}
