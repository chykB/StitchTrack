// Automated checks only: no assessment screenshots, recordings or transcripts.
// AUTH_TEST_CDP_URL=http://127.0.0.1:9224 AUTH_TEST_BASE_URL=http://127.0.0.1:3104 node --test this-file
import test from "node:test";
import assert from "node:assert/strict";
const debuggerURL = process.env.AUTH_TEST_CDP_URL;
const base = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3104";
function loopback(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.ok(!url.username && !url.password && url.pathname === "/" && !url.search && !url.hash);
  return url.origin;
}
test("Stage B verification: string editing, keyboard, history, layout and submission safety", { skip: !debuggerURL }, async t => {
  const debug = loopback(debuggerURL), origin = loopback(base);
  const target = await fetch(debug + "/json/new?about:blank", { method: "PUT" }).then(r => r.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let sequence = 0;
  const pending = new Map(), requests = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      if (item) { pending.delete(message.id); clearTimeout(item.timer);
        message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
    } else if (message.method === "Network.requestWillBeSent" && message.params.request.url.startsWith(origin + "/")) {
      requests.push({ type: message.params.type, method: message.params.request.method, url: message.params.request.url });
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + " timed out")); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error("Browser expression failed: " + result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    const deadline = Date.now() + 15000;
    while (!(await evaluate("Boolean(" + expression + ")"))) {
      if (Date.now() > deadline) throw new Error("Browser state did not settle: " + expression);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  };
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, modifiers,
      ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers });
  };
  const type = async (selector, value) => {
    await evaluate("document.querySelector(" + JSON.stringify(selector) + ").focus()");
    await key("a", "KeyA", 65, 2);
    await send("Input.insertText", { text: value });
  };
  const click = async expression => {
    await evaluate(expression + ".scrollIntoView({block:'center'})");
    const point = await evaluate("(()=>{const r=" + expression + ".getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  };

  const ready = () => wait("document.querySelector('#verification-code') && !document.querySelector('fieldset').disabled");
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Accessibility.enable");
    await send("Page.navigate", { url: origin + "/auth?verify" }); await ready();
    const initialCookies = JSON.stringify((await send("Network.getCookies", { urls: [origin] })).cookies);
    const initialStorage = await evaluate("JSON.stringify({...localStorage,...sessionStorage})");
    await t.test("direct navigation uses a text code field; Arrow Up and Down preserve leading zeros", async () => {
      await wait("document.activeElement.id==='auth-title'");
      assert.equal(await evaluate("document.title"), "Verify your email | StitchTrack");
      assert.equal(await evaluate("document.querySelector('#verification-code').type"), "text");
      assert.equal(await evaluate("document.querySelector('#verification-code').inputMode"), "numeric");
      assert.equal(await evaluate("document.querySelector('#verification-code').pattern"), "[0-9]{6}");
      assert.equal(await evaluate("document.querySelector('#verification-code-hint').textContent"), "Enter the code for your email.");
      assert.equal(await evaluate("/six-digit|six digits|6 digits/i.test(document.querySelector('main').innerText)"), false);
      assert.equal(await evaluate("document.querySelector('#verification-code').getAttribute('step')"), null);
      assert.equal(await evaluate("document.querySelector('#verification-code').getAttribute('autocomplete')"), "one-time-code");
      const ax = await send("Accessibility.getFullAXTree");
      assert.ok(ax.nodes.some(n => !n.ignored && n.role?.value === "textbox" && n.name?.value === "Email verification code"));
      assert.equal(ax.nodes.some(n => !n.ignored && n.role?.value === "spinbutton"), false);
      await type("#verification-code", "004281");
      assert.equal(await evaluate("document.querySelector('#verification-code').value"), "004281");
      for (const [name, code] of [["ArrowUp", 38], ["ArrowDown", 40]]) {
        await key(name, name, code);
        assert.equal(await evaluate("document.querySelector('#verification-code').value"), "004281");
      }
    });
    await t.test("required blur and invalid submit expose associated errors; correction clears and valid attempt is unavailable", async () => {
      await type("#verification-code", "");
      await key("Tab", "Tab", 9);
      await wait("document.querySelector('#verification-code-error')");
      assert.equal(await evaluate("document.querySelector('#verification-code-error span').textContent"), "Enter your email verification code.");
      for (const value of ["12345", "1234567", "00 281", "1e0005", "123.45", "\uff11\uff12\uff13\uff14\uff15\uff16", "\u0661\u0662\u0663\u0664\u0665\u0666"]) {
        await type("#verification-code", value);
        await key("Enter", "Enter", 13);
        await wait("document.activeElement.id==='verification-code' && document.querySelector('#verification-code-error span')?.textContent==='Use exactly six digits from 0 to 9.'");
        assert.equal(await evaluate("document.querySelector('#verification-code').value"), value);
      }
      assert.equal(await evaluate("document.querySelector('#verification-code').getAttribute('aria-invalid')"), "true");
      assert.equal(await evaluate("document.querySelector('#verification-code').getAttribute('aria-describedby')"), "verification-code-hint verification-code-error");
      assert.equal(await evaluate("!!document.querySelector('#verification-code-error svg[aria-hidden=true]')"), true);
      const errorTree = await send("Accessibility.getFullAXTree");
      const codeNode = errorTree.nodes.find(n => !n.ignored && n.role?.value === "textbox" && n.name?.value === "Email verification code");
      assert.ok(codeNode?.description?.value.includes("Use exactly six digits from 0 to 9."));
      await type("#verification-code", "004281");
      await wait("!document.querySelector('#verification-code-error')");
      assert.equal(await evaluate("document.querySelector('#verification-code').getAttribute('aria-invalid')"), null);
      assert.equal(await evaluate("document.querySelector('#verification-code').getAttribute('aria-describedby')"), "verification-code-hint");
      await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.textContent"), "Verify email");
      assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "solid");
      await key(" ", "Space", 32);
      await wait("document.querySelector('#verification-feedback').textContent==='Email verification is not available yet.'");
      assert.equal(await evaluate("document.querySelector('#verification-code').value"), "004281");
      assert.equal(await evaluate("document.querySelector('#verification-feedback').getAttribute('aria-live')"), "polite");
    });
    await t.test("refresh keeps URL-selected view but clears transient code and feedback", async () => {
      await send("Page.reload"); await ready();
      await wait("document.activeElement.id==='auth-title'");
      assert.equal(await evaluate("location.pathname+location.search"), "/auth?verify");
      assert.equal(await evaluate("document.querySelector('#verification-code').value"), "");
      assert.equal(await evaluate("document.querySelector('#verification-feedback').textContent"), "");
    });
    await t.test("Back to login uses client navigation and browser Back/Forward selects the correct screen", async () => {
      await evaluate("window.__verificationDocument = true");
      const documentCount = requests.filter(r => r.type === "Document").length;
      await evaluate("document.querySelector('nav a').focus()");
      await key("Enter", "Enter", 13);
      await wait("document.querySelector('#login-email') && !document.querySelector('fieldset').disabled");
      assert.equal(await evaluate("location.pathname+location.search"), "/auth?login");
      await evaluate("history.back()");
      await ready();
      assert.equal(await evaluate("location.pathname+location.search"), "/auth?verify");
      assert.equal(await evaluate("document.querySelector('#verification-code').value"), "");
      await evaluate("history.forward()");
      await wait("document.querySelector('#login-email') && !document.querySelector('fieldset').disabled");
      assert.equal(await evaluate("location.pathname+location.search"), "/auth?login");
      await evaluate("history.back()"); await ready();
      assert.equal(await evaluate("window.__verificationDocument"), true);
      assert.equal(requests.filter(r => r.type === "Document").length, documentCount);
    });
    await t.test("375px, 768px and 1440px error layouts fit; no writes, session or code persistence", async () => {
      await type("#verification-code", "12345"); await key("Enter", "Enter", 13);
      await wait("document.querySelector('#verification-code-error')");
      for (const width of [375, 768, 1440]) {
        await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
        assert.equal(await evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), true, String(width));
      }
      assert.equal(requests.some(r => !["GET", "HEAD"].includes(r.method)), false);
      assert.equal(requests.some(r => /004281|12345/.test(r.url)), false);
      assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage})"), initialStorage);
      assert.equal(JSON.stringify((await send("Network.getCookies", { urls: [origin] })).cookies), initialCookies);
    });
    await t.test("Login and Reset give identical honest feedback for different synthetic addresses without lookups", async () => {
      for (const mode of ["login", "reset"]) {
        await send("Page.navigate", { url: origin + "/auth?" + mode });
        await wait("document.querySelector('#" + mode + "-email') && !document.querySelector('fieldset').disabled");
        const messages = [];
        for (const email of ["tailor-a@example.com", "tailor-b@example.net"]) {
          await type("#" + mode + "-email", email);
          if (mode === "login") await type("#login-password", "x");
          await key("Enter", "Enter", 13);
          const expected = mode === "login" ? "Login is not available yet." : "Password reset is not available yet.";
          await wait("document.querySelector('#auth-feedback').textContent===" + JSON.stringify(expected));
          messages.push(await evaluate("document.querySelector('#auth-feedback').textContent"));
        }
        assert.equal(messages[0], messages[1]);
      }
      assert.equal(requests.some(r => !["GET", "HEAD"].includes(r.method)), false);
      assert.equal(requests.some(r => /tailor-a|tailor-b/.test(r.url)), false);
      assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage})"), initialStorage);
      assert.equal(JSON.stringify((await send("Network.getCookies", { urls: [origin] })).cookies), initialCookies);
      await send("Page.navigate", { url: origin + "/auth?verify" }); await ready();
    });
    await t.test("JavaScript-disabled reload keeps all verification controls inert", async () => {
      await send("Emulation.setScriptExecutionDisabled", { value: true });
      await send("Page.navigate", { url: origin + "/auth?verify" });
      await wait("document.querySelector('#verification-code') && document.querySelector('fieldset').disabled");
      assert.equal(await evaluate("[...document.querySelectorAll('form input,form button')].every(el=>el.matches(':disabled'))"), true);
      await send("Emulation.setScriptExecutionDisabled", { value: false });
    });
  } finally {
    await send("Emulation.setScriptExecutionDisabled", { value: false }).catch(() => {});
    socket.close();
    await fetch(debug + "/json/close/" + target.id).catch(() => {});
  }
});
