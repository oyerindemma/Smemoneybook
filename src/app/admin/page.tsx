import Link from "next/link";
import { redirect } from "next/navigation";
import { OfflineSyncStatus, SubscriptionStatus, TransactionType } from "@prisma/client";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Bot,
  Clock3,
  CreditCard,
  Database,
  HandCoins,
  HeartPulse,
  Landmark,
  MessageSquareText,
  MousePointerClick,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserPlus,
  Users,
  Webhook,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminAiOperationsOverview } from "@/lib/phase3/admin-ai-operations";
import { phase3FeatureFlags } from "@/lib/phase3/feature-flags";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Tone = "neutral" | "good" | "warn" | "danger";

export default async function AdminPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/?next=/admin");
  }

  const adminAccess = getAdminAccess(user.email);

  if (!adminAccess.allowed) {
    redirect("/");
  }

  const [data, adminAiOperations] = await Promise.all([
    getAdminDashboardData(),
    phase3FeatureFlags.adminAiOperations ? getAdminAiOperationsOverview() : Promise.resolve(null),
  ]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <ShieldCheck size={18} aria-hidden="true" />
              SME MoneyBook Admin
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Internal operations dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              User, subscription, revenue, activity, and infrastructure monitoring in the approved operations layout.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-2 font-medium text-slate-600 shadow-sm">
              Signed in as {user.email}
            </span>
            <Link
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 font-semibold text-white shadow-sm hover:bg-slate-800"
              href="/admin"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </Link>
          </div>
        </header>

        {adminAccess.isDevelopmentFallback ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            `ADMIN_EMAILS` is not set, so `/admin` is open to signed-in users in development only.
          </section>
        ) : null}

        <AdminRow columns={4}>
          <MetricCard
            icon={<Users size={20} />}
            label="Total Users"
            value={formatCount(data.users.total)}
            detail={`${formatCount(data.users.newLast30Days)} joined in 30 days`}
          />
          <MetricCard
            icon={<CreditCard size={20} />}
            label="Active Subscribers"
            value={formatCount(data.subscriptions.active)}
            detail={`${formatCount(data.subscriptions.pastDue)} past due`}
            tone={data.subscriptions.pastDue > 0 ? "warn" : "good"}
          />
          <MetricCard
            icon={<Banknote size={20} />}
            label="MRR"
            value={formatNaira(data.revenue.mrrKobo / 100)}
            detail={`${formatNaira(data.revenue.paidLast30DaysKobo / 100)} paid in 30 days`}
            tone="good"
          />
          <MetricCard
            icon={<HeartPulse size={20} />}
            label="System Health"
            value={data.systemHealth.statusLabel}
            detail={`${data.systemHealth.apiErrors24h} API errors in 24h`}
            tone={data.systemHealth.tone}
          />
        </AdminRow>

        <AdminRow columns={4}>
          <MetricCard
            icon={<Activity size={20} />}
            label="DAU"
            value={formatCount(data.users.dau)}
            detail="Users active in 24 hours"
          />
          <MetricCard
            icon={<Activity size={20} />}
            label="WAU"
            value={formatCount(data.users.wau)}
            detail="Users active in 7 days"
          />
          <MetricCard
            icon={<Activity size={20} />}
            label="MAU"
            value={formatCount(data.users.mau)}
            detail="Users active in 30 days"
          />
          <MetricCard
            icon={<TrendingDown size={20} />}
            label="Churn"
            value={`${data.revenue.churnRate.toFixed(1)}%`}
            detail={`${formatCount(data.subscriptions.canceled)} canceled subscriptions`}
            tone={data.revenue.churnRate > 8 ? "warn" : "neutral"}
          />
        </AdminRow>

        <AdminRow columns={2}>
          <Panel title="User Funnel" action="Acquisition to activation">
            <Funnel steps={data.funnel} />
          </Panel>
          <Panel title="Revenue Analytics" action="Billing performance">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="MRR" value={formatNaira(data.revenue.mrrKobo / 100)} />
              <MiniStat label="ARPA" value={formatNaira(data.revenue.arpaKobo / 100)} />
              <MiniStat label="30 day paid" value={formatNaira(data.revenue.paidLast30DaysKobo / 100)} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Breakdown title="Plan mix" items={data.subscriptions.byPlan} />
              <Breakdown title="Status mix" items={data.subscriptions.byStatus} />
            </div>
          </Panel>
        </AdminRow>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white/60 p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Sparkles size={17} aria-hidden="true" />
                Customer Success & Growth Intelligence
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                Retention, expansion, and account health
              </h2>
            </div>
            <span className="text-xs font-semibold uppercase text-slate-500">Live database signals</span>
          </div>

          <AdminRow columns={3}>
            <Panel title="Businesses at Risk" action="Needs attention">
              <BusinessRiskList businesses={data.growth.businessesAtRisk} />
            </Panel>
            <Panel title="Subscription Forecasting" action="Next 30 days">
              <div className="grid gap-3">
                <MiniStat label="Projected MRR" value={formatNaira(data.growth.subscriptionForecast.projectedMrrKobo / 100)} />
                <MiniStat label="Renewals due" value={formatCount(data.growth.subscriptionForecast.renewalsDue30Days)} />
                <MiniStat label="Past due revenue" value={formatNaira(data.growth.subscriptionForecast.pastDueRevenueKobo / 100)} />
              </div>
            </Panel>
            <Panel title="Cohort Retention" action="Last 6 signup cohorts">
              <CohortRetention cohorts={data.growth.cohortRetention} />
            </Panel>
          </AdminRow>

          <AdminRow columns={2}>
            <Panel title="Failed Payments" action="Billing risk">
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniStat label="Past due subs" value={formatCount(data.growth.failedPayments.pastDueSubscriptions)} />
                <MiniStat label="Failed events" value={formatCount(data.growth.failedPayments.failedPaymentEvents30Days)} />
                <MiniStat label="Failed revenue" value={formatNaira(data.growth.failedPayments.pastDueRevenueKobo / 100)} />
              </div>
              <PaymentFailureList failures={data.growth.failedPayments.recentFailures} />
            </Panel>
            <Panel title="Top Businesses" action="Last 30 days">
              <TopBusinessList businesses={data.growth.topBusinesses} />
            </Panel>
          </AdminRow>
        </section>

        {adminAiOperations ? (
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white/60 p-4 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Bot size={17} aria-hidden="true" />
                  AI Operations
                </div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                  Quality, cost, and intervention signals
                </h2>
              </div>
              <span className="text-xs font-semibold uppercase text-slate-500">
                {adminAiOperations.operationalStatus}
              </span>
            </div>

            <AdminRow columns={4}>
              <MetricCard
                icon={<Bot size={20} />}
                label="AI Requests"
                value={formatCount(adminAiOperations.aiRequestVolume)}
                detail={`${formatNaira(adminAiOperations.aiCostKobo / 100)} estimated cost`}
              />
              <MetricCard
                icon={<Clock3 size={20} />}
                label="Latency"
                value={adminAiOperations.averageLatencyMs === null ? "N/A" : `${adminAiOperations.averageLatencyMs} ms`}
                detail={`p95 ${adminAiOperations.p95LatencyMs === null ? "N/A" : `${adminAiOperations.p95LatencyMs} ms`}`}
                tone={adminAiOperations.averageLatencyMs && adminAiOperations.averageLatencyMs > 5_000 ? "warn" : "neutral"}
              />
              <MetricCard
                icon={<AlertTriangle size={20} />}
                label="Tool Failure Rate"
                value={formatRate(adminAiOperations.toolFailureRate)}
                detail="Server-side assistant tools"
                tone={rateTone(adminAiOperations.toolFailureRate, 5, 15)}
              />
              <MetricCard
                icon={<BarChart3 size={20} />}
                label="Anomaly Precision"
                value={formatRate(adminAiOperations.anomalyPrecision)}
                detail={`${formatCount(adminAiOperations.anomalyIncorrect)} marked incorrect`}
                tone={inverseRateTone(adminAiOperations.anomalyPrecision, 70, 50)}
              />
            </AdminRow>

            <AdminRow columns={3}>
              <Panel title="AI Quality" action="Last 30 days">
                <div className="grid gap-3">
                  <HealthItem icon={<MousePointerClick size={18} />} label="Recommendation acceptance" value={formatRate(adminAiOperations.recommendationAcceptanceRate)} tone={inverseRateTone(adminAiOperations.recommendationAcceptanceRate, 60, 40)} />
                  <HealthItem icon={<ShieldCheck size={18} />} label="Categorization accuracy" value={formatRate(adminAiOperations.categorizationAccuracy)} tone={inverseRateTone(adminAiOperations.categorizationAccuracy, 80, 60)} />
                  <HealthItem icon={<Activity size={18} />} label="Forecast accuracy" value={formatRate(adminAiOperations.forecastAccuracyPercent)} tone={inverseRateTone(adminAiOperations.forecastAccuracyPercent, 70, 50)} />
                </div>
              </Panel>
              <Panel title="Operations Backlog" action="No content exposed">
                <div className="grid gap-3">
                  <HealthItem icon={<Landmark size={18} />} label="Bank import failures" value={formatCount(adminAiOperations.bankImportFailures)} tone={adminAiOperations.bankImportFailures > 0 ? "warn" : "good"} />
                  <HealthItem icon={<Database size={18} />} label="Reconciliation backlog" value={formatCount(adminAiOperations.reconciliationBacklog)} tone={adminAiOperations.reconciliationBacklog > 25 ? "warn" : "good"} />
                  <HealthItem icon={<AlertTriangle size={18} />} label="Payroll failures" value={formatCount(adminAiOperations.payrollFailures)} tone={adminAiOperations.payrollFailures > 0 ? "danger" : "good"} />
                </div>
              </Panel>
              <Panel title="Customer Success" action="Interventions">
                <div className="grid gap-3">
                  <HealthItem icon={<HeartPulse size={18} />} label="At-risk businesses" value={formatCount(adminAiOperations.atRiskBusinesses)} tone={adminAiOperations.atRiskBusinesses > 0 ? "warn" : "good"} />
                  <HealthItem icon={<HandCoins size={18} />} label="Cooperative arrears" value={formatCount(adminAiOperations.cooperativeArrears)} tone={adminAiOperations.cooperativeArrears > 0 ? "warn" : "good"} />
                  <HealthItem icon={<UserPlus size={18} />} label="CS interventions" value={formatCount(adminAiOperations.customerSuccessInterventions)} tone="neutral" />
                </div>
              </Panel>
            </AdminRow>

            <AdminRow columns={2}>
              <Panel title="WhatsApp Message Health" action="Automation jobs">
                <div className="grid gap-3 sm:grid-cols-4">
                  <MiniStat label="Sent" value={formatCount(adminAiOperations.whatsappMessageHealth.sent)} />
                  <MiniStat label="Queued" value={formatCount(adminAiOperations.whatsappMessageHealth.queued)} />
                  <MiniStat label="Failed" value={formatCount(adminAiOperations.whatsappMessageHealth.failed)} />
                  <MiniStat label="Failure rate" value={formatRate(adminAiOperations.whatsappMessageHealth.failureRate)} />
                </div>
              </Panel>
              <Panel title="Tax Assistant Usage" action="Snapshots">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Tax summaries" value={formatCount(adminAiOperations.taxAssistantUsage)} />
                  <MiniStat label="Risk signals" value={formatCount(adminAiOperations.operationalRiskSignals)} />
                </div>
              </Panel>
            </AdminRow>
          </section>
        ) : null}

        <AdminRow columns={2}>
          <Panel title="Feature Usage" action="Last 30 days unless noted">
            <div className="grid gap-3 sm:grid-cols-2">
              <HealthItem icon={<MousePointerClick size={18} />} label="Transactions" value={formatCount(data.activity.transactions30Days)} tone="neutral" />
              <HealthItem icon={<Bot size={18} />} label="AI assistant messages" value={formatCount(data.activity.assistantMessages30Days)} tone="neutral" />
              <HealthItem icon={<CreditCard size={18} />} label="Receipts extracted" value={formatCount(data.activity.receipts30Days)} tone="neutral" />
              <HealthItem icon={<BarChart3 size={18} />} label="Reports saved" value={formatCount(data.activity.reports30Days)} tone="neutral" />
              <HealthItem icon={<UserPlus size={18} />} label="Staff invites" value={formatCount(data.activity.staffInvites30Days)} tone="neutral" />
              <HealthItem icon={<Clock3 size={18} />} label="Pending AI actions" value={formatCount(data.activity.pendingAssistantActions)} tone={data.activity.pendingAssistantActions > 20 ? "warn" : "good"} />
            </div>
          </Panel>
          <Panel title="Business Categories" action={`${formatCount(data.businesses.total)} businesses`}>
            <Breakdown title="Business type distribution" items={data.businesses.byType} />
          </Panel>
        </AdminRow>

        <AdminRow columns={2}>
          <Panel title="Referral Analytics" action="Stored referral signals">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="Referred signups" value={formatCount(data.referrals.invitesCreated30Days)} />
              <MiniStat label="Rewards issued" value={formatCount(data.referrals.invitesAccepted30Days)} />
              <MiniStat label="Pending rewards" value={formatCount(data.referrals.pendingRewards)} />
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
              Viral share clicks are tracked in product analytics; signup attribution and reward records are persisted in Postgres.
            </p>
          </Panel>
          <Panel title="WhatsApp Analytics" action="Messaging and webhook health">
            <div className="grid gap-3 sm:grid-cols-2">
              <HealthItem icon={<MessageSquareText size={18} />} label="Messages, 24h" value={formatCount(data.whatsapp.messages24h)} tone="neutral" />
              <HealthItem icon={<MessageSquareText size={18} />} label="Messages, 30d" value={formatCount(data.whatsapp.messages30Days)} tone="neutral" />
              <HealthItem icon={<Webhook size={18} />} label="Webhook events, 24h" value={formatCount(data.whatsapp.events24h)} tone="neutral" />
              <HealthItem icon={<AlertTriangle size={18} />} label="Webhook errors, 24h" value={formatCount(data.webhooks.whatsappErrors24h)} tone={data.webhooks.whatsappErrors24h > 0 ? "warn" : "good"} />
            </div>
          </Panel>
        </AdminRow>

        <AdminRow columns={2}>
          <Panel title="Recent Users" action="Latest 8">
            <RecentUsers users={data.users.recent} />
          </Panel>
          <Panel title="Error Logs" action="Latest 8">
            <ErrorLogs logs={data.systemHealth.errorLogs} />
          </Panel>
        </AdminRow>

        <AdminRow columns={3}>
          <Panel title="Webhooks" action="Last 24 hours">
            <div className="grid gap-3">
              <HealthItem icon={<Webhook size={18} />} label="WhatsApp events" value={formatCount(data.webhooks.whatsappEvents24h)} tone="neutral" />
              <HealthItem icon={<Send size={18} />} label="Paystack events" value={formatCount(data.webhooks.paystackEvents24h)} tone="neutral" />
              <HealthItem icon={<AlertTriangle size={18} />} label="Webhook errors" value={formatCount(data.webhooks.totalErrors24h)} tone={data.webhooks.totalErrors24h > 0 ? "warn" : "good"} />
            </div>
          </Panel>
          <Panel title="Queue Monitoring" action="Backlog">
            <div className="grid gap-3">
              <HealthItem icon={<Clock3 size={18} />} label="Offline capture backlog" value={formatCount(data.queue.offlineBacklog)} tone={data.queue.offlineBacklog > 0 ? "warn" : "good"} />
              <HealthItem icon={<AlertTriangle size={18} />} label="Offline sync failed" value={formatCount(data.queue.offlineSyncFailed)} tone={data.queue.offlineSyncFailed > 0 ? "warn" : "good"} />
              <HealthItem icon={<AlertTriangle size={18} />} label="Offline sync conflicts" value={formatCount(data.queue.offlineSyncConflicts)} tone={data.queue.offlineSyncConflicts > 0 ? "danger" : "good"} />
              <HealthItem icon={<Bot size={18} />} label="Pending AI actions" value={formatCount(data.queue.pendingAssistantActions)} tone={data.queue.pendingAssistantActions > 20 ? "warn" : "good"} />
              <HealthItem icon={<Activity size={18} />} label="Automation failures, 24h" value={formatCount(data.queue.automationFailures24h)} tone={data.queue.automationFailures24h > 0 ? "warn" : "good"} />
            </div>
            <OfflineSyncOperationList operations={data.queue.recentOfflineSyncOperations} />
          </Panel>
          <Panel title="Database Monitoring" action="Live tables">
            <div className="grid gap-3">
              <HealthItem icon={<Database size={18} />} label="Connection" value="Connected" tone="good" />
              <HealthItem icon={<Server size={18} />} label="Core records" value={formatCount(data.database.coreRecords)} tone="neutral" />
              <HealthItem icon={<AlertTriangle size={18} />} label="API errors, 24h" value={formatCount(data.systemHealth.apiErrors24h)} tone={data.systemHealth.apiErrors24h > 10 ? "danger" : data.systemHealth.apiErrors24h > 0 ? "warn" : "good"} />
            </div>
          </Panel>
        </AdminRow>
      </div>
    </main>
  );
}

