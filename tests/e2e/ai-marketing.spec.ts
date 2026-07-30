import { expect, test, type Page, type Route } from "@playwright/test";

const flagsEnabled = [
  "NEXT_PUBLIC_PHASE3_AI_MARKETING_ENABLED",
  "PHASE3_AI_MARKETING_ENABLED",
].every((key) => ["1", "true", "yes", "on"].includes(String(process.env[key] ?? "").toLowerCase()));

test.describe("AI Marketing Preview workflow", () => {
  test.skip(!flagsEnabled, "AI Marketing Preview flags are not enabled for this test run.");

  test.beforeEach(async ({ page }) => {
    await mockDashboard(page);
    await page.route("**/api/billing/status", async (route) => {
      await json(route, 200, { billingLive: true, provider: "paystack" });
    });
  });

  test("creates, drafts, approves, blocks sending, exports, and records opt-out", async ({ page }) => {
    const unexpectedFailures: string[] = [];
    const state = createAiMarketingRouteState();
    await installAiMarketingRoutes(page, state);

    page.on("response", (response) => {
      if (
        (response.url().includes("/more/ai-marketing") || response.url().includes("/api/ai-marketing")) &&
        [404, 500].includes(response.status())
      ) {
        unexpectedFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    const moreResponse = await page.goto("/more");
    expect(moreResponse?.status()).not.toBe(404);
    expect(moreResponse?.status()).toBeLessThan(500);
    await expect(page.locator('a[href="/more/ai-marketing"]')).toContainText("Preview");
    await page.locator('a[href="/more/ai-marketing"]').click();

    await expect(page.getByRole("heading", { name: "Consent-aware campaigns" })).toBeVisible();
    await expect(page.getByText("Segment overview")).toBeVisible();
    await expect(page.getByText("AI provider configured: gpt-5-mini")).toBeVisible();
    await expect(page.getByText("Outbound AI Marketing sending is disabled for this Preview release.").first()).toBeVisible();
    await expect(page.getByText("No AI Marketing campaigns have been created.")).toBeVisible();

    await page.getByLabel("Start date").fill("2026-07-01");
    await page.getByLabel("End date").fill("2026-08-01");
    await expect.poll(() => state.lastSegmentRange).toEqual({ start: "2026-07-01", end: "2026-08-01" });

    await page.getByRole("button", { name: "Create campaign" }).click();
    await expect.poll(() => state.created).toBe(true);
    await expect(page.getByRole("heading", { name: "Weekend customer reactivation" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ada.*consented.*eligible/ })).toBeVisible();
    await expect(page.getByText(/unknown.*excluded/)).toBeVisible();

    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect.poll(() => state.draftGenerated).toBe(true);
    await expect(page.getByRole("heading", { name: /AI-generated draft.*review before approval/ })).toBeVisible();
    await expect(page.getByRole("textbox").last()).toHaveValue(/Fresh stock is available/);

    await page.getByRole("textbox").last().fill("Owner edited: fresh stock is available this weekend. Reply if you would like details.");
    await page.getByRole("button", { name: "Approve campaign" }).click();
    await expect.poll(() => state.approved).toBe(true);

    await page.getByRole("button", { name: "Attempt send" }).click();
    await expect.poll(() => state.sendAttempted).toBe(true);
    await expect(page.getByText("Outbound AI Marketing sending is disabled for this Preview release.").first()).toBeVisible();

    await page.getByRole("link", { name: "Export" }).click();
    await expect.poll(() => state.exportRequested).toBe(true);

    await page.getByRole("button", { name: "Record opt-out" }).click();
    await expect.poll(() => state.optOutRecorded).toBe(true);
    await expect(page.getByText(/opted_out.*excluded/)).toBeVisible();

    const checks = await page.evaluate(async () => {
      const isolation = await fetch("/api/ai-marketing/segments?businessId=other_biz");
      const statuses = await Promise.all([
        fetch("/api/ai-marketing/segments?businessId=biz_1", { method: "POST" }),
        fetch("/api/ai-marketing/campaigns/campaign_1?businessId=biz_1", { method: "PATCH" }),
        fetch("/api/ai-marketing/campaigns/campaign_1/draft?businessId=biz_1", { method: "DELETE" }),
        fetch("/api/ai-marketing/campaigns/campaign_1/send?businessId=biz_1", { method: "PUT" }),
        fetch("/api/ai-marketing/customers/customer_1/consent?businessId=biz_1", { method: "DELETE" }),
      ]);

      return {
        isolationStatus: isolation.status,
        isolationBody: await isolation.text(),
        methodStatuses: statuses.map((response) => response.status),
      };
    });

    expect(checks.isolationStatus).toBe(403);
    expect(checks.isolationBody).toContain("You do not have access to this business.");
    expect(checks.methodStatuses).toEqual([405, 405, 405, 405, 405]);
    expect(unexpectedFailures).toEqual([]);
  });

  test("handles empty and unauthorized states", async ({ page }) => {
    const state = createAiMarketingRouteState();
    state.campaigns = [];
    await installAiMarketingRoutes(page, state);

    await page.goto("/more/ai-marketing");
    await expect(page.getByText("No AI Marketing campaigns have been created.")).toBeVisible();
    await expect(page.getByText("Empty state: create a campaign to preview eligible and excluded recipients.")).toBeVisible();

    state.forceUnauthorized = true;
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText("You do not have permission to view AI Marketing.")).toBeVisible();
  });
});

async function mockDashboard(page: Page) {
  await page.route("**/api/dashboard/summary**", async (route) => {
    await json(route, 200, {
      state: {
        businessId: "biz_1",
        businessName: "Preview Shop",
        currency: "NGN",
        businessRole: "owner",
        onboardingCompleted: true,
        businesses: [{ id: "biz_1", name: "Preview Shop", role: "owner" }],
        locations: [{ id: "loc_main", name: "Main shop", type: "main_shop", isDefault: true }],
        selectedLocationId: "loc_main",
        selectedLocationName: "Main shop",
        permissions: {
          canManageStaff: true,
          canManageAccounts: true,
          canSaveReports: true,
          canExportBackup: true,
          canViewLocations: true,
          canManageLocations: true,
          canViewTransfers: true,
          canManageTransfers: true,
          canApproveTransfers: true,
          canReceiveTransfers: true,
          canManageTax: true,
          canViewAiMarketing: true,
          canCreateAiMarketingCampaigns: true,
          canApproveAiMarketingCampaigns: true,
          canSendAiMarketingCampaigns: true,
          canExportAiMarketing: true,
          canManageAiMarketingConsent: true,
        },
        billing: {
          planId: "pro",
          planName: "Pro",
          features: ["ai_marketing", "advanced_reports", "granular_permissions", "audit_tools"],
        },
        accounts: [],
        transactions: [],
        debts: [],
        items: [],
        auditLogs: [],
      },
    });
  });
}

type AiMarketingRouteState = {
  campaigns: CampaignPayload[];
  created: boolean;
  draftGenerated: boolean;
  approved: boolean;
  sendAttempted: boolean;
  exportRequested: boolean;
  optOutRecorded: boolean;
  forceUnauthorized: boolean;
  lastSegmentRange: { start: string; end: string } | null;
};

function createAiMarketingRouteState(): AiMarketingRouteState {
  return {
    campaigns: [],
    created: false,
    draftGenerated: false,
    approved: false,
    sendAttempted: false,
    exportRequested: false,
    optOutRecorded: false,
    forceUnauthorized: false,
    lastSegmentRange: null,
  };
}

async function installAiMarketingRoutes(page: Page, state: AiMarketingRouteState) {
  await page.route("**/api/ai-marketing**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const bodyBusinessId = readBodyBusinessId(request.postData());
    const businessId = url.searchParams.get("businessId") ?? bodyBusinessId;

    if (isUnsupportedMethod(url.pathname, method)) {
      await methodNotAllowed(route, allowForPath(url.pathname));
      return;
    }

    if (state.forceUnauthorized) {
      await json(route, 403, { error: "You do not have permission to view AI Marketing." });
      return;
    }

    if (businessId && businessId !== "biz_1") {
      await json(route, 403, { error: "You do not have access to this business." });
      return;
    }

    if (url.pathname === "/api/ai-marketing/segments") {
      state.lastSegmentRange = {
        start: url.searchParams.get("start") ?? "",
        end: url.searchParams.get("end") ?? "",
      };
      await json(route, 200, { segments: segments(url), setup, capabilities });
      return;
    }

    if (url.pathname === "/api/ai-marketing/campaigns") {
      if (method === "GET") {
        await json(route, 200, { campaigns: state.campaigns.map(summarizeCampaign), setup, capabilities });
        return;
      }

      state.created = true;
      state.campaigns = [campaignPayload()];
      await json(route, 201, { campaign: state.campaigns[0], setup, capabilities });
      return;
    }

    const detailMatch = url.pathname.match(/^\/api\/ai-marketing\/campaigns\/([^/]+)$/);
    if (detailMatch) {
      await json(route, 200, { campaign: state.campaigns[0] ?? campaignPayload(), setup, capabilities });
      return;
    }

    const recipientsMatch = url.pathname.match(/^\/api\/ai-marketing\/campaigns\/([^/]+)\/recipients$/);
    if (recipientsMatch) {
      const campaign = state.campaigns[0] ?? campaignPayload();
      await json(route, 200, { campaignId: campaign.id, summary: campaign.recipientSummary, recipients: campaign.recipients, capabilities });
      return;
    }

    const draftMatch = url.pathname.match(/^\/api\/ai-marketing\/campaigns\/([^/]+)\/draft$/);
    if (draftMatch) {
      state.draftGenerated = true;
      const campaign = ensureCampaign(state);
      campaign.drafts = [draftPayload()];
      campaign.latestDraft = campaign.drafts[0];
      await json(route, 201, { draft: campaign.drafts[0], setup, capabilities });
      return;
    }

    const approvalMatch = url.pathname.match(/^\/api\/ai-marketing\/campaigns\/([^/]+)\/approve$/);
    if (approvalMatch) {
      state.approved = true;
      const campaign = ensureCampaign(state);
      const body = readJson(request.postData());
      campaign.status = "approved";
      campaign.approvedAt = "2026-07-30T08:10:00.000Z";
      campaign.drafts = [{ ...draftPayload(), content: String(body.content ?? draftPayload().content) }];
      campaign.latestDraft = campaign.drafts[0];
      await json(route, 200, { campaign, setup, capabilities });
      return;
    }

    const sendMatch = url.pathname.match(/^\/api\/ai-marketing\/campaigns\/([^/]+)\/send$/);
    if (sendMatch) {
      state.sendAttempted = true;
      const campaign = ensureCampaign(state);
      campaign.status = "send_disabled";
      campaign.recipientSummary.disabled = 1;
      campaign.recipients = campaign.recipients.map((recipient) => (
        recipient.eligibilityStatus === "eligible"
          ? { ...recipient, deliveryStatus: "disabled" }
          : recipient
      ));
      await json(route, 200, {
        delivery: {
          enabled: false,
          status: "disabled",
          provider: null,
          message: setup.delivery.message,
          campaignId: campaign.id,
          eligibleRecipientCount: 1,
          sentCount: 0,
        },
        setup,
        capabilities,
      });
      return;
    }

    if (url.pathname === "/api/ai-marketing/export") {
      state.exportRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "Content-Disposition": 'attachment; filename="ai-marketing.csv"' },
        body: "section,field,value\ncampaign,name,Weekend customer reactivation\n",
      });
      return;
    }

    const consentMatch = url.pathname.match(/^\/api\/ai-marketing\/customers\/([^/]+)\/consent$/);
    if (consentMatch) {
      state.optOutRecorded = true;
      const campaign = ensureCampaign(state);
      campaign.recipients = campaign.recipients.map((recipient) => (
        recipient.customerId === "customer_1"
          ? {
              ...recipient,
              consentStatus: "opted_out",
              eligibilityStatus: "excluded",
              exclusionReason: "do_not_contact",
              doNotContact: true,
              deliveryStatus: "disabled",
            }
          : recipient
      ));
      campaign.recipientSummary = { total: 3, eligible: 0, excluded: 3, disabled: 1 };
      await json(route, 200, {
        customer: {
          id: "customer_1",
          name: "Ada",
          marketingConsentStatus: "opted_out",
          preferredChannel: "whatsapp",
          doNotContact: true,
        },
        capabilities,
      });
      return;
    }

    await json(route, 404, { error: "Not found." });
  });
}

