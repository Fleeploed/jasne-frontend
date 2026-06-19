import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestRendererJSON } from "react-test-renderer";

import { HelpContentRenderer } from "@/features/help/components";
import type { Section } from "@/features/help/types";
import { t } from "@/lib/i18n";

// @testing-library/react-native@14 targets React 19's createRoot test API, but
// this project is on React 18.3 — so we render with react-test-renderer directly
// and walk the tree ourselves (mirrors HelpContentRenderer.test.tsx).
// BlurView is a decorative overlay with no text children, so a null stub is
// enough for asserting against rendered text.
jest.mock("expo-blur", () => ({ BlurView: () => null }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/PaywallSheet", () => ({ PaywallSheet: () => null }));
jest.mock("@/lib/purchases", () => ({ getProPackages: async () => null }));
jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// The backend sends only a short teaser for gated sections; the client renders
// whatever it receives, blurred behind the gate. So these "bodies" stand in for
// that teaser and ARE expected to render (under the BlurView).
const PRO_TEASER_BODY = "PRO_TEASER_BODY";
const LOCKED_TEASER_BODY = "LOCKED_TEASER_BODY";
const OPEN_ITEM = "PUBLIC_CHECKLIST_ITEM";
const GATED_ITEM = "GATED_TEASER_ITEM";
const CTA_TITLE = "PRO_CTA_TITLE_VISIBLE";

type JsonNode = ReactTestRendererJSON | string;

function collectText(node: JsonNode | JsonNode[] | null): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node.props?.value === "string") return [node.props.value, ...collectText((node.children ?? null) as JsonNode[] | null)];
  return collectText((node.children ?? null) as JsonNode[] | null);
}

function renderText(sections: Section[], plan: "free" | "pro"): string {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<HelpContentRenderer sections={sections} onAction={() => {}} plan={plan} />);
  });
  return collectText(renderer.toJSON() as JsonNode | JsonNode[] | null).join("\n");
}

describe("HelpContentRenderer — gating edge cases", () => {
  it("keeps a pro_only CTA fully visible for free users (the action must stay reachable)", () => {
    const sections: Section[] = [{ type: "cta", title: CTA_TITLE, actions: ["scan_document"], pro_only: true }];
    expect(renderText(sections, "free")).toContain(CTA_TITLE);
  });

  it("does not over-blur: a non-pro checklist renders its items for free users", () => {
    const sections: Section[] = [{ type: "checklist", title: "Open list", items: [OPEN_ITEM], pro_only: false }];
    expect(renderText(sections, "free")).toContain(OPEN_ITEM);
  });

  it("renders a backend-locked teaser behind the gate, even without the pro_only flag", () => {
    // Contract: `locked` is the backend's authoritative gating signal. The
    // teaser the backend chose to send is rendered (blurred) behind the gate;
    // the client trusts the backend to have sent only a teaser, not the bulk.
    const sections: Section[] = [{ type: "text", title: "Pro details", body: LOCKED_TEASER_BODY, locked: true }];
    const rendered = renderText(sections, "free");
    expect(rendered).toContain(LOCKED_TEASER_BODY); // teaser rendered under blur
    expect(rendered).toContain(t("help.pro.gateTitle")); // Pro gate rendered (ProBlurSection)
  });

  it("renders a locked checklist's teaser for free and the full list for a pro user", () => {
    const free: Section[] = [{ type: "checklist", title: "Steps", items: [GATED_ITEM], pro_only: true, locked: true }];
    const freeRendered = renderText(free, "free");
    expect(freeRendered).toContain(GATED_ITEM); // teaser rendered under blur
    expect(freeRendered).toContain(t("help.pro.gateTitle")); // still gated

    // For a pro user the backend sends locked:false with the real items.
    const pro: Section[] = [{ type: "checklist", title: "Steps", items: [GATED_ITEM], pro_only: true, locked: false }];
    expect(renderText(pro, "pro")).toContain(GATED_ITEM);
  });

  it("shows a pro_only text teaser behind the gate for free, full body for pro", () => {
    const sections: Section[] = [
      { type: "checklist", title: "Open list", items: [OPEN_ITEM] },
      { type: "text", title: "Pro details", body: PRO_TEASER_BODY, pro_only: true },
    ];

    const free = renderText(sections, "free");
    expect(free).toContain(OPEN_ITEM); // public content untouched
    expect(free).toContain(PRO_TEASER_BODY); // teaser rendered under blur
    expect(free).toContain(t("help.pro.gateTitle")); // gate present

    const pro = renderText(sections, "pro");
    expect(pro).toContain(PRO_TEASER_BODY);
  });
});
