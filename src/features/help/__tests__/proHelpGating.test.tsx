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

const PRO_BODY = "SECRET_PRO_BODY";
const LOCKED_BODY = "SECRET_LOCKED_BODY";
const OPEN_ITEM = "PUBLIC_CHECKLIST_ITEM";
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

  it("gates a section the backend marked locked, even without the pro_only flag", () => {
    // Contract hardening: `locked` is the backend's authoritative gating signal.
    // Even if a body slips through, the client must withhold it and show the gate.
    const sections: Section[] = [{ type: "text", title: "Pro details", body: LOCKED_BODY, locked: true }];
    const rendered = renderText(sections, "free");
    expect(rendered).not.toContain(LOCKED_BODY); // body withheld
    expect(rendered).toContain(t("help.pro.gateTitle")); // Pro gate rendered (ProBlurSection)
  });

  it("withholds a locked checklist's items for free but shows them for a pro user", () => {
    const free: Section[] = [{ type: "checklist", title: "Steps", items: [OPEN_ITEM], pro_only: true, locked: true }];
    expect(renderText(free, "free")).not.toContain(OPEN_ITEM);

    // For a pro user the backend sends locked:false with the real items.
    const pro: Section[] = [{ type: "checklist", title: "Steps", items: [OPEN_ITEM], pro_only: true, locked: false }];
    expect(renderText(pro, "pro")).toContain(OPEN_ITEM);
  });

  it("blurs a pro_only text body for free but reveals it for pro, within one mixed payload", () => {
    const sections: Section[] = [
      { type: "checklist", title: "Open list", items: [OPEN_ITEM] },
      { type: "text", title: "Pro details", body: PRO_BODY, pro_only: true },
    ];

    const free = renderText(sections, "free");
    expect(free).toContain(OPEN_ITEM); // public content untouched
    expect(free).not.toContain(PRO_BODY); // gated content withheld

    const pro = renderText(sections, "pro");
    expect(pro).toContain(PRO_BODY);
  });
});
