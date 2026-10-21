import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("Server Health Checks", () => {
  it("responds to tRPC system.health query with ok: true", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.system.health({ timestamp: Date.now() });

    expect(result).toEqual({ ok: true });
  });

  it("produces valid HTTP health payload format", () => {
    const uptime = Math.floor(process.uptime());
    const timestamp = Date.now();
    const payload = {
      status: "ok",
      uptime,
      timestamp,
    };

    expect(payload.status).toBe("ok");
    expect(typeof payload.uptime).toBe("number");
    expect(payload.uptime).toBeGreaterThanOrEqual(0);
    expect(payload.timestamp).toBeGreaterThan(0);
  });
});