async function getAdminDashboardData() {
  const prisma = getPrisma();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last180Days = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsers7,
    newUsers30,
    dauSessions,
    wauSessions,
    mauSessions,
    totalBusinesses,
    totalMemberships,
    businessesByType,
    recentUsers,
    activeSubscriptions,
    pastDueSubscriptions,
    canceledSubscriptions,
    totalSubscriptions,
    subscriptionPlanGroups,
    subscriptionStatusGroups,
    activeMrr,
    paidRevenue30,
    transactions30,
    transactionsToday,
    sales30,
    expenses30,
    receipts30,
    reports30,
    staffInvites30,
    referralAttributions30,
    referralRewards30,
    pendingReferralRewards,
    whatsapp24,
    whatsapp30,
    whatsappEvents24,
    paystackEvents24,
    assistantMessages30,
    pendingAssistantActions,
    apiErrors24,
    errorLogs,
    offlineBacklog,
    offlineSyncFailed,
    offlineSyncConflicts,
    recentOfflineSyncOperations,
    automationFailures24,
    renewalsDue30,
    trialingMrr,
    pastDueRevenue,
    failedPaymentEvents30,
    recentPaymentFailures,
    atRiskBusinessCandidates,
    cohortUsers,
    topBusinessTransactionGroups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: last7Days } } }),
    prisma.user.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.session.findMany({ where: { lastSeenAt: { gte: last24h } }, distinct: ["userId"], select: { userId: true } }),
    prisma.session.findMany({ where: { lastSeenAt: { gte: last7Days } }, distinct: ["userId"], select: { userId: true } }),
    prisma.session.findMany({ where: { lastSeenAt: { gte: last30Days } }, distinct: ["userId"], select: { userId: true } }),
    prisma.business.count(),
    prisma.businessMember.count(),
    prisma.business.groupBy({ by: ["businessType"], _count: { _all: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            sessions: true,
            subscriptions: true,
          },
        },
      },
    }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.CANCELED } }),
    prisma.subscription.count(),
    prisma.subscription.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscription.aggregate({
      where: { status: SubscriptionStatus.ACTIVE },
      _sum: { amountMonthlyKobo: true },
    }),
    prisma.subscription.aggregate({
      where: {
        status: SubscriptionStatus.ACTIVE,
        paidAt: { gte: last30Days },
      },
      _sum: { amountMonthlyKobo: true },
    }),
    prisma.transaction.count({ where: { occurredAt: { gte: last30Days } } }),
    prisma.transaction.count({ where: { occurredAt: { gte: startOfToday } } }),
    prisma.transaction.aggregate({
      where: { type: TransactionType.SALE, occurredAt: { gte: last30Days } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: TransactionType.EXPENSE, occurredAt: { gte: last30Days } },
      _sum: { amount: true },
    }),
    prisma.receipt.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.reportSnapshot.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.businessInvitation.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.referralAttribution.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.referralReward.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.referralReward.count({ where: { status: "PENDING" } }),
    prisma.whatsAppMessage.count({ where: { createdAt: { gte: last24h } } }),
    prisma.whatsAppMessage.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.whatsAppEvent.count({ where: { createdAt: { gte: last24h } } }),
    prisma.paymentEvent.count({ where: { processedAt: { gte: last24h } } }),
    prisma.assistantMessage.count({ where: { createdAt: { gte: last30Days } } }),
    prisma.pendingAssistantAction.count({ where: { status: "pending" } }),
    prisma.apiErrorLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.apiErrorLog.findMany({
      where: { createdAt: { gte: last24h } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        route: true,
        method: true,
        message: true,
        code: true,
        createdAt: true,
      },
    }),
    prisma.offlineCapture.count({ where: { status: { in: ["received", "failed"] } } }),
    prisma.offlineSyncOperation.count({ where: { status: OfflineSyncStatus.FAILED } }),
    prisma.offlineSyncOperation.count({ where: { status: OfflineSyncStatus.CONFLICT } }),
    prisma.offlineSyncOperation.findMany({
      where: { status: { in: [OfflineSyncStatus.FAILED, OfflineSyncStatus.CONFLICT] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        operationType: true,
        status: true,
        retryCount: true,
        lastError: true,
        updatedAt: true,
        business: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.automationLog.count({
      where: {
        createdAt: { gte: last24h },
        status: { in: ["failed", "error"] },
      },
    }),
    prisma.subscription.count({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: {
          gte: now,
          lte: next30Days,
        },
      },
    }),
    prisma.subscription.aggregate({
      where: { status: SubscriptionStatus.TRIALING },
      _sum: { amountMonthlyKobo: true },
    }),
    prisma.subscription.aggregate({
      where: { status: SubscriptionStatus.PAST_DUE },
      _sum: { amountMonthlyKobo: true },
    }),
    prisma.paymentEvent.count({
      where: {
        processedAt: { gte: last30Days },
        eventType: { not: "charge.success" },
      },
    }),
    prisma.paymentEvent.findMany({
      where: {
        processedAt: { gte: last30Days },
        eventType: { not: "charge.success" },
      },
      orderBy: { processedAt: "desc" },
      take: 5,
      select: {
        id: true,
        reference: true,
        eventType: true,
        processedAt: true,
      },
    }),
    prisma.business.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        businessType: true,
        createdAt: true,
        transactions: {
          where: { occurredAt: { gte: last14Days } },
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { occurredAt: true },
        },
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            status: true,
            amountMonthlyKobo: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: last180Days } },
      select: {
        id: true,
        createdAt: true,
        sessions: {
          where: { lastSeenAt: { gte: last30Days } },
          take: 1,
          select: { id: true },
        },
      },
    }),
    prisma.transaction.groupBy({
      by: ["businessId"],
      where: { occurredAt: { gte: last30Days } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const webhookErrors24 = errorLogs.filter((log) => log.route.includes("/webhook")).length;
  const whatsappErrors24 = errorLogs.filter((log) => log.route.includes("/webhooks/whatsapp")).length;
  const healthSignals = [apiErrors24 > 10, offlineBacklog > 25, automationFailures24 > 0, pastDueSubscriptions > 10];
  const healthRiskCount = healthSignals.filter(Boolean).length;
  const mrrKobo = activeMrr._sum.amountMonthlyKobo ?? 0;
  const topBusinessIds = topBusinessTransactionGroups
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 6)
    .map((group) => group.businessId);
  const topBusinessNames = topBusinessIds.length > 0
    ? await prisma.business.findMany({
        where: { id: { in: topBusinessIds } },
        select: {
          id: true,
          name: true,
          businessType: true,
        },
      })
    : [];
  const topBusinessNameMap = new Map(topBusinessNames.map((business) => [business.id, business]));

  return {
    users: {
      total: totalUsers,
      newLast7Days: newUsers7,
      newLast30Days: newUsers30,
      dau: dauSessions.length,
      wau: wauSessions.length,
      mau: mauSessions.length,
      recent: recentUsers.map((recentUser) => ({
        id: recentUser.id,
        name: recentUser.name,
        email: recentUser.email,
        createdAt: recentUser.createdAt,
        businesses: recentUser._count.members,
        sessions: recentUser._count.sessions,
        subscriptions: recentUser._count.subscriptions,
      })),
    },
    businesses: {
      total: totalBusinesses,
      memberships: totalMemberships,
      byType: businessesByType
        .map((group) => ({
          label: group.businessType || "Uncategorized",
          value: group._count._all,
        }))
        .sort((a, b) => b.value - a.value),
    },
    subscriptions: {
      active: activeSubscriptions,
      pastDue: pastDueSubscriptions,
      canceled: canceledSubscriptions,
      total: totalSubscriptions,
      byPlan: subscriptionPlanGroups
        .map((group) => ({ label: toTitleCase(group.plan), value: group._count._all }))
        .sort((a, b) => b.value - a.value),
      byStatus: subscriptionStatusGroups
        .map((group) => ({ label: toTitleCase(group.status), value: group._count._all }))
        .sort((a, b) => b.value - a.value),
    },
    revenue: {
      mrrKobo,
      paidLast30DaysKobo: paidRevenue30._sum.amountMonthlyKobo ?? 0,
      arpaKobo: activeSubscriptions > 0 ? Math.round(mrrKobo / activeSubscriptions) : 0,
      churnRate: totalSubscriptions > 0 ? (canceledSubscriptions / totalSubscriptions) * 100 : 0,
    },
    funnel: [
      { label: "Registered users", value: totalUsers },
      { label: "Created businesses", value: totalBusinesses },
      { label: "Recorded activity", value: transactions30 },
      { label: "Active subscribers", value: activeSubscriptions },
    ],
    growth: {
      businessesAtRisk: atRiskBusinessCandidates
        .map((business) => {
          const subscription = business.subscriptions[0];
          const reasons = [
            business.transactions.length === 0 ? "No records in 14 days" : null,
            subscription?.status === SubscriptionStatus.PAST_DUE ? "Past due subscription" : null,
          ].filter(Boolean) as string[];

          return {
            id: business.id,
            name: business.name,
            businessType: business.businessType || "Uncategorized",
            createdAt: business.createdAt,
            subscriptionStatus: subscription?.status ? toTitleCase(subscription.status) : "No subscription",
            revenueAtRiskKobo: subscription?.status === SubscriptionStatus.PAST_DUE ? subscription.amountMonthlyKobo : 0,
            reasons,
          };
        })
        .filter((business) => business.reasons.length > 0)
        .sort((a, b) => b.revenueAtRiskKobo - a.revenueAtRiskKobo)
        .slice(0, 6),
      subscriptionForecast: {
        projectedMrrKobo: mrrKobo + (trialingMrr._sum.amountMonthlyKobo ?? 0) - (pastDueRevenue._sum.amountMonthlyKobo ?? 0),
        renewalsDue30Days: renewalsDue30,
        pastDueRevenueKobo: pastDueRevenue._sum.amountMonthlyKobo ?? 0,
      },
      cohortRetention: buildCohortRetention(cohortUsers),
      failedPayments: {
        pastDueSubscriptions,
        failedPaymentEvents30Days: failedPaymentEvents30,
        pastDueRevenueKobo: pastDueRevenue._sum.amountMonthlyKobo ?? 0,
        recentFailures: recentPaymentFailures.map((failure) => ({
          id: failure.id,
          reference: failure.reference,
          eventType: failure.eventType,
          processedAt: failure.processedAt,
        })),
      },
      topBusinesses: topBusinessTransactionGroups
        .sort((a, b) => b._count._all - a._count._all)
        .slice(0, 6)
        .map((group) => {
          const business = topBusinessNameMap.get(group.businessId);

          return {
            id: group.businessId,
            name: business?.name ?? "Unknown business",
            businessType: business?.businessType ?? "Uncategorized",
            transactions: group._count._all,
            volume: decimalToNumber(group._sum.amount),
          };
        }),
    },
    activity: {
      transactions30Days: transactions30,
      transactionsToday,
      sales30Days: decimalToNumber(sales30._sum.amount),
      expenses30Days: decimalToNumber(expenses30._sum.amount),
      receipts30Days: receipts30,
      reports30Days: reports30,
      staffInvites30Days: staffInvites30,
      assistantMessages30Days: assistantMessages30,
      pendingAssistantActions,
    },
    referrals: {
      invitesCreated30Days: referralAttributions30,
      invitesAccepted30Days: referralRewards30,
      acceptanceRate: referralAttributions30 > 0 ? (referralRewards30 / referralAttributions30) * 100 : 0,
      pendingRewards: pendingReferralRewards,
    },
    whatsapp: {
      messages24h: whatsapp24,
      messages30Days: whatsapp30,
      events24h: whatsappEvents24,
    },
    webhooks: {
      whatsappEvents24h: whatsappEvents24,
      paystackEvents24h: paystackEvents24,
      whatsappErrors24h: whatsappErrors24,
      totalErrors24h: webhookErrors24,
    },
    queue: {
      offlineBacklog,
      offlineSyncFailed,
      offlineSyncConflicts,
      recentOfflineSyncOperations: recentOfflineSyncOperations.map((operation) => ({
        id: operation.id,
        businessName: operation.business.name,
        operationType: operation.operationType,
        status: toTitleCase(operation.status),
        retryCount: operation.retryCount,
        lastError: operation.lastError,
        updatedAt: operation.updatedAt,
      })),
      pendingAssistantActions,
      automationFailures24h: automationFailures24,
    },
    database: {
      coreRecords: totalUsers + totalBusinesses + totalMemberships + transactions30 + totalSubscriptions,
    },
    systemHealth: {
      statusLabel: healthRiskCount === 0 ? "Healthy" : healthRiskCount === 1 ? "Watch" : "Needs attention",
      tone: healthRiskCount === 0 ? "good" as const : healthRiskCount === 1 ? "warn" as const : "danger" as const,
      apiErrors24h: apiErrors24,
      errorLogs,
    },
  };
}

function getAdminAccess(email: string) {
  const configuredAdmins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (configuredAdmins.length > 0) {
    return {
      allowed: configuredAdmins.includes(email.toLowerCase()),
      isDevelopmentFallback: false,
    };
  }

  return {
    allowed: process.env.NODE_ENV !== "production",
    isDevelopmentFallback: process.env.NODE_ENV !== "production",
  };
}

function AdminRow({
  columns,
  children,
}: {
  columns: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const columnClass = {
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
  }[columns];

  return <section className={`grid gap-4 ${columnClass}`}>{children}</section>;
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className={`rounded-lg p-2 ${toneClass(tone)}`}>{icon}</div>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <strong className="mt-1 block text-2xl font-semibold tracking-tight text-slate-950">{value}</strong>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </article>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {action ? <span className="text-xs font-semibold uppercase text-slate-500">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <strong className="mt-2 block text-lg font-semibold text-slate-950">{value}</strong>
    </div>
  );
}

function Funnel({ steps }: { steps: Array<{ label: string; value: number }> }) {
  const max = Math.max(...steps.map((step) => step.value), 1);

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{step.label}</span>
            <span className="font-semibold text-slate-950">{formatCount(step.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-950" style={{ width: `${Math.max(4, (step.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">{item.label}</span>
              <span className="font-semibold text-slate-950">{formatCount(item.value)}</span>
            </div>
          ))
        ) : (
          <EmptyState label="No records yet." />
        )}
      </div>
    </div>
  );
}