const setup = {
  provider: { configured: true, provider: "openai", model: "gpt-5-mini", requiresPhase3Ai: true },
  delivery: {
    enabled: false,
    status: "disabled",
    provider: null,
    message: "Outbound AI Marketing sending is disabled for this Preview release.",
  },
};

const capabilities = {
  canRead: true,
  canCreate: true,
  canApprove: true,
  canSend: true,
  canExport: true,
  canManageConsent: true,
};

type CampaignPayload = ReturnType<typeof campaignPayload>;

function campaignPayload() {
  return {
    id: "campaign_1",
    name: "Weekend customer reactivation",
    objective: "Invite consented customers to review new stock this weekend.",
    channel: "whatsapp",
    status: "draft",
    recipientSummary: { total: 3, eligible: 1, excluded: 2, disabled: 0 },
    segmentDefinition: {
      label: "Verified marketing consent",
      definition: "Customers with explicit marketing consent and a usable preferred contact channel.",
      dataLimitations: ["Existing customers default to unknown consent."],
    },
    latestDraft: null as null | ReturnType<typeof draftPayload>,
    drafts: [] as ReturnType<typeof draftPayload>[],
    recipients: [
      {
        id: "recipient_1",
        customerId: "customer_1",
        customerName: "Ada",
        maskedContact: "...5000",
        consentStatus: "consented",
        eligibilityStatus: "eligible",
        deliveryStatus: "not_sent",
        preferredChannel: "whatsapp",
        doNotContact: false,
      },
      {
        id: "recipient_2",
        customerId: "customer_2",
        customerName: "Bala",
        maskedContact: "...5001",
        consentStatus: "unknown",
        eligibilityStatus: "excluded",
        exclusionReason: "consent_unknown",
        deliveryStatus: "not_sent",
        preferredChannel: "whatsapp",
        doNotContact: false,
      },
      {
        id: "recipient_3",
        customerId: "customer_3",
        customerName: "Chi",
        maskedContact: "...5002",
        consentStatus: "opted_out",
        eligibilityStatus: "excluded",
        exclusionReason: "opted_out",
        deliveryStatus: "not_sent",
        preferredChannel: "whatsapp",
        doNotContact: false,
      },
    ],
    deliverySummary: { notSent: 3, disabled: 0, sent: 0, delivered: 0, failed: 0 },
    createdAt: "2026-07-30T08:00:00.000Z",
    approvedAt: undefined as string | undefined,
  };
}

