export class ShillOpsSdk {
  constructor(private readonly baseUrl: string) {}

  async ingestSignal(payload: Record<string, unknown>) {
    const res = await fetch(`${this.baseUrl}/signals/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return res.json();
  }
}
