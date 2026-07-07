import type { NotificationCreatedEvent, ServerEvent } from "@repo/shared";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./event-bus";

function mkEvent(
  over: Partial<NotificationCreatedEvent> = {},
): NotificationCreatedEvent {
  return {
    type: "notification.created",
    notificationId: "n1",
    userId: "u1",
    appId: "admin",
    renderedTitle: null,
    renderedBody: "hi",
    ...over,
  };
}

const jobStatsEvent: ServerEvent = {
  type: "job.stats.updated",
  appId: "admin",
};

describe("EventBus", () => {
  it("routes events only to the targeted user", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: a,
      disconnect: () => {},
    });
    bus.subscribe({
      userId: "u2",
      token: "t2",
      onEvent: b,
      disconnect: () => {},
    });
    bus.emit("u1", mkEvent());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("delivers to multiple connections of the same user", () => {
    const bus = new EventBus();
    const tab1 = vi.fn();
    const tab2 = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: tab1,
      disconnect: () => {},
    });
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: tab2,
      disconnect: () => {},
    });
    bus.emit("u1", mkEvent());
    expect(tab1).toHaveBeenCalledTimes(1);
    expect(tab2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe removes only the caller's subscription", () => {
    const bus = new EventBus();
    const tab1 = vi.fn();
    const tab2 = vi.fn();
    const unsub = bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: tab1,
      disconnect: () => {},
    });
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: tab2,
      disconnect: () => {},
    });
    unsub();
    bus.emit("u1", mkEvent());
    expect(tab1).not.toHaveBeenCalled();
    expect(tab2).toHaveBeenCalledTimes(1);
  });

  it("appFilter skips events scoped to a different app", () => {
    const bus = new EventBus();
    const admin = vi.fn();
    const org = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      appFilter: "admin",
      onEvent: admin,
      disconnect: () => {},
    });
    bus.subscribe({
      userId: "u1",
      token: "t2",
      appFilter: "organization",
      onEvent: org,
      disconnect: () => {},
    });
    bus.emit("u1", mkEvent({ appId: "admin" }));
    expect(admin).toHaveBeenCalledTimes(1);
    expect(org).not.toHaveBeenCalled();
  });

  it("appFilter passes through events with no appId", () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      appFilter: "admin",
      onEvent: fn,
      disconnect: () => {},
    });
    bus.emit("u1", mkEvent({ appId: null }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("disconnectByToken kills only that token's subscribers and removes them from routing", () => {
    const bus = new EventBus();
    const discA = vi.fn();
    const discB = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: () => {},
      disconnect: discA,
    });
    bus.subscribe({
      userId: "u2",
      token: "t2",
      onEvent: () => {},
      disconnect: discB,
    });
    bus.disconnectByToken("t1");
    expect(discA).toHaveBeenCalledTimes(1);
    expect(discB).not.toHaveBeenCalled();

    const sink = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t9",
      onEvent: sink,
      disconnect: () => {},
    });
    bus.emit("u1", mkEvent());
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("disconnectByToken kills every tab sharing a token", () => {
    const bus = new EventBus();
    const t1a = vi.fn();
    const t1b = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: () => {},
      disconnect: t1a,
    });
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: () => {},
      disconnect: t1b,
    });
    bus.disconnectByToken("t1");
    expect(t1a).toHaveBeenCalledTimes(1);
    expect(t1b).toHaveBeenCalledTimes(1);
    expect(bus.getStats().subscribers).toBe(0);
  });

  it("emit to a user with no subscribers is a no-op", () => {
    const bus = new EventBus();
    expect(() => bus.emit("nobody", mkEvent())).not.toThrow();
  });

  it("broadcast reaches subscribers across all users", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      onEvent: a,
      disconnect: () => {},
    });
    bus.subscribe({
      userId: "u2",
      token: "t2",
      onEvent: b,
      disconnect: () => {},
    });
    bus.broadcast(jobStatsEvent);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("broadcast respects appFilter", () => {
    const bus = new EventBus();
    const admin = vi.fn();
    const org = vi.fn();
    bus.subscribe({
      userId: "u1",
      token: "t1",
      appFilter: "admin",
      onEvent: admin,
      disconnect: () => {},
    });
    bus.subscribe({
      userId: "u1",
      token: "t2",
      appFilter: "organization",
      onEvent: org,
      disconnect: () => {},
    });
    bus.broadcast(jobStatsEvent);
    expect(admin).toHaveBeenCalledTimes(1);
    expect(org).not.toHaveBeenCalled();
  });

  it("broadcast with no subscribers is a no-op", () => {
    const bus = new EventBus();
    expect(() => bus.broadcast(jobStatsEvent)).not.toThrow();
  });
});
