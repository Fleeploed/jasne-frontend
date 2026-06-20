import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestRendererJSON } from "react-test-renderer";

import { HelpContentRenderer } from "@/features/help/components";
import type { Section } from "@/features/help/types";

// @testing-library/react-native@14 targets React 19's createRoot test API,
// but this project is on React 18.3 — so we render with react-test-renderer
// directly and walk the tree ourselves.

// Isolate the renderer from native-only deps pulled in via ProBlurSection.
// BlurView is a decorative overlay with no text children, so a null stub is
// enough for asserting against rendered text.
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/PaywallSheet", () => ({ PaywallSheet: () => null }));
jest.mock("@/lib/purchases", () => ({ getProPackages: async () => null }));
// logger pulls in @sentry/react-native (untransformed ESM) — stub it out.
jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// For free users the backend sends the full pro_only content flagged locked.
// The client renders it (blurred behind the gate) for free users and crisp for
// pro users.
const PRO_TEXT = "PRO_TEXT_BODY";
const PRO_STEP = "PRO_STEP_BODY";
const PRO_CHECK = "PRO_CHECK_BODY";
const PUBLIC_TEXT = "PUBLIC_VISIBLE_TEXT";
const WARNING_TEXT = "WARNING_ALWAYS_VISIBLE";

const sections: Section[] = [
  { type: "text", title: "Intro", body: PUBLIC_TEXT },
  { type: "text", title: "Pro text", body: PRO_TEXT, pro_only: true },
  { type: "steps", title: "Pro steps", items: [PRO_STEP], pro_only: true },
  { type: "checklist", title: "Pro checklist", items: [PRO_CHECK], pro_only: true },
  { type: "warning", title: "Important", body: WARNING_TEXT, pro_only: true },
];

type JsonNode = ReactTestRendererJSON | string;

function collectText(node: JsonNode | JsonNode[] | null): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node.props?.value === "string") return [node.props.value, ...collectText((node.children ?? null) as JsonNode[] | null)];
  return collectText((node.children ?? null) as JsonNode[] | null);
}

function renderText(plan: "free" | "pro"): string {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <HelpContentRenderer sections={sections} onAction={() => {}} plan={plan} />
    );
  });
  return collectText(renderer.toJSON() as JsonNode | JsonNode[] | null).join("\n");
}

describe("HelpContentRenderer Pro gating", () => {
  it("free render shows public content + the Pro content blurred behind the gate", () => {
    const text = renderText("free");

    // Public text + the always-open warning stay visible.
    expect(text).toContain(PUBLIC_TEXT);
    expect(text).toContain(WARNING_TEXT);
    // Section titles are headings — they stay visible above the blur.
    expect(text).toContain("Pro steps");

    // The full Pro content the backend sent is rendered (blurred). The blur is
    // cosmetic, not a security boundary — an accepted product tradeoff.
    expect(text).toContain(PRO_TEXT);
    expect(text).toContain(PRO_STEP);
    expect(text).toContain(PRO_CHECK);
  });

  it("pro render shows the real Pro content", () => {
    const text = renderText("pro");

    expect(text).toContain(PRO_TEXT);
    expect(text).toContain(PRO_STEP);
    expect(text).toContain(PRO_CHECK);
  });
});
