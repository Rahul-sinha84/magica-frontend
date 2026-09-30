import { afterEach, beforeEach, vi } from "vitest";

// jsdom has no layout, so the virtualized list would see a 0px window and draw nothing. This gives every
// element a size (an 800px window, rows of 80px) for the tests that need rows on screen.
export function stubLayout({ height = 800, width = 900 } = {}) {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(height);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(width);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
    });
  });
  afterEach(() => vi.restoreAllMocks());
}
