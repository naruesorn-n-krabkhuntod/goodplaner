import { describe, expect, it } from "bun:test";
import { safeNext } from "~/lib/auth";
import { ROLE_LABEL, can, hasRole } from "~/lib/access";

describe("safeNext (open-redirect guard)", () => {
  it("keeps ordinary internal paths", () => {
    expect(safeNext("/app")).toBe("/app");
    expect(safeNext("/p/team/board")).toBe("/p/team/board");
    expect(safeNext("/app/plans?filter=mine")).toBe("/app/plans?filter=mine");
  });

  it("rejects absolute URLs", () => {
    expect(safeNext("https://evil.example/steal")).toBe("/app");
    expect(safeNext("http://evil.example")).toBe("/app");
    expect(safeNext("javascript:alert(1)")).toBe("/app");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("//evil.example/path")).toBe("/app");
  });

  it("rejects backslash tricks that some browsers normalise to slashes", () => {
    expect(safeNext("/\\evil.example")).toBe("/app");
    expect(safeNext("\\\\evil.example")).toBe("/app");
  });

  it("rejects anything that is not a string", () => {
    expect(safeNext(undefined)).toBe("/app");
    expect(safeNext(null)).toBe("/app");
    expect(safeNext(42)).toBe("/app");
    expect(safeNext(["/app"])).toBe("/app");
  });
});

describe("role ladder", () => {
  it("ranks roles from viewer up to owner", () => {
    expect(hasRole("OWNER", "ADMIN")).toBe(true);
    expect(hasRole("ADMIN", "MEMBER")).toBe(true);
    expect(hasRole("MEMBER", "VIEWER")).toBe(true);

    expect(hasRole("VIEWER", "MEMBER")).toBe(false);
    expect(hasRole("MEMBER", "ADMIN")).toBe(false);
    expect(hasRole("ADMIN", "OWNER")).toBe(false);
  });

  it("treats a role as satisfying itself", () => {
    for (const role of ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const) {
      expect(hasRole(role, role)).toBe(true);
    }
  });
});

describe("capabilities", () => {
  it("lets viewers read but change nothing", () => {
    expect(can("VIEWER", "view")).toBe(true);
    expect(can("VIEWER", "comment")).toBe(false);
    expect(can("VIEWER", "editItems")).toBe(false);
    expect(can("VIEWER", "manageMembers")).toBe(false);
  });

  it("lets members do the day-to-day work but not administer", () => {
    expect(can("MEMBER", "editItems")).toBe(true);
    expect(can("MEMBER", "comment")).toBe(true);
    expect(can("MEMBER", "manageSprints")).toBe(true);
    expect(can("MEMBER", "manageMembers")).toBe(false);
    expect(can("MEMBER", "manageBoard")).toBe(false);
  });

  it("lets admins administer but not delete the plan", () => {
    expect(can("ADMIN", "manageMembers")).toBe(true);
    expect(can("ADMIN", "manageBoard")).toBe(true);
    expect(can("ADMIN", "managePlan")).toBe(true);
    expect(can("ADMIN", "deletePlan")).toBe(false);
  });

  it("gives the owner everything", () => {
    expect(can("OWNER", "deletePlan")).toBe(true);
    expect(can("OWNER", "manageMembers")).toBe(true);
    expect(can("OWNER", "editItems")).toBe(true);
  });

  it("labels every role", () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(["ADMIN", "MEMBER", "OWNER", "VIEWER"]);
  });
});
