import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  FORMS_EVENTS,
  emitFormsEvent,
  offFormsEvent,
  onFormsEvent,
  resetFormsEventSubscribers,
} from "@/lib/common/events";

describe("emitFormsEvent", () => {
  beforeEach(() => {
    // The emitter creates `window.dataLayer` when absent; start every test from that state, and
    // from a subscriber-free registry.
    delete (window as { dataLayer?: unknown }).dataLayer;
    resetFormsEventSubscribers();
  });

  test("every event name carries the forms_ namespace — the string GTM triggers and on() match", () => {
    for (const name of Object.values(FORMS_EVENTS)) {
      expect(name).toMatch(/^forms_/);
    }
  });

  test("creates window.dataLayer when absent and pushes the nested envelope", () => {
    expect(window.dataLayer).toBeUndefined();

    emitFormsEvent(FORMS_EVENTS.responseSubmitted, {
      surveyId: "survey_1",
      responseId: "response_1",
      finished: true,
    });

    // Nested under `forms`, never spread flat: GTM merges pushes, so a flat `finished` or
    // `action` would collide with the host's own dataLayer keys. And the FULL key set every time,
    // nulls included: GTM merges recursively, so an omitted key would leave a previous event's
    // value readable under this event's trigger.
    expect(window.dataLayer).toEqual([
      {
        event: "forms_response_submitted",
        forms: {
          workspaceId: null,
          action: null,
          surveyId: "survey_1",
          responseId: "response_1",
          finished: true,
        },
      },
    ]);
  });

  test("appends to a pre-existing dataLayer, never replaces it — the host's queued events survive", () => {
    const hostEntry = { event: "host_event", cart: "abc" };
    window.dataLayer = [hostEntry];

    emitFormsEvent(FORMS_EVENTS.actionTracked, { action: "clicked_demo" });

    expect(window.dataLayer[0]).toBe(hostEntry);
    expect(window.dataLayer).toHaveLength(2);
    expect(window.dataLayer[1]).toEqual({
      event: "forms_action_tracked",
      forms: {
        workspaceId: null,
        surveyId: null,
        responseId: null,
        finished: null,
        action: "clicked_demo",
      },
    });
  });

  test("a payload key present with value undefined falls back to the null sentinel, not undefined", () => {
    // `responseId` is typed optional by the widened callbacks, so an emit can carry it as an
    // explicit undefined. If that survived the merge it would replace the null sentinel — and GTM's
    // recursive merge would keep an EARLIER event's responseId readable under this event's trigger.
    emitFormsEvent(FORMS_EVENTS.responseSubmitted, {
      surveyId: "survey_1",
      responseId: undefined,
      finished: true,
    });

    expect(window.dataLayer?.[0]).toEqual({
      event: "forms_response_submitted",
      forms: {
        workspaceId: null,
        action: null,
        surveyId: "survey_1",
        responseId: null,
        finished: true,
      },
    });
  });

  test("a non-array dataLayer (a host shim) is replaced instead of throwing on .push", () => {
    (window as { dataLayer?: unknown }).dataLayer = {};

    expect(() => {
      emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_1" });
    }).not.toThrow();

    expect(Array.isArray(window.dataLayer)).toBe(true);
    expect(window.dataLayer).toHaveLength(1);
  });

  test("a throwing dataLayer.push (GTM replaces it with host-owned code) never escapes, and subscribers still fire", () => {
    const poisoned: Record<string, unknown>[] = [];
    poisoned.push = () => {
      throw new Error("host push exploded");
    };
    window.dataLayer = poisoned;

    const handler = vi.fn();
    onFormsEvent(FORMS_EVENTS.surveyShown, handler);

    expect(() => {
      emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_1" });
    }).not.toThrow();

    // The subscription surface still fired: the two are isolated separately.
    expect(handler).toHaveBeenCalledWith({ surveyId: "survey_1" });
  });
});

