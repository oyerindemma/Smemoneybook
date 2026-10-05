ALTER TABLE "PredictiveAlert"
  ADD COLUMN "ruleKey" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "severityLevel" TEXT,
  ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "evidence" JSONB,
  ADD COLUMN "formulaReference" TEXT,
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd" TIMESTAMP(3),
  ADD COLUMN "firstDetectedAt" TIMESTAMP(3),
  ADD COLUMN "lastDetectedAt" TIMESTAMP(3),
  ADD COLUMN "dismissedReason" TEXT,
  ADD COLUMN "resolutionNote" TEXT,
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedByUserId" TEXT,
  ADD COLUMN "deliveryCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "PredictiveAlert"
SET
  "ruleKey" = COALESCE("ruleKey", "type"),
  "category" = COALESCE("category", "type"),
  "severityLevel" = COALESCE(
    "severityLevel",
    CASE
      WHEN "severity" = 'critical' THEN 'critical'
      WHEN "severity" = 'warning' THEN 'medium'
      ELSE 'information'
    END
  ),
  "lifecycleStatus" = CASE
    WHEN "status" = 'confirmed' THEN 'acknowledged'
    WHEN "status" = 'incorrect' THEN 'dismissed'
    ELSE "status"
  END,
  "dedupeKey" = COALESCE("dedupeKey", "alertKey"),
  "periodStart" = COALESCE("periodStart", "sourcePeriodStart"),
  "periodEnd" = COALESCE("periodEnd", "sourcePeriodEnd"),
  "firstDetectedAt" = COALESCE("firstDetectedAt", "detectedAt"),
  "lastDetectedAt" = COALESCE("lastDetectedAt", "detectedAt"),
  "formulaReference" = COALESCE("formulaReference", 'predictive-alerts-v1')
WHERE "ruleKey" IS NULL
   OR "category" IS NULL
   OR "severityLevel" IS NULL
   OR "dedupeKey" IS NULL
   OR "periodStart" IS NULL
   OR "periodEnd" IS NULL
   OR "firstDetectedAt" IS NULL
   OR "lastDetectedAt" IS NULL
   OR "formulaReference" IS NULL;

CREATE INDEX "PredictiveAlert_businessId_lifecycleStatus_lastDetectedAt_idx"
  ON "PredictiveAlert"("businessId", "lifecycleStatus", "lastDetectedAt");

CREATE INDEX "PredictiveAlert_businessId_ruleKey_lifecycleStatus_idx"
  ON "PredictiveAlert"("businessId", "ruleKey", "lifecycleStatus");

CREATE INDEX "PredictiveAlert_businessId_category_lifecycleStatus_idx"
  ON "PredictiveAlert"("businessId", "category", "lifecycleStatus");

CREATE TABLE "PredictiveAlertRule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "thresholdConfig" JSONB NOT NULL,
  "requiredHistoryDays" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT NOT NULL,
  "formulaReference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PredictiveAlertRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PredictiveAlertRule_key_key" ON "PredictiveAlertRule"("key");
CREATE INDEX "PredictiveAlertRule_category_enabled_idx" ON "PredictiveAlertRule"("category", "enabled");

CREATE TABLE "BusinessAlertPreference" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "ruleKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "severityOverride" TEXT,
  "thresholdOverride" JSONB,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
  "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BusinessAlertPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessAlertPreference_businessId_ruleKey_key"
  ON "BusinessAlertPreference"("businessId", "ruleKey");
CREATE INDEX "BusinessAlertPreference_businessId_enabled_idx"
  ON "BusinessAlertPreference"("businessId", "enabled");

CREATE TABLE "PredictiveAlertDelivery" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "destinationMasked" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PredictiveAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PredictiveAlertDelivery_businessId_channel_attemptedAt_idx"
  ON "PredictiveAlertDelivery"("businessId", "channel", "attemptedAt");
CREATE INDEX "PredictiveAlertDelivery_alertId_attemptedAt_idx"
  ON "PredictiveAlertDelivery"("alertId", "attemptedAt");

