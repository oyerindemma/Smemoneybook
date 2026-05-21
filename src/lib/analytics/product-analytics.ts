"use client";

import posthog from "posthog-js";

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

let initialized = false;
let sessionStartedAt = 0;

export function initProductAnalytics() {
  if (initialized || typeof window === "undefined") {
    return;
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return;
  }

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    capture_pageview: true,
    autocapture: false,
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function trackProductEvent(name: string, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined") {
    return;
  }

  initProductAnalytics();
  if (!initialized) {
    return;
  }

  posthog.capture(name, properties);
}

export function startProductAnalyticsSession() {
  if (typeof window === "undefined" || sessionStartedAt > 0) {
    return;
  }

  sessionStartedAt = Date.now();
  trackProductEvent("session_started", {
    referrer: document.referrer || "direct",
    path: window.location.pathname,
  });

  const trackSessionEnd = () => {
    if (sessionStartedAt === 0) {
      return;
    }

    trackProductEvent("session_ended", {
      duration_seconds: Math.round((Date.now() - sessionStartedAt) / 1000),
      path: window.location.pathname,
    });
    sessionStartedAt = 0;
  };

  window.addEventListener("pagehide", trackSessionEnd, { once: true });
}