describe("on() / off() subscriptions", () => {
  beforeEach(() => {
    delete (window as { dataLayer?: unknown }).dataLayer;
    resetFormsEventSubscribers();
    vi.restoreAllMocks();
  });

  test("notifies every handler of the emitted event with its payload, and no other event's handlers", () => {
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();

    onFormsEvent(FORMS_EVENTS.surveyShown, first);
    onFormsEvent(FORMS_EVENTS.surveyShown, second);
    onFormsEvent(FORMS_EVENTS.surveyClosed, other);

    emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_1" });

    expect(first).toHaveBeenCalledWith({ surveyId: "survey_1" });
    expect(second).toHaveBeenCalledWith({ surveyId: "survey_1" });
    expect(other).not.toHaveBeenCalled();
  });

  test("registering the same handler twice notifies it once", () => {
    const handler = vi.fn();

    onFormsEvent(FORMS_EVENTS.responseSubmitted, handler);
    onFormsEvent(FORMS_EVENTS.responseSubmitted, handler);

    emitFormsEvent(FORMS_EVENTS.responseSubmitted, { surveyId: "survey_1", finished: false });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("the function returned by on() removes the subscription; off() removes only the handler it names", () => {
    const viaReturn = vi.fn();
    const viaOff = vi.fn();
    const kept = vi.fn();

    const unsubscribe = onFormsEvent(FORMS_EVENTS.surveyShown, viaReturn);
    onFormsEvent(FORMS_EVENTS.surveyShown, viaOff);
    onFormsEvent(FORMS_EVENTS.surveyShown, kept);

    unsubscribe();
    offFormsEvent(FORMS_EVENTS.surveyShown, viaOff);
    emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_1" });

    expect(viaReturn).not.toHaveBeenCalled();
    expect(viaOff).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  test("off() on an unknown handler or event is a no-op", () => {
    const handler = vi.fn();

    expect(() => {
      offFormsEvent(FORMS_EVENTS.surveyShown, handler);
    }).not.toThrow();

    onFormsEvent(FORMS_EVENTS.surveyShown, handler);
    offFormsEvent(FORMS_EVENTS.surveyShown, vi.fn());
    emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_1" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("a handler that unsubscribes itself still receives the event it is handling", () => {
    const handler = vi.fn(() => {
      offFormsEvent(FORMS_EVENTS.surveyShown, handler);
    });

    onFormsEvent(FORMS_EVENTS.surveyShown, handler);

    expect(() => {
      emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_1" });
    }).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);

    emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_2" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("a handler that re-arms itself mid-dispatch is dispatched once, not unboundedly", () => {
    // `Set.prototype.forEach` visits entries appended during iteration, so without the snapshot in
    // notifySubscribers the re-arm lands behind the cursor and loops until the page hangs. `other`
    // is load-bearing: it keeps the Set non-empty, so off() does not drop the map entry and on()
    // re-adds into the same Set being iterated.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const other = vi.fn();
    let calls = 0;
    const handler = (): void => {
      calls += 1;
      if (calls > 2) throw new Error("re-arm re-entered the dispatch in flight");
      offFormsEvent(FORMS_EVENTS.surveyShown, handler);
      onFormsEvent(FORMS_EVENTS.surveyShown, handler);
    };

    onFormsEvent(FORMS_EVENTS.surveyShown, other);
    onFormsEvent(FORMS_EVENTS.surveyShown, handler);

    emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_1" });
    expect(calls).toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();

    // Still subscribed for the next emit — re-arming is the point.
    emitFormsEvent(FORMS_EVENTS.surveyShown, { surveyId: "survey_2" });
    expect(calls).toBe(2);
  });

  test("a throwing handler is logged and stops neither the other handlers nor the dataLayer push", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const throwing = vi.fn(() => {
      throw new Error("host blew up");
    });
    const healthy = vi.fn();

    onFormsEvent(FORMS_EVENTS.surveyClosed, throwing);
    onFormsEvent(FORMS_EVENTS.surveyClosed, healthy);

    expect(() => {
      emitFormsEvent(FORMS_EVENTS.surveyClosed, { surveyId: "survey_1" });
    }).not.toThrow();

    expect(healthy).toHaveBeenCalledTimes(1);
    expect(window.dataLayer).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  test("emitting with no subscribers still pushes to the dataLayer", () => {
    expect(() => {
      emitFormsEvent(FORMS_EVENTS.setupSuccessful, { workspaceId: "ws_1" });
    }).not.toThrow();
    expect(window.dataLayer).toHaveLength(1);
  });
});
