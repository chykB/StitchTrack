// Real browser observations, not screenshots or screen-reader simulation.
import test from "node:test";
import assert from "node:assert/strict";
import { attackCases } from "./cases.mjs";
const debuggerURL = process.env.AUTH_TEST_CDP_URL;
const base = process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3104";
function loopback(value) {
  const url = new URL(value); assert.equal(url.protocol, "http:");
  assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));
  assert.ok(!url.username&&!url.password&&url.pathname==="/"&&!url.search&&!url.hash);
  return url.origin;
}
test("Step 8: synthetic adversarial inputs in the actual authentication forms", {skip:!debuggerURL}, async t => {
  const debug=loopback(debuggerURL),origin=loopback(base);
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


  const chosen = [
    "signup-bypass-baseline", "signup-email-edge-spaces", "signup-email-short-shaped",
    "signup-password-eleven", "signup-password-twelve", "signup-password-twelve-spaces",
    "signup-password-leading-space", "signup-password-trailing-space", "signup-password-129",
    "signup-password-4096", "signup-password-tab", "signup-password-newline", "signup-unchecked-draft",
    "login-password-single", "login-password-space", "login-email-a-at-b", "login-email-edge-spaces",
    "reset-email-a-at-b", "reset-email-plus", "reset-email-edge-spaces",
    "verify-six", "verify-native-loss", "verify-leading-space", "verify-fullwidth", "verify-newline", "verify-seven",
  ].map(id => {
    const item = attackCases.find(item => item.id === id);
    assert.ok(item, id); return item;
  });
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    for (const item of chosen) {
      await t.test(item.id + ": real form submission", async () => {
        await evaluate("window.__attackPreviousDocument = true");
        await send("Page.navigate", { url: origin + "/auth?" + item.mode });
        const selector = item.mode === "verify" ? "#verification-code" : "#" + item.mode + "-email";
        await wait("!window.__attackPreviousDocument && document.querySelector(" + JSON.stringify(selector) + ") && !document.querySelector('fieldset').disabled");
        if (item.mode === "verify") await type("#verification-code", item.code);
        else {
          await type("#" + item.mode + "-email", item.values.email);
          if (item.mode !== "reset") await type("#" + item.mode + "-password", item.values.password);
          if (item.mode === "signup") {
            assert.equal(await evaluate("!!document.querySelector('[name=draftAcknowledgement]')"), true);
            if (item.draftAcknowledged) await click("document.querySelector('[name=draftAcknowledgement]')");
          }
        }
        await click("document.querySelector('button[type=submit]')");
        await wait("document.querySelectorAll('[id$=\"-error\"]').length>0 || [...document.querySelectorAll('[role=status]')].some(el=>el.textContent.includes('not available yet.'))");
        const state = await evaluate("(()=>{const field=document.querySelector('#verification-code'),email=document.querySelector('[name=email]'),password=document.querySelector('[name=password]');return {email:email?.value,password:password?.value,code:field?.value,errors:[...document.querySelectorAll('[id$=\"-error\"]')].map(el=>({id:el.id,text:el.textContent.trim()})),feedback:[...document.querySelectorAll('[role=status]')].map(el=>el.textContent.trim()).join(''),acknowledged:document.querySelector('[name=draftAcknowledgement]')?.checked}})()");
        const preserved = item.mode === "verify" ? state.code === item.code :
          state.email === item.values.email && (item.mode === "reset" || state.password === item.values.password);
        const blocked = state.errors.length > 0;
        const result = {
          id: item.id, mode: item.mode, input: item.label,
          outcome: blocked ? "BLOCKED" : "FORMAT_ONLY_VALID_ACTION_UNAVAILABLE",
          errors: state.errors, feedback: state.feedback,
          requestedInputPreservedByBrowser: preserved,
          domEmailLength: state.email?.length ?? null,
          domPasswordCodePoints: state.password === undefined ? null : Array.from(state.password).length,
          domCodeLength: state.code?.length ?? null,
          draftAcknowledged: state.acknowledged ?? null,
        };
        console.log("BROWSER_ATTACK_RESULT " + JSON.stringify(result));
        if (preserved) assert.equal(blocked, item.blocked, item.id);
        if (!blocked) assert.ok(state.feedback.endsWith("not available yet."));
        assert.equal(requests.some(r => !["GET", "HEAD"].includes(r.method)), false);
      });
    }
    console.log("BROWSER_ATTACK_NETWORK " + JSON.stringify({
      documentRequests: requests.filter(r=>r.type==="Document").length,
      localWrites: requests.filter(r=>!["GET","HEAD"].includes(r.method)).length,
      note: "Direct loads were intentional; no authentication POST occurred."
    }));
  } finally {
    socket.close();
    await fetch(debug + "/json/close/" + target.id).catch(() => {});
  }
});
