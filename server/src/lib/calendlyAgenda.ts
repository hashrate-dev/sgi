const CALENDLY_API = "https://api.calendly.com";
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000;

type CalendlyPaged<T> = {
  collection: T[];
  pagination?: { next_page?: string | null; count?: number };
};

type CalendlyUserMe = {
  resource: {
    uri: string;
    current_organization: string;
    name: string;
    timezone: string;
  };
};

type CalendlyScheduledEvent = {
  uri: string;
  name: string;
  status: string;
  start_time: string;
  end_time: string;
  timezone?: string;
  event_type?: string;
  location?: {
    type?: string;
    join_url?: string | null;
    location?: string | null;
  };
  cancel_url?: string | null;
  reschedule_url?: string | null;
};

type CalendlyInvitee = {
  name: string;
  email: string;
  status: string;
  timezone?: string;
};

export type ReunionAgendaItem = {
  id: string;
  name: string;
  status: string;
  startTime: string;
  endTime: string;
  timezone: string | null;
  locationType: string;
  locationLabel: string | null;
  joinUrl: string | null;
  cancelUrl: string | null;
  rescheduleUrl: string | null;
  invitees: Array<{ name: string; email: string; status: string }>;
};

export type ReunionAgendaResult = {
  range: "upcoming" | "past";
  ownerName: string | null;
  ownerTimezone: string | null;
  events: ReunionAgendaItem[];
  fetchedAt: string;
};

type CacheEntry = { ts: number; data: ReunionAgendaResult };

const cache = new Map<string, CacheEntry>();

async function calendlyFetch<T>(token: string, pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${CALENDLY_API}${pathOrUrl}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Calendly HTTP ${res.status}: ${body.slice(0, 240)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function eventIdFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? uri;
}

function locationLabel(loc: CalendlyScheduledEvent["location"]): string | null {
  if (!loc) return null;
  if (loc.join_url) return loc.join_url;
  if (loc.location?.trim()) return loc.location.trim();
  const t = String(loc.type ?? "").trim();
  if (!t) return null;
  const labels: Record<string, string> = {
    zoom: "Zoom",
    google_conference: "Google Meet",
    microsoft_teams: "Microsoft Teams",
    outbound_call: "Llamada saliente",
    inbound_call: "Llamada entrante",
    physical: "Presencial",
    custom: "Ubicación personalizada",
    ask_invitee: "A confirmar con invitado",
  };
  return labels[t] ?? t;
}

async function fetchAllScheduledEvents(
  token: string,
  organizationUri: string,
  params: Record<string, string>
): Promise<CalendlyScheduledEvent[]> {
  const out: CalendlyScheduledEvent[] = [];
  let nextUrl: string | null = null;
  let first = true;

  while (first || nextUrl) {
    first = false;
    const data: CalendlyPaged<CalendlyScheduledEvent> = nextUrl
      ? await calendlyFetch<CalendlyPaged<CalendlyScheduledEvent>>(token, nextUrl)
      : await calendlyFetch<CalendlyPaged<CalendlyScheduledEvent>>(
          token,
          `/scheduled_events?${new URLSearchParams({ organization: organizationUri, ...params }).toString()}`
        );
    out.push(...(data.collection ?? []));
    nextUrl = data.pagination?.next_page ?? null;
    if (out.length >= 200) break;
  }

  return out;
}

async function fetchInvitees(token: string, eventUri: string): Promise<CalendlyInvitee[]> {
  try {
    const data = await calendlyFetch<CalendlyPaged<CalendlyInvitee>>(
      token,
      `/scheduled_events/${encodeURIComponent(eventIdFromUri(eventUri))}/invitees?count=20`
    );
    return data.collection ?? [];
  } catch {
    return [];
  }
}

function rangeDates(range: "upcoming" | "past"): { min?: string; max?: string } {
  const now = new Date();
  if (range === "upcoming") {
    const max = new Date(now);
    max.setDate(max.getDate() + 120);
    return { min: now.toISOString(), max: max.toISOString() };
  }
  const min = new Date(now);
  min.setDate(min.getDate() - 90);
  return { min: min.toISOString(), max: now.toISOString() };
}

export async function fetchCalendlyAgenda(
  token: string,
  range: "upcoming" | "past"
): Promise<ReunionAgendaResult> {
  const cacheKey = `${range}:${token.slice(-8)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const me = await calendlyFetch<CalendlyUserMe>(token, "/users/me");
  const orgUri = me.resource.current_organization;
  const { min, max } = rangeDates(range);

  const params: Record<string, string> = {
    status: "active",
    sort: range === "upcoming" ? "start_time:asc" : "start_time:desc",
    count: "100",
  };
  if (min) params.min_start_time = min;
  if (max) params.max_start_time = max;

  const rawEvents = await fetchAllScheduledEvents(token, orgUri, params);

  const events: ReunionAgendaItem[] = [];
  for (let i = 0; i < rawEvents.length; i += 5) {
    const chunk = rawEvents.slice(i, i + 5);
    const inviteeLists = await Promise.all(chunk.map((ev) => fetchInvitees(token, ev.uri)));
    chunk.forEach((ev, idx) => {
      const invitees = (inviteeLists[idx] ?? []).map((inv) => ({
        name: String(inv.name ?? "").trim(),
        email: String(inv.email ?? "").trim(),
        status: String(inv.status ?? "").trim(),
      }));
      events.push({
        id: eventIdFromUri(ev.uri),
        name: String(ev.name ?? "Reunión").trim(),
        status: String(ev.status ?? "").trim(),
        startTime: ev.start_time,
        endTime: ev.end_time,
        timezone: ev.timezone ?? me.resource.timezone ?? null,
        locationType: String(ev.location?.type ?? "").trim(),
        locationLabel: locationLabel(ev.location),
        joinUrl: ev.location?.join_url ?? null,
        cancelUrl: ev.cancel_url ?? null,
        rescheduleUrl: ev.reschedule_url ?? null,
        invitees,
      });
    });
  }

  const result: ReunionAgendaResult = {
    range,
    ownerName: me.resource.name ?? null,
    ownerTimezone: me.resource.timezone ?? null,
    events,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}