function draftPayload() {
  return {
    id: "draft_1",
    campaignId: "campaign_1",
    channel: "whatsapp",
    content: "Fresh stock is available this weekend. Reply if you would like details.",
    promptVersion: "phase3h-ai-marketing-draft-v1",
    model: "gpt-5-mini",
    reviewLabel: "AI-generated draft - review before approval.",
    createdAt: "2026-07-30T08:05:00.000Z",
  };
}

function summarizeCampaign(campaign: CampaignPayload) {
  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    channel: campaign.channel,
    status: campaign.status,
    recipientSummary: campaign.recipientSummary,
    segmentDefinition: campaign.segmentDefinition,
    latestDraft: campaign.latestDraft,
    createdAt: campaign.createdAt,
    approvedAt: campaign.approvedAt,
  };
}

function ensureCampaign(state: AiMarketingRouteState) {
  if (!state.campaigns.length) {
    state.campaigns = [campaignPayload()];
  }

  return state.campaigns[0];
}

function segments(url: URL) {
  const start = url.searchParams.get("start") || "2026-07-01";
  const end = url.searchParams.get("end") || "2026-08-01";

  return [
    {
      key: "verified_marketing_consent",
      label: "Verified marketing consent",
      definition: "Customers with explicit marketing consent and a usable preferred contact channel.",
      period: { start, end, label: `${start} to ${end}` },
      customerCount: 3,
      consentEligibleCount: 1,
      excludedCount: 2,
      dataLimitations: ["Existing customers default to unknown consent."],
    },
    {
      key: "active_in_range",
      label: "Active in selected range",
      definition: "Customers with at least one recorded sale during the selected date range.",
      period: { start, end, label: `${start} to ${end}` },
      customerCount: start === "2026-07-01" ? 2 : 1,
      consentEligibleCount: 1,
      excludedCount: start === "2026-07-01" ? 1 : 0,
      dataLimitations: ["Activity excludes unattributed cash sales."],
    },
  ];
}

