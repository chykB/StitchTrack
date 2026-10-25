import test from "node:test";
import assert from "node:assert/strict";

const base = new URL(process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000");
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
  throw new Error("Use an explicit loopback HTTP origin for the running UI tests.");
}

const pages = [
  { path: "/signup", title: "Create your tailor account | StitchTrack",
    heading: "Create your tailor account", prefix: "signup", password: "new-password",
    links: ["/login"] },
  { path: "/login", title: "Tailor login | StitchTrack",
    heading: "Log in to StitchTrack", prefix: "login", password: "current-password",
    links: ["/forgot-password", "/signup"] },
  { path: "/forgot-password", title: "Reset your password | StitchTrack",
    heading: "Reset your password", prefix: "reset",
    links: ["/login", "/signup"] },
];
const tags = (html, tag) => [...html.matchAll(new RegExp("<" + tag + "\\b[^>]*>", "gi"))].map(m => m[0]);
const attr = (tag, name) => new RegExp("\\b" + name + '="([^"]*)"', "i").exec(tag)?.[1];
const has = (tag, name) => new RegExp("\\s" + name + "(?:=|\\s|>)", "i").test(tag);

for (const page of pages) {
  test("GET " + page.path + " exposes a separate, inert-before-hydration form", async () => {
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
    const legend = /<legend\b[^>]*>([\s\S]*?)<\/legend>/i.exec(fieldset)?.[1];
    assert.ok(legend);
    assert.doesNotMatch(legend, /<(input|button|select|textarea)\b/i);
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
