import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("API validation and health", () => {
  const app = createApp({} as never);

  it("returns health status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects invalid signal ingest payload", async () => {
    const res = await request(app).post("/signals/ingest").send({
      communityId: "demo-community",
      type: "INVALID_SIGNAL",
      severity: 20
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("rejects invalid short link payload", async () => {
    const res = await request(app).post("/links").send({
      communityId: "demo-community",
      targetUrl: "not-a-url"
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});
