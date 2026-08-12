import { describe, expect, it } from "vitest";
import { APP_MODULES, findModuleForPath } from "./moduleRegistry";
import { ROUTE_LAYOUT_AUDIT, router } from "./routes";

type RouteNode = {
  path?: string;
  index?: boolean;
  children?: readonly RouteNode[];
};

function joinRoutePath(parent: string, child: string) {
  if (child === "*") return "*";
  if (child.startsWith("/")) return child;
  const joined = `${parent === "/" ? "" : parent}/${child}`;
  return joined || "/";
}

function collectLeafRoutePaths(routes: readonly RouteNode[], parent = ""):
string[] {
  return routes.flatMap((route) => {
    const path = route.path ? joinRoutePath(parent, route.path) : parent || "/";
    if (route.children?.length) return collectLeafRoutePaths(route.children, path);
    return [route.index ? parent || "/" : path];
  });
}

function concretePath(pattern: string) {
  return pattern.replace(/:[^/]+/g, "example");
}

describe("route and module ownership contract", () => {
  it("keeps the review inventory exhaustive against every router leaf", () => {
    const routerPaths = collectLeafRoutePaths(router.routes as readonly RouteNode[]).sort();
    const auditPaths = ROUTE_LAYOUT_AUDIT.map((route) => route.path).sort();

    expect(auditPaths).toEqual(routerPaths);
  });

  it("assigns every rendered route to its canonical module", () => {
    for (const route of ROUTE_LAYOUT_AUDIT) {
      if (route.component === "redirect" || route.path === "*") continue;

      expect(
        findModuleForPath(concretePath(route.path))?.id,
        `${route.path} should belong to ${route.moduleId}`,
      ).toBe(route.moduleId);
    }
  });

  it("keeps redirects outside navigation while assigning their targets", () => {
    for (const route of ROUTE_LAYOUT_AUDIT) {
      if (route.component !== "redirect") continue;

      expect(findModuleForPath(route.path)).toBeUndefined();
      const targetPath = new URL(route.redirectTo, "https://rootine.test").pathname;
      expect(findModuleForPath(targetPath)).toBeDefined();
    }
  });

  it("owns both canonical and detail travel URL families", () => {
    expect(findModuleForPath("/podroze")?.id).toBe("travel");
    expect(findModuleForPath("/podroze/trip-lisbon")?.id).toBe("travel");
    expect(findModuleForPath("/travel/overview")?.id).toBe("travel");
    expect(findModuleForPath("/travel/trip-lisbon/plan")?.id).toBe("travel");
  });

  it("keeps exactly nine unique canonical modules", () => {
    expect(APP_MODULES).toHaveLength(9);
    expect(new Set(APP_MODULES.map((module) => module.id)).size).toBe(9);
    expect(new Set(APP_MODULES.map((module) => module.to)).size).toBe(9);
  });
});
