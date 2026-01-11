/**
 * featureFlags.ts - Feature Flag Configuration
 *
 * Centralized feature flag management for service plan confirmation workflow.
 * Feature flags allow toggling features without code changes.
 *
 * Environment variables:
 * - FEATURE_FINAL_CONFIRMATION_ENABLED: Enable/disable final confirmation feature (default: true)
 * - FEATURE_METRICS_TRACKING_ENABLED: Enable/disable metrics tracking (default: true)
 * - FEATURE_MASTER_SCHEDULE_ASYNC: Use async handoff to Master Schedule (default: false)
 * - FEATURE_SOFT_DELETE_PLANS: Enable soft-delete for plans (default: true)
 */

export interface FeatureFlags {
  // Final confirmation workflow
  finalConfirmationEnabled: boolean;

  // Metrics and analytics tracking
  metricsTrackingEnabled: boolean;

  // Master Schedule handoff mode (sync vs async)
  masterScheduleAsync: boolean;

  // Soft-delete for plans (not just cars)
  softDeletePlansEnabled: boolean;

  // Row-level lock enforcement (backend enforcement for confirmed cars)
  rowLevelLockEnforcement: boolean;
}

/**
 * Parse boolean from environment variable
 */
function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get feature flags from environment variables
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    finalConfirmationEnabled: parseEnvBoolean(
      process.env.FEATURE_FINAL_CONFIRMATION_ENABLED,
      true
    ),
    metricsTrackingEnabled: parseEnvBoolean(
      process.env.FEATURE_METRICS_TRACKING_ENABLED,
      true
    ),
    masterScheduleAsync: parseEnvBoolean(
      process.env.FEATURE_MASTER_SCHEDULE_ASYNC,
      false
    ),
    softDeletePlansEnabled: parseEnvBoolean(
      process.env.FEATURE_SOFT_DELETE_PLANS,
      true
    ),
    rowLevelLockEnforcement: parseEnvBoolean(
      process.env.FEATURE_ROW_LEVEL_LOCK_ENFORCEMENT,
      true
    ),
  };
}

/**
 * Singleton instance for feature flags
 * Re-reads from environment on each call to support dynamic updates
 */
export const featureFlags = {
  get(): FeatureFlags {
    return getFeatureFlags();
  },

  // Convenience accessors
  isFinalConfirmationEnabled(): boolean {
    return this.get().finalConfirmationEnabled;
  },

  isMetricsTrackingEnabled(): boolean {
    return this.get().metricsTrackingEnabled;
  },

  isMasterScheduleAsync(): boolean {
    return this.get().masterScheduleAsync;
  },

  isSoftDeletePlansEnabled(): boolean {
    return this.get().softDeletePlansEnabled;
  },

  isRowLevelLockEnforcementEnabled(): boolean {
    return this.get().rowLevelLockEnforcement;
  },
};

export default featureFlags;
