export const orientationKey = (userId?: string) => `shift.orientation.v1.${userId ?? "local"}`;
export function orientationDismissed(localValue: string | null, metadata?: Record<string, unknown>) {
  return localValue === "dismissed" || metadata?.shiftPlannerOrientationDismissed === true;
}
