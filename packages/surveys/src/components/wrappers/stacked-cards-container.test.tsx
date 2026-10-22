import { cleanup, render, waitFor } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import type { TJsWorkspaceStateSurvey } from "@forms/types/js";
import type { TWorkspaceStyling } from "@forms/types/workspace";
import { StackedCardsContainer } from "./stacked-cards-container";

afterEach(cleanup);

test.each([false, true])("handles an empty survey when its welcome card is %s", async (enabled) => {
  const setBlockId = vi.fn();
  const survey = {
    blocks: [],
    endings: [],
    type: "link",
    welcomeCard: { enabled },
  } as unknown as TJsWorkspaceStateSurvey;
  render(
    <StackedCardsContainer
      cardArrangement="simple"
      currentBlockId=""
      survey={survey}
      getCardContent={() => undefined}
      styling={{} as TWorkspaceStyling}
      setBlockId={setBlockId}
      fullSizeCards={false}
    />
  );
  if (enabled) await waitFor(() => expect(setBlockId).toHaveBeenCalledWith("start"));
  else {
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(setBlockId).not.toHaveBeenCalled();
  }
});

test("resets a populated survey to its first block", async () => {
  const setBlockId = vi.fn();
  const survey = {
    blocks: [{ id: "first", elements: [] }],
    endings: [],
    type: "link",
    welcomeCard: { enabled: false },
  } as unknown as TJsWorkspaceStateSurvey;
  render(
    <StackedCardsContainer
      cardArrangement="simple"
      currentBlockId=""
      survey={survey}
      getCardContent={() => undefined}
      styling={{} as TWorkspaceStyling}
      setBlockId={setBlockId}
      fullSizeCards={false}
    />
  );
  await waitFor(() => expect(setBlockId).toHaveBeenCalledWith("first"));
});
