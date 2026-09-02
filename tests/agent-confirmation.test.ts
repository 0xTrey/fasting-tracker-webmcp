import { describe, expect, it, vi } from "vitest";
import { createAgentConfirmationController } from "@/lib/agent-confirmation";

describe("agent confirmation boundary", () => {
  it("keeps a mutation pending until the user explicitly approves it", async () => {
    const controller = createAgentConfirmationController();
    const listener = vi.fn();
    controller.subscribe(listener);

    const result = controller.request("Start an 18-hour fast?", "Start fast");
    const pending = controller.getSnapshot();

    expect(pending).toMatchObject({ message: "Start an 18-hour fast?", approveLabel: "Start fast" });
    expect(listener).toHaveBeenCalledOnce();
    controller.approve(pending!.id);
    await expect(result).resolves.toBe(true);
    expect(controller.getSnapshot()).toBeNull();
  });

  it("returns a cancellation without approving the change", async () => {
    const controller = createAgentConfirmationController();
    const result = controller.request("Complete the active fast?", "Complete fast");
    const pending = controller.getSnapshot();

    controller.cancel(pending!.id);
    await expect(result).resolves.toBe(false);
    expect(controller.getSnapshot()).toBeNull();
  });

  it("fails closed for overlapping or aborted agent requests", async () => {
    const controller = createAgentConfirmationController();
    const abortController = new AbortController();
    const first = controller.request("Start a fast?", "Start fast", abortController.signal);

    await expect(controller.request("Start another fast?", "Start fast")).rejects.toThrow(
      "Another agent action is already waiting for approval.",
    );
    abortController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(controller.getSnapshot()).toBeNull();
  });
});
