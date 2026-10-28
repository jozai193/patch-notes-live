/** SDK 0.165 streams error messages rather than the app-server's structured error codes. */
export function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /usage[\s_-]*limit|UsageLimitExceeded|insufficient[\s_-]*quota|quota[\s_-]*(?:exceeded|exhausted)|(?:credit|credits)[\s_-]*(?:balance[\s_-]*)?(?:exhausted|depleted)|(?:organization|project)[\s_-]*spend[\s_-]*limit/i.test(
    message,
  );
}