function HealthItem({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
      <div className={`rounded-lg p-2 ${toneClass(tone)}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-0.5 text-sm text-slate-600">{value}</p>
      </div>
    </div>
  );
}

function BusinessRiskList({
  businesses,
}: {
  businesses: Array<{
    id: string;
    name: string;
    businessType: string;
    subscriptionStatus: string;
    revenueAtRiskKobo: number;
    reasons: string[];
  }>;
}) {
  if (businesses.length === 0) {
    return <EmptyState label="No at-risk businesses from the current signals." />;
  }

  return (
    <div className="space-y-3">
      {businesses.map((business) => (
        <div key={business.id} className="rounded-lg border border-slate-100 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{business.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{business.businessType} · {business.subscriptionStatus}</p>
            </div>
            {business.revenueAtRiskKobo > 0 ? (
              <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">
                {formatNaira(business.revenueAtRiskKobo / 100)}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {business.reasons.map((reason) => (
              <span key={reason} className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                {reason}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CohortRetention({
  cohorts,
}: {
  cohorts: Array<{
    label: string;
    users: number;
    retained: number;
    retentionRate: number;
  }>;
}) {
  if (cohorts.length === 0) {
    return <EmptyState label="No signup cohorts in the last 6 months." />;
  }

  return (
    <div className="space-y-3">
      {cohorts.map((cohort) => (
        <div key={cohort.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{cohort.label}</span>
            <span className="font-semibold text-slate-950">{cohort.retentionRate.toFixed(1)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, cohort.retentionRate)}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatCount(cohort.retained)} retained of {formatCount(cohort.users)}
          </p>
        </div>
      ))}
    </div>
  );
}

function PaymentFailureList({
  failures,
}: {
  failures: Array<{
    id: string;
    reference: string;
    eventType: string;
    processedAt: Date;
  }>;
}) {
  if (failures.length === 0) {
    return <EmptyState label="No failed payment events recorded in the last 30 days." />;
  }

  return (
    <div className="mt-4 space-y-3">
      {failures.map((failure) => (
        <div key={failure.id} className="rounded-lg border border-slate-100 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-xs font-semibold text-slate-800">{failure.reference}</p>
            <span className="shrink-0 text-xs text-slate-500">{formatRelative(failure.processedAt)}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-rose-700">{failure.eventType}</p>
        </div>
      ))}
    </div>
  );
}

function OfflineSyncOperationList({
  operations,
}: {
  operations: Array<{
    id: string;
    businessName: string;
    operationType: string;
    status: string;
    retryCount: number;
    lastError: string | null;
    updatedAt: Date;
  }>;
}) {
  if (operations.length === 0) {
    return <EmptyState label="No failed offline sync operations." />;
  }

  return (
    <div className="mt-4 space-y-3">
      {operations.map((operation) => (
        <div key={operation.id} className="rounded-lg border border-slate-100 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {operation.businessName}
              </p>
              <p className="mt-0.5 text-xs font-semibold uppercase text-slate-500">
                {operation.operationType} · {operation.status} · {operation.retryCount} retries
              </p>
            </div>
            <span className="shrink-0 text-xs text-slate-500">
              {formatRelative(operation.updatedAt)}
            </span>
          </div>
          {operation.lastError ? (
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
              {operation.lastError}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function TopBusinessList({
  businesses,
}: {
  businesses: Array<{
    id: string;
    name: string;
    businessType: string;
    transactions: number;
    volume: number;
  }>;
}) {
  if (businesses.length === 0) {
    return <EmptyState label="No business activity in the last 30 days." />;
  }

  return (
    <div className="space-y-3">
      {businesses.map((business, index) => (
        <div key={business.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-bold text-white">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{business.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{business.businessType}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-950">{formatNaira(business.volume)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{formatCount(business.transactions)} records</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentUsers({
  users,
}: {
  users: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    businesses: number;
    sessions: number;
    subscriptions: number;
  }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="py-3 pr-3 font-semibold">User</th>
            <th className="px-3 py-3 font-semibold">Businesses</th>
            <th className="px-3 py-3 font-semibold">Sessions</th>
            <th className="px-3 py-3 font-semibold">Subscriptions</th>
            <th className="py-3 pl-3 font-semibold">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((recentUser) => (
            <tr key={recentUser.id}>
              <td className="py-3 pr-3">
                <p className="font-semibold text-slate-900">{recentUser.name}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{recentUser.email}</p>
              </td>
              <td className="px-3 py-3">{recentUser.businesses}</td>
              <td className="px-3 py-3">{recentUser.sessions}</td>
              <td className="px-3 py-3">{recentUser.subscriptions}</td>
              <td className="py-3 pl-3 text-slate-600">{formatDateTime(recentUser.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorLogs({
  logs,
}: {
  logs: Array<{
    id: string;
    route: string;
    method: string;
    message: string;
    code: string | null;
    createdAt: Date;
  }>;
}) {
  if (logs.length === 0) {
    return <EmptyState label="No API errors recorded in the last 24 hours." />;
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="rounded-lg border border-slate-100 p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate font-mono text-xs font-semibold text-slate-800">
              {log.method} {log.route}
            </p>
            <span className="shrink-0 text-xs text-slate-500">{formatRelative(log.createdAt)}</span>
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-600">{log.message}</p>
          {log.code ? <p className="mt-2 text-xs font-semibold text-rose-700">{log.code}</p> : null}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{label}</p>;
}

function toneClass(tone: Tone) {
  return {
    neutral: "bg-slate-100 text-slate-700",
    good: "bg-emerald-100 text-emerald-700",
    warn: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-700",
  }[tone];
}

function decimalToNumber(value: { toNumber: () => number } | number | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  return value?.toNumber() ?? 0;
}

function buildCohortRetention(
  users: Array<{
    createdAt: Date;
    sessions: Array<{ id: string }>;
  }>,
) {
  const cohorts = new Map<string, { users: number; retained: number; sortDate: Date }>();

  for (const user of users) {
    const label = new Intl.DateTimeFormat("en-NG", {
      month: "short",
      year: "numeric",
    }).format(user.createdAt);
    const existing = cohorts.get(label) ?? {
      users: 0,
      retained: 0,
      sortDate: new Date(user.createdAt.getFullYear(), user.createdAt.getMonth(), 1),
    };

    existing.users += 1;
    existing.retained += user.sessions.length > 0 ? 1 : 0;
    cohorts.set(label, existing);
  }

  return [...cohorts.entries()]
    .sort(([, a], [, b]) => b.sortDate.getTime() - a.sortDate.getTime())
    .map(([label, cohort]) => ({
      label,
      users: cohort.users,
      retained: cohort.retained,
      retentionRate: cohort.users > 0 ? (cohort.retained / cohort.users) * 100 : 0,
    }));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
}

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRate(value: number | null) {
  return value === null ? "N/A" : `${value.toFixed(1)}%`;
}

function rateTone(value: number | null, warnThreshold: number, dangerThreshold: number): Tone {
  if (value === null) {
    return "neutral";
  }

  if (value >= dangerThreshold) {
    return "danger";
  }

  return value >= warnThreshold ? "warn" : "good";
}

function inverseRateTone(value: number | null, goodThreshold: number, warnThreshold: number): Tone {
  if (value === null) {
    return "neutral";
  }

  if (value >= goodThreshold) {
    return "good";
  }

  return value >= warnThreshold ? "warn" : "danger";
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatRelative(value: Date) {
  const diffMinutes = Math.max(1, Math.round((Date.now() - value.getTime()) / 60_000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.round(diffHours / 24)}d ago`;
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
