import fs from "fs";
import path from "path";

import { Icon, type IconName } from "@/components/Icon";

// Parse Icon.tsx straight from disk so the test reflects the *source of truth*,
// not a hand-maintained copy that could drift. The whole point is to catch a
// duplicated union member or `case` label sneaking back in (e.g. two `copy`s).
const source = fs.readFileSync(path.join(__dirname, "..", "Icon.tsx"), "utf8");

/** Names listed in the `export type IconName = 'a' | 'b' | ...;` union. */
function unionNames(): string[] {
  const block = source.match(/export type IconName\s*=([\s\S]*?);/);
  if (!block) throw new Error("Could not locate the IconName union in Icon.tsx");
  return [...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
}

/** Names handled by a `case '...':` arm in the switch. */
function caseNames(): string[] {
  return [...source.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]);
}

describe("Icon source integrity", () => {
  it("has no duplicate names in the IconName union", () => {
    const names = unionNames();
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("has no duplicate case labels in the switch", () => {
    const cases = caseNames();
    const dupes = cases.filter((n, i) => cases.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("keeps the union and the switch in exact one-to-one sync", () => {
    expect(new Set(caseNames())).toEqual(new Set(unionNames()));
  });
});

describe("Icon rendering", () => {
  it("returns a non-null element for every name in the union (no missing case)", () => {
    for (const name of unionNames()) {
      // Icon is hookless, so calling it directly returns the element (or null)
      // its switch produced — exactly what we want to smoke-test.
      expect(Icon({ name: name as IconName })).not.toBeNull();
    }
  });

  it("returns null for an unknown name (the default branch is reachable)", () => {
    expect(Icon({ name: "not-a-real-icon" as IconName })).toBeNull();
  });
});