function isUnsupportedMethod(pathname: string, method: string) {
  if (pathname === "/api/ai-marketing/segments") {
    return method !== "GET";
  }

  if (pathname === "/api/ai-marketing/campaigns") {
    return !["GET", "POST"].includes(method);
  }

  if (pathname === "/api/ai-marketing/export") {
    return method !== "GET";
  }

  if (/^\/api\/ai-marketing\/customers\/[^/]+\/consent$/.test(pathname)) {
    return method !== "PUT";
  }

  if (/^\/api\/ai-marketing\/campaigns\/[^/]+\/(draft|approve|send)$/.test(pathname)) {
    return method !== "POST";
  }

  if (/^\/api\/ai-marketing\/campaigns\/[^/]+(\/recipients)?$/.test(pathname)) {
    return method !== "GET";
  }

  return false;
}

function allowForPath(pathname: string) {
  if (pathname === "/api/ai-marketing/campaigns") {
    return "GET, POST";
  }

  if (/\/consent$/.test(pathname)) {
    return "PUT";
  }

  if (/\/(draft|approve|send)$/.test(pathname)) {
    return "POST";
  }

  return "GET";
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function methodNotAllowed(route: Route, allow: string) {
  await route.fulfill({
    status: 405,
    contentType: "application/json",
    headers: { Allow: allow },
    body: JSON.stringify({ error: "Method not allowed." }),
  });
}

function readBodyBusinessId(data: string | null) {
  const body = readJson(data);

  return typeof body.businessId === "string" ? body.businessId : null;
}

function readJson(data: string | null) {
  if (!data) {
    return {} as Record<string, unknown>;
  }

  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}
