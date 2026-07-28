const baseInput = process.argv[2] || process.env.BASE_URL;

if (!baseInput) {
  console.error("Usage: npm run smoke:production -- https://your-deployment.example");
  process.exitCode = 1;
} else {
  const baseUrl = new URL(baseInput);
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("The deployment URL must use HTTP or HTTPS.");
  }

  const checks = [
    {
      label: "SPA route",
      path: "/odzywianie",
      init: {},
      expectedStatus: 200,
      expectedType: "text/html",
    },
    {
      label: "Open Food Facts proxy",
      path: "/api/openfoodfacts/search?q=apple&page_size=1",
      init: {},
      expectedStatus: 200,
      expectedType: "application/json",
    },
    {
      label: "Proxy query validation",
      path: "/api/openfoodfacts/search?q=a",
      init: {},
      expectedStatus: 400,
      expectedType: "application/json",
    },
    {
      label: "Proxy method validation",
      path: "/api/openfoodfacts/search?q=apple",
      init: { method: "POST" },
      expectedStatus: 405,
      expectedType: "application/json",
    },
  ];

  let failed = false;
  for (const check of checks) {
    const target = new URL(check.path, baseUrl);
    try {
      const response = await fetch(target, {
        ...check.init,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const passed = response.status === check.expectedStatus
        && contentType.includes(check.expectedType);
      console.log(
        `${passed ? "PASS" : "FAIL"} ${check.label}: ${response.status} ${contentType || "(no content type)"}`,
      );
      if (!passed) failed = true;
    } catch (error) {
      failed = true;
      console.error(
        `FAIL ${check.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failed) process.exitCode = 1;
}
