function tagSegment(value, fallback) {
  const normalized = String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

export function createGhlClient({ apiKey, locationId, baseUrl = 'https://services.leadconnectorhq.com', fetchImpl = fetch }) {
  return {
    async upsertContact({ email, full_name, phone, tier, source, signal }) {
      const res = await fetchImpl(`${baseUrl}/contacts/upsert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        signal,
        body: JSON.stringify({
          locationId,
          email,
          name: full_name ?? undefined,
          phone: phone ?? undefined,
          tags: [
            `pwrhaus_tier_${tagSegment(tier, 'free')}`,
            `pwrhaus_source_${tagSegment(source, 'site')}`,
          ],
        }),
      });
      if (!res.ok) throw new Error(`GHL upsert failed: ${res.status}`);
      const data = await res.json();
      return data.contact?.id ?? data.id;
    },
  };
}