ALTER TABLE "BusinessAlertPreference" ADD CONSTRAINT "BusinessAlertPreference_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PredictiveAlertDelivery" ADD CONSTRAINT "PredictiveAlertDelivery_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PredictiveAlertDelivery" ADD CONSTRAINT "PredictiveAlertDelivery_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "PredictiveAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PredictiveAlertRule" (
  "id",
  "key",
  "category",
  "version",
  "severity",
  "thresholdConfig",
  "requiredHistoryDays",
  "enabled",
  "description",
  "formulaReference"
) VALUES
  ('predictive_rule_sales_decline_v2', 'sales_decline', 'sales_decline', 'predictive-alerts-v2', 'high', '{"minimumTransactions":2,"minimumPreviousSales":20000,"minimumDropAmount":20000,"dropPercent":30}', 60, true, 'Recorded sales declined against a comparable prior period.', 'predictive.sales_decline.v2'),
  ('predictive_rule_expense_spike_v2', 'expense_spike', 'unusual_expense_increase', 'predictive-alerts-v2', 'medium', '{"minimumTransactions":2,"minimumIncreaseAmount":25000,"increasePercent":40}', 60, true, 'Recorded expenses increased materially against the baseline.', 'predictive.expense_spike.v2'),
  ('predictive_rule_receivables_concentration_v2', 'receivables_concentration', 'customer_debt_risk', 'predictive-alerts-v2', 'medium', '{"minimumDebtAmount":25000,"concentrationPercent":45}', 1, true, 'Open customer debt is concentrated in one customer.', 'predictive.receivables_concentration.v2'),
  ('predictive_rule_overdue_debt_increase_v2', 'overdue_debt_increase', 'customer_debt_risk', 'predictive-alerts-v2', 'high', '{"minimumOverdueAmount":25000,"minimumIncreaseAmount":15000,"increasePercent":25}', 60, true, 'Overdue customer debt increased or remains material.', 'predictive.overdue_debt_increase.v2'),
  ('predictive_rule_supplier_payment_pressure_v2', 'supplier_payment_pressure', 'supplier_payment_pressure', 'predictive-alerts-v2', 'medium', '{"minimumSupplierObligations":25000,"dueSoonDays":7}', 1, true, 'Supplier obligations are overdue or coming due soon.', 'predictive.supplier_payment_pressure.v2'),
  ('predictive_rule_low_stock_risk_v2', 'low_stock_risk', 'low_stock', 'predictive-alerts-v2', 'medium', '{"minimumStockValue":5000}', 7, true, 'Current stock is at or below the reorder threshold.', 'predictive.low_stock_risk.v2'),
  ('predictive_rule_stock_out_forecast_v2', 'stock_out_forecast', 'stock_out_risk', 'predictive-alerts-v2', 'high', '{"forecastDays":7,"minimumSalesQuantity":2}', 30, true, 'Trailing sales velocity indicates possible stock-out risk.', 'predictive.stock_out_forecast.v2'),
  ('predictive_rule_slow_moving_stock_v2', 'slow_moving_stock', 'slow_moving_stock', 'predictive-alerts-v2', 'low', '{"minimumStockValue":25000,"lookbackDays":30}', 30, true, 'High-value stock has not sold in the trailing period.', 'predictive.slow_moving_stock.v2'),
  ('predictive_rule_reconciliation_backlog_v2', 'reconciliation_backlog', 'reconciliation_backlog', 'predictive-alerts-v2', 'medium', '{"minimumUnresolvedRows":3,"minimumUnresolvedAmount":50000,"minimumAgeDays":7}', 30, true, 'Imported bank rows remain unresolved or stale.', 'predictive.reconciliation_backlog.v2'),
  ('predictive_rule_duplicate_import_risk_v2', 'duplicate_import_risk', 'duplicate_bank_entries', 'predictive-alerts-v2', 'medium', '{"minimumDuplicateRows":1,"minimumDuplicateAmount":10000}', 30, true, 'Bank imports contain duplicate or probable duplicate rows.', 'predictive.duplicate_import_risk.v2'),
  ('predictive_rule_tax_readiness_gap_v2', 'tax_readiness_gap', 'tax_readiness_issues', 'predictive-alerts-v2', 'medium', '{"minimumOpenItems":1,"criticalItemWeight":2}', 30, true, 'Tax review items or setup gaps need attention.', 'predictive.tax_readiness_gap.v2'),
  ('predictive_rule_missing_data_risk_v2', 'missing_data_risk', 'missing_data_risk', 'predictive-alerts-v2', 'medium', '{"minimumAmount":25000,"missingDataPercent":25}', 30, true, 'Large amounts are missing categories, counterparties, or source detail.', 'predictive.missing_data_risk.v2'),
  ('predictive_rule_staff_attribution_anomaly_v2', 'staff_attribution_anomaly', 'staff_attribution_anomalies', 'predictive-alerts-v2', 'low', '{"minimumTransactions":3,"minimumUnattributedPercent":50}', 30, true, 'Operational activity has weak staff attribution.', 'predictive.staff_attribution_anomaly.v2'),
  ('predictive_rule_cash_pressure_indicator_v2', 'cash_pressure_indicator', 'cash_flow_pressure', 'predictive-alerts-v2', 'high', '{"minimumPressureAmount":30000,"supplierWeight":1}', 30, true, 'Recorded inflows may not cover recorded outflows and obligations.', 'predictive.cash_pressure_indicator.v2'),
  ('predictive_rule_subscription_setup_risk_v2', 'subscription_setup_risk', 'subscription_or_setup_risks', 'predictive-alerts-v2', 'information', '{"requiresOnboardingComplete":true}', 1, true, 'Business setup or subscription state may block reliable alerts.', 'predictive.subscription_setup_risk.v2')
ON CONFLICT ("key") DO NOTHING;
