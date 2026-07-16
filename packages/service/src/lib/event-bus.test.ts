import type { ServerEvent } from "@repo/shared";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./event-bus";

function mkEvent(
  target: string,
  type: "rate_limit.updated" | "job.stats.updated" = "rate_limit.updated",
): ServerEvent {
  return { type, target };
}

describe("EventBus", () => {
  it("delivers an event to a subscriber whose target matches exactly", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe({ targets: ["sse:admin:u1:t1"], onEvent: fn });
    bus.publish(mkEvent("sse:admin:u1:t1"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not deliver when targets differ in any concrete segment", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe({ targets: ["sse:admin:u1:t1"], onEvent: fn });
    bus.publish(mkEvent("sse:admin:u1:t2"));
    bus.publish(mkEvent("sse:organization:u1:t1"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("does not deliver when the segment depth differs", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe({ targets: ["sse:admin"], onEvent: fn });
    bus.publish(mkEvent("sse:admin:u1:t1"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("wildcards on the published target fan out to concrete subscribers", () => {
    const bus = new EventBus();
    const admin = vi.fn();
    const org = vi.fn();
    bus.subscribe({ targets: ["sse:admin:u1:t1"], onEvent: admin });
    bus.subscribe({ targets: ["sse:organization:u1:t1"], onEvent: org });

    // all admin connections
    bus.publish(mkEvent("sse:admin:*:*"));
    expect(admin).toHaveBeenCalledTimes(1);
    expect(org).not.toHaveBeenCalled();

    // every connection, every app
    bus.publish(mkEvent("sse:*:*:*"));
    expect(admin).toHaveBeenCalledTimes(2);
    expect(org).toHaveBeenCalledTimes(1);
  });

  it("wildcards on the subscriber target match concrete events", () => {
    const bus = new EventBus();
    const anyAdminTab = vi.fn();
    bus.subscribe({ targets: ["sse:admin:u1:*"], onEvent: anyAdminTab });
    bus.publish(mkEvent("sse:admin:u1:t1"));
    bus.publish(mkEvent("sse:admin:u1:t2"));
    bus.publish(mkEvent("sse:admin:u2:t1"));
    expect(anyAdminTab).toHaveBeenCalledTimes(2);
  });

  it("a subscriber with multiple targets receives an event matching any of them", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe({
      targets: ["sse:admin:u1:t1", "sse:organization:u1:t1"],
      onEvent: fn,
    });
    bus.publish(mkEvent("sse:organization:*:*"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops further delivery", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const unsubscribe = bus.subscribe({
      targets: ["sse:admin:u1:t1"],
      onEvent: fn,
    });
    unsubscribe();
    bus.publish(mkEvent("sse:admin:u1:t1"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("publish with no matching subscribers is a no-op", () => {
    const bus = new EventBus();
    expect(() => bus.publish(mkEvent("sse:admin:u1:t1"))).not.toThrow();
  });

  it("close tears down subscribers whose target matches and invokes onClose", () => {
    const bus = new EventBus();
    const onClose = vi.fn();
    const onEvent = vi.fn();
    bus.subscribe({ targets: ["sse:admin:u1:t1"], onEvent, onClose });

    bus.close("sse:admin:u1:t1");

    expect(onClose).toHaveBeenCalledTimes(1);
    // no longer routed after being closed
    bus.publish(mkEvent("sse:admin:u1:t1"));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("close matches by wildcard so it reaches the right subscribers only", () => {
    const bus = new EventBus();
    const keep = vi.fn();
    const kill = vi.fn();
    bus.subscribe({
      targets: ["sse:admin:u1:t1"],
      onEvent: keep,
      onClose: keep,
    });
    bus.subscribe({
      targets: ["sse:organization:u1:t1"],
      onEvent: vi.fn(),
      onClose: kill,
    });

    bus.close("sse:organization:u1:t1");

    expect(kill).toHaveBeenCalledTimes(1);
    expect(keep).not.toHaveBeenCalled();
    expect(bus.getStats().subscribers).toBe(1);
  });

  it("getStats counts current subscribers", () => {
    const bus = new EventBus();
    bus.subscribe({ targets: ["sse:admin:u1:t1"], onEvent: vi.fn() });
    bus.subscribe({ targets: ["sse:admin:u1:t2"], onEvent: vi.fn() });
    expect(bus.getStats().subscribers).toBe(2);
  });
});
