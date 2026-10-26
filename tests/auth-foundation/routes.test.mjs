import test from "node:test";
import assert from "node:assert/strict";

const base = new URL(process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000");
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
  throw new Error("Use an explicit loopback HTTP origin for the running UI tests.");
}

const pages = [
  { path: "/auth?signup", title: "Create your tailor account | StitchTrack",
    heading: "Create your tailor account", prefix: "signup", password: "new-password",
    legend: "Account details", hiddenLegend: true,
    links: ["/auth?login"] },
  { path: "/auth?login", title: "Tailor login | StitchTrack",
    heading: "Log in to StitchTrack", prefix: "login", password: "current-password",
    legend: "Login details", hiddenLegend: false,
    links: ["/auth?reset", "/auth?signup"] },
  { path: "/auth?reset", title: "Reset your password | StitchTrack",
    heading: "Reset your password", prefix: "reset",
    legend: "Reset request", hiddenLegend: false,
    links: ["/auth?login", "/auth?signup"] },
];
const tags = (html, tag) => [...html.matchAll(new RegExp("<" + tag + "\\b[^>]*>", "gi"))].map(m => m[0]);
const attr = (tag, name) => new RegExp("\\b" + name + '="([^"]*)"', "i").exec(tag)?.[1];
const has = (tag, name) => new RegExp("\\s" + name + "(?:=|\\s|>)", "i").test(tag);

for (const page of pages) {
  test("GET " + page.path + " renders the URL-selected, inert-before-hydration form", async () => {
    const response = await fetch(new URL(page.path, base), { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    assert.ok(html.includes("<title>" + page.title + "</title>"));
    assert.equal(tags(html, "h1").length, 1);
    assert.ok(html.includes(">" + page.heading + "</h1>"));
    assert.ok(!html.includes('id="auth-availability"'));
    const feedback = /<div\b([^>]*id="auth-feedback"[^>]*)>([\s\S]*?)<\/div>/i.exec(html);
    assert.ok(feedback);
    assert.equal(feedback[2].trim(), "");
    assert.equal(attr(feedback[1], "role"), "status");
    assert.equal(attr(feedback[1], "aria-live"), "polite");
    assert.equal(attr(feedback[1], "aria-atomic"), "true");
    const forms = tags(html, "form");
    assert.equal(forms.length, 1);
    assert.equal(attr(forms[0], "method"), "post");
    assert.ok(has(forms[0], "noValidate"));
    assert.equal(attr(forms[0], "action"), undefined);
    assert.equal(attr(forms[0], "aria-describedby"), undefined);
    assert.ok(has(tags(html, "fieldset")[0], "disabled"));
    const fieldset = /<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/i.exec(html)?.[1];
    assert.ok(fieldset);
    const legend = /<legend\b([^>]*)>([\s\S]*?)<\/legend>/i.exec(fieldset);
    assert.ok(legend);
    assert.equal(legend[2], page.legend);
    assert.equal(/visuallyHidden/.test(attr(legend[1], "class") || ""), page.hiddenLegend);
    assert.equal(attr(legend[1], "aria-hidden"), undefined);
    assert.ok(!has(legend[1], "hidden"));
    assert.doesNotMatch(legend[2], /<(input|button|select|textarea)\b/i);
    assert.equal(tags(fieldset, "input").length, page.password ? 2 : 1);
    assert.equal(tags(fieldset, "button").length, 1);
    const inputs = tags(html, "input");
    assert.equal(inputs.length, page.password ? 2 : 1);
    const email = inputs.find(input => attr(input, "name") === "email");
    assert.equal(attr(email, "id"), page.prefix + "-email");
    assert.equal(attr(email, "type"), "email");
    assert.equal(attr(email, "autoComplete"), "email");
    assert.ok(html.includes('for="' + page.prefix + '-email"'));
    if (page.password) {
      const password = inputs.find(input => attr(input, "name") === "password");
      assert.equal(attr(password, "type"), "password");
      assert.equal(attr(password, "autoComplete"), page.password);
      assert.ok(html.includes('for="' + page.prefix + '-password"'));
    }
    const hrefs = tags(html, "a").map(tag => attr(tag, "href"));
    for (const href of ["/", ...page.links]) assert.ok(hrefs.includes(href));
    assert.ok(tags(html, "meta").some(tag =>
      attr(tag, "name") === "robots" && attr(tag, "content") === "noindex, nofollow"));
  });
}

test("GET /auth defaults to login", async () => {
  const response = await fetch(new URL("/auth", base), { redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.ok((await response.text()).includes('id="login-email"'));
});

const invalidPaths = [
  "/auth?mode=forgot-password", "/auth?mode=smjshdsljf", "/auth?mode=login",
  "/auth?mode=signup", "/auth?mode=reset", "/auth?unknown", "/auth?LOGIN",
  "/auth?login&login", "/auth?signup&signup", "/auth?reset&reset",
  "/auth?login&signup", "/auth?signup&reset", "/auth?login&reset",
  "/auth?login&unknown", "/auth?login=true", "/auth?signup=1", "/auth?reset=false",
  "/auth?login=", "/auth?signup=", "/auth?reset=", "/auth?login&", "/auth?&login",
  "/auth?_rsc=arbitrary", "/auth?__proto__", "/auth?constructor", "/auth?%6cogin",
];
for (const path of invalidPaths) {
  test("GET " + path + " returns an actual 404, including a browser User-Agent", async () => {
    const response = await fetch(new URL(path, base), {
      redirect: "manual", headers: { "user-agent": "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36" },
    });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(tags(await response.text(), "form").length, 0);
  });
}

test("caller-supplied auth-state headers cannot select a different form", async () => {
  const response = await fetch(new URL("/auth?signup", base), { headers: { "x-stitchtrack-auth-state": "reset" } });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes('id="signup-email"'));
});

test("RSC navigation receives the same state policy and proper invalid-state status", async () => {
  const valid = await fetch(new URL("/auth?signup=&_rsc=route-test", base), { headers: { rsc: "1" } });
  assert.equal(valid.status, 200);
  assert.match(valid.headers.get("content-type") || "", /text\/x-component/);
  assert.ok((await valid.text()).includes("Create your tailor account"));
  for (const query of ["mode=forgot-password", "unknown", "signup=&reset=", "reset=unexpected"]) {
    const invalid = await fetch(new URL("/auth?" + query + "&_rsc=route-test", base), { headers: { rsc: "1" } });
    assert.equal(invalid.status, 404);
    assert.equal(invalid.headers.get("set-cookie"), null);
  }
});

for (const path of ["/signup", "/login", "/forgot-password", "/this-page-does-not-exist"]) {
  test("GET " + path + " no longer exposes a separate auth page", async () => {
    const response = await fetch(new URL(path, base), { redirect: "manual" });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("set-cookie"), null);
  });
}


test("auth query gating does not change the marketing homepage", async () => {
  for (const path of ["/", "/?signup", "/?mode=unknown"]) {
    const response = await fetch(new URL(path, base), { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    assert.ok(html.includes("Keep tailoring orders and agreements clear"));
    assert.ok(!html.includes('id="login-email"'));
  }
});

test("production assessment page remains disabled and its GET API keeps method handling", async () => {
  for (const path of ["/assessment/enquiry", "/assessment/enquiry?login"]) {
    const response = await fetch(new URL(path, base), { redirect: "manual" });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(!(await response.text()).includes('id="login-email"'));
  }
  const response = await fetch(new URL("/api/assessment/enquiries", base), { redirect: "manual" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("set-cookie"), null);
});
