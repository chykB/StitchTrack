// Optional real-browser checks. Start a separate loopback Chrome debugger; no packages are needed.
// AUTH_TEST_CDP_URL=http://127.0.0.1:9223 AUTH_TEST_BASE_URL=http://127.0.0.1:3000 node --test this-file
import test from "node:test";
import assert from "node:assert/strict";

const debuggerURL = process.env.AUTH_TEST_CDP_URL;
const base = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000";
function loopback(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.ok(!url.username && !url.password && url.pathname === "/" && !url.search && !url.hash);
  return url.origin;
}

test("conditional Signup documents: real browser state, focus, semantics and safety", { skip: !debuggerURL }, async t => {
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
  const action = text => "[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.textContent===" + JSON.stringify(text) + ")";
  const state = () => evaluate("(()=>{const e=document.querySelector('#signup-email'),p=document.querySelector('#signup-password'),c=document.querySelector('[name=draftAcknowledgement]');return {email:e.value,password:p.value,checked:c.checked,type:p.type,errors:[...document.querySelectorAll('[id$=\"-error\"]')].map(n=>[n.id,n.textContent]),invalid:[e,p,c].map(n=>[n.getAttribute('aria-invalid'),n.getAttribute('aria-describedby')]),disabled:document.querySelector('[type=submit]').getAttribute('aria-disabled')}})()");
  const load = async path => {
    await send("Page.navigate", { url: origin + path });
    await wait("document.querySelector('form fieldset') && !document.querySelector('form fieldset').disabled");
  };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Accessibility.enable");
    await load("/auth?signup");
    await wait("document.querySelector('[name=draftAcknowledgement]')");
    await t.test("Terms and Privacy controls are independent from the native checkbox", async () => {
      assert.equal(await evaluate("document.querySelectorAll('label button,label a,details,pre').length"), 0);
      await evaluate("document.querySelector('[name=draftAcknowledgement]').focus()");
      await key(" ", "Space", 32);
      await wait("document.querySelector('[name=draftAcknowledgement]').checked");
      await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.textContent"), "Terms");
    });
    await t.test("keyboard opening/back restores values, validation, checkbox, visibility and original focus without reload", async () => {
      await type("#signup-email", "wrong");
      await type("#signup-password", "short");
      await click("document.querySelector('[aria-label=\"Show password\"]')");
      await evaluate(action("Terms") + ".focus()");
      await wait("document.querySelector('#signup-email').getAttribute('aria-invalid')==='true'");
      const before = await state(), documents = requests.filter(r => r.type === "Document").length;
      await evaluate("window.__documentViewCheck = true");
      await key("Enter", "Enter", 13);
      await wait("document.activeElement?.matches('article h1')");
      assert.equal(await evaluate("location.href"), origin + "/auth?signup");
      assert.equal(await evaluate("!!document.querySelector('form')?.closest('[hidden]')"), true);
      assert.equal(await evaluate("document.querySelectorAll('#auth-title').length"), 1);
      const ax = await send("Accessibility.getFullAXTree");
      assert.equal(ax.nodes.some(n => !n.ignored && n.role?.value === "textbox" && n.name?.value === "Email address"), false);
      assert.ok(ax.nodes.some(n => !n.ignored && n.role?.value === "heading"));
      assert.equal(await evaluate("document.querySelectorAll('article a[href^=\"https:\"]').length > 0"), true);
      assert.equal(ax.nodes.filter(n => !n.ignored && n.role?.value === "heading" && n.properties?.some(p => p.name === "level" && p.value?.value === 1)).length, 1);
      await evaluate(action("privacy draft") + ".focus()");
      await key("Enter", "Enter", 13);
      await wait("document.activeElement?.matches(\'article h1\') && document.activeElement.textContent.includes(\'Privacy Policy\')");
      await key("Tab", "Tab", 9, 8);
      assert.equal(await evaluate("document.activeElement.textContent"), "Back to Signup");
      await key(" ", "Space", 32);
      await wait("!document.querySelector('article')");
      assert.equal(await evaluate("document.activeElement.textContent"), "Terms");
      assert.ok(JSON.stringify(await state()) === JSON.stringify(before), "Form state must be restored exactly");
      assert.equal(await evaluate("window.__documentViewCheck"), true);
      assert.equal(requests.filter(r => r.type === "Document").length, documents);
    });
    await t.test("mouse Privacy view has semantic tables and returns focus without changing acknowledgement", async () => {
      await click("document.querySelector('[name=draftAcknowledgement]')");
      await evaluate(action("Privacy Policy") + ".focus()");
      const before = await state(), documents = requests.filter(r => r.type === "Document").length;
      assert.equal(before.checked, false);
      await click(action("Privacy Policy"));
      await wait("document.activeElement?.matches('article h1')");
      assert.equal(await evaluate("document.querySelectorAll('article table').length"), 2);
      assert.equal(await evaluate("document.querySelectorAll('article th[scope=col]').length > 0"), true);
      assert.equal(await evaluate("location.href"), origin + "/auth?signup");
      await click(action("Back to Signup"));
      await wait("!document.querySelector('article')");
      assert.equal(await evaluate("document.activeElement.textContent"), "Privacy Policy");
      assert.ok(JSON.stringify(await state()) === JSON.stringify(before), "Privacy review must preserve form state");
      assert.equal(requests.filter(r => r.type === "Document").length, documents);
    });
    await t.test("375px, 768px and 1440px views fit; document scroll remains local and normal", async () => {
      for (const width of [375, 768, 1440]) {
        await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await evaluate(action("Privacy Policy") + ".focus()");
        await key("Enter", "Enter", 13);
        await wait("document.activeElement?.matches('article h1')");
        assert.equal(await evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), true, width + " document overflow");
        assert.equal(await evaluate("document.documentElement.scrollHeight>innerHeight"), true);
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.tableScroll')||document.querySelector('[role=region]')).overflowX"), "auto");
        await click(action("Back to Signup"));
        await wait("!document.querySelector('article')");
        assert.equal(await evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), true, width + " form overflow");
      }
    });
    await t.test("guarded Signup remains UI-only; Login and Reset retain their behaviour", async () => {
      await type("#signup-email", "test+synthetic@example.com");
      await type("#signup-password", "synthetic passphrase");
      await evaluate("document.querySelector('[name=draftAcknowledgement]').focus()");
      await key(" ", "Space", 32);
      await wait("document.querySelector('[type=submit]').getAttribute('aria-disabled')==='false'");
      await click("document.querySelector('[type=submit]')");
      await wait("document.querySelector('#auth-feedback').textContent==='Account creation is not available yet.'");
      assert.equal(await evaluate("JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic passphrase')"), false);
      await load("/auth?login");
      assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Terms')"), false);
      await type("#login-email", "test@example.com"); await type("#login-password", "x");
      await key("Enter", "Enter", 13);
      await wait("document.querySelector('#auth-feedback').textContent==='Login is not available yet.'");
      await load("/auth?reset"); await type("#reset-email", "wrong");
      await key("Enter", "Enter", 13);
      await wait("document.activeElement.id==='reset-email'&&document.querySelector('#reset-email-error')");
      assert.equal(requests.some(r => !["GET", "HEAD"].includes(r.method)), false);
      assert.equal(requests.some(r => /test%2Bsynthetic|synthetic%20passphrase|test%40example/.test(r.url)), false);
    });
    await t.test("JavaScript-disabled reload keeps credentials and document controls inert", async () => {
      await send("Emulation.setScriptExecutionDisabled", { value: true });
      await send("Page.navigate", { url: origin + "/auth?signup" });
      await wait("document.querySelector('form fieldset')?.disabled");
      assert.equal(await evaluate("[...document.querySelectorAll('form input,form button')].every(el=>el.matches(':disabled'))"), true);
      await send("Emulation.setScriptExecutionDisabled", { value: false });
    });
  } finally {
    await send("Emulation.setScriptExecutionDisabled", { value: false }).catch(() => {});
    socket.close();
    await fetch(debug + "/json/close/" + target.id).catch(() => {});
  }
});
