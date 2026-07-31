// Companies House risk signals for the payer radar.
// Requires COMPANIES_HOUSE_API_KEY (free from developer.company-information.service.gov.uk).
// Without a key the radar degrades gracefully: payers simply stay "not yet checked".

import "server-only";

export interface RiskSignals {
  level: "ok" | "watch" | "danger";
  reasons: string[];
  companyName?: string;
  status?: string;
  checkedAt: string;
}

export function hasCompaniesHouseKey(): boolean {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY);
}

export async function checkCompany(
  companyNumber: string,
): Promise<RiskSignals | null> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      },
      cache: "no-store",
    },
  );

  const checkedAt = new Date().toISOString();
  if (res.status === 404) {
    return {
      level: "danger",
      reasons: ["Company number not found at Companies House"],
      checkedAt,
    };
  }
  if (!res.ok) return null; // transient failure — keep previous signals

  const c = (await res.json()) as {
    company_name?: string;
    company_status?: string;
    has_insolvency_history?: boolean;
    accounts?: { overdue?: boolean; next_accounts?: { overdue?: boolean } };
    confirmation_statement?: { overdue?: boolean };
  };

  const reasons: string[] = [];
  const status = c.company_status ?? "unknown";

  if (["liquidation", "administration", "insolvency-proceedings", "receivership"].includes(status)) {
    reasons.push(`Company status: ${status.replace(/-/g, " ")}`);
  } else if (status === "dissolved") {
    reasons.push("Company dissolved");
  }
  if (c.has_insolvency_history) reasons.push("Has insolvency history");
  if (c.accounts?.overdue || c.accounts?.next_accounts?.overdue) {
    reasons.push("Accounts overdue");
  }
  if (c.confirmation_statement?.overdue) {
    reasons.push("Confirmation statement overdue");
  }

  const level: RiskSignals["level"] =
    reasons.some(
      (r) =>
        r.startsWith("Company status") ||
        r === "Company dissolved" ||
        r === "Has insolvency history",
    )
      ? "danger"
      : reasons.length > 0
        ? "watch"
        : "ok";

  return { level, reasons, companyName: c.company_name, status, checkedAt };
}
