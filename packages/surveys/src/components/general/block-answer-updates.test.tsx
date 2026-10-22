import { act, cleanup, render, screen } from "@testing-library/preact";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { afterEach, expect, test, vi } from "vitest";
import type { TResponseData } from "@forms/types/responses";
import { TSurveyElementTypeEnum } from "@forms/types/surveys/constants";
import { BlockConditional } from "./block-conditional";

const callbacks = vi.hoisted(() => ({
  upload: undefined as ((data: TResponseData) => void) | undefined,
  booking: undefined as ((data: TResponseData) => void) | undefined,
}));
vi.mock("@/components/general/element-conditional", () => ({
  ElementConditional: ({
    element,
    value,
    onChange,
  }: {
    element: { id: string };
    value: unknown;
    onChange: (data: TResponseData) => void;
  }) => {
    if (element.id === "file" && !callbacks.upload) callbacks.upload = onChange;
    if (element.id === "booking") callbacks.booking = onChange;
    return <output data-testid={element.id}>{JSON.stringify(value)}</output>;
  },
}));
vi.mock("@/components/wrappers/scrollable-container", () => ({
  ScrollableContainer: ({ children }: { children: ComponentChildren }) => <>{children}</>,
}));
vi.mock("@/components/buttons/submit-button", () => ({ SubmitButton: () => null }));
vi.mock("@/components/buttons/back-button", () => ({ BackButton: () => null }));
afterEach(() => {
  cleanup();
  callbacks.upload = undefined;
  callbacks.booking = undefined;
});

test("a delayed file result preserves a booking answer entered while the file was uploading", () => {
  function Questions() {
    const [value, setValue] = useState<TResponseData>({ booking: "" });
    return (
      <BlockConditional
        block={
          {
            id: "block",
            elements: [
              {
                id: "file",
                type: TSurveyElementTypeEnum.FileUpload,
                required: false,
                headline: { default: "File" },
              },
              {
                id: "booking",
                type: TSurveyElementTypeEnum.BookingPage,
                required: false,
                headline: { default: "Booking" },
              },
            ],
            logic: [],
          } as never
        }
        value={value}
        onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        onFileUpload={vi.fn()}
        surveyId="survey"
        languageCode="default"
        ttc={{}}
        setTtc={vi.fn()}
        isFirstBlock
        isLastBlock
        isBackButtonHidden
        autoFocusEnabled={false}
        shouldFocusOnMount={false}
        isAutoProgressingEnabled={false}
        fullSizeCards={false}
        surveyLanguages={[]}
      />
    );
  }
  render(<Questions />);
  act(() => callbacks.booking?.({ booking: "booked" }));
  expect(screen.getByTestId("booking").textContent).toBe('"booked"');
  act(() => callbacks.upload?.({ file: ["/uploads/test.txt"] }));
  expect(screen.getByTestId("booking").textContent).toBe('"booked"');
  expect(screen.getByTestId("file").textContent).toContain("/uploads/test.txt");
});
