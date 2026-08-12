export function createGhlClient({ apiKey, locationId, baseUrl = 'https://services.leadconnectorhq.com', fetchImpl = fetch }) {
  return {
    async upsertContact({ email, full_name, phone }) {
      const res = await fetchImpl(`${baseUrl}/contacts/upsert`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify({ locationId, email, name: full_name ?? undefined, phone: phone ?? undefined }),
      });
      if (!res.ok) throw new Error(`GHL upsert failed: ${res.status}`);
      const data = await res.json();
      return data.contact?.id ?? data.id;
    },
  };
}
