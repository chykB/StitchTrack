# Task Three: interview answers

These answers follow the owner's supplied 14 questions in their exact order. No original assessment PDF is available in the repository. Project examples reflect committed HEAD `c1e6180` and the existing evidence; planned authentication is not described as implemented. Question 10 honestly states the owner's lack of direct customer-disagreement experience and describes a hypothetical approach. Question 11 is a proposed explanation, not a claimed executive conversation.

## 1. Why is client-side validation not enough?

Client-side validation helps someone correct a mistake quickly, but I cannot trust the browser to enforce the rules. A person can disable scripts, alter the page or send HTTP requests without opening it. Anything important must therefore be checked by the receiving server. This is also the distinction made by [OWASP's input-validation guidance](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html).

In StitchTrack, Signup rejected the synthetic email `a@b` and a password containing one space. A separate curl request sent those same values directly to our temporary assessment fixture. It returned HTTP 200 because that fixture deliberately recognizes one fixed synthetic payload, not because real registration accepted it.

I keep those conclusions narrow. The fixture checks its own access and request envelope, creates nothing, and is never called by Signup. Real registration does not exist yet. Task Four must independently enforce the approved input policy, email verification, authentication and authorization before performing protected work. [Evidence 16](../evidence/16-direct-request-command-and-response.txt) records the actual response.

## 2. What security checks belong in the frontend, and what must the server enforce regardless?

I use the frontend for understandable feedback: required fields, email shape, password guidance, code format, accessible errors and a visible action that explains incomplete input. These checks reduce accidental mistakes; they cannot establish that someone owns an email address or may access a business.

StitchTrack currently checks Signup passwords for at least 12 Unicode code points, rejects whitespace-only values and control characters, and preserves meaningful spaces. The code field checks six ASCII digits as a string. The future server must enforce an approved compatible policy independently, including request types and processing bounds.

The [PRD](../../docs/PRD.md) also requires email ownership, verification expiry, attempt limits, resend cooldowns, account/IP rate limits and business/client isolation. Session validation, protected credential handling and authorization belong on the server. Approved Terms acceptance must eventually be checked and recorded there too.

Today's hydration guard prevents accidental native credential submission while the interface is unfinished. It is a safety measure for this UI, not a substitute for those future server controls.

## 3. Is hiding a delete button sufficient authorization?

No. Hiding a button changes what the interface offers; it does not stop someone sending the underlying request. I would check the authenticated identity and permission for the specific record on every protected server operation. That follows [OWASP's authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

For StitchTrack, knowing an order or agreement ID must never grant access. The server must establish the user's authorized business or verified client relationship. The PRD also preserves submitted agreements and payment history, so even an authorized tailor cannot simply delete protected history because a button exists.

These product operations are not implemented yet, and I have not tested a real delete endpoint. The relevant Task Three comparison was the hidden versus visible Signup action. Hiding it made incomplete forms harder to understand; making it focusable with aria-disabled improved discoverability. Neither design creates authorization. I would test a future protected endpoint directly using permitted and denied identities, rather than treat a screenshot of a missing button as security evidence.

## 4. What is the difference between validation, encoding and sanitisation?

I treat these as different operations. Validation decides whether a value meets a rule: StitchTrack's code checker accepts exactly six ASCII digits and rejects other strings. It does not establish that the code is correct for an account.

Encoding represents data safely in an output context. A value shown as text must not become executable markup. HTML, JavaScript and URL contexts have different requirements; encoding once is not a universal protection. Sanitisation removes or transforms disallowed content when a feature intentionally accepts something like rich HTML. [OWASP's XSS guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) explains that context distinction.

I do not silently sanitise passwords or codes by trimming or converting them. That could change a credential or lose leading zeros. Our draft renderer supports bounded, trusted repository Markdown and emits semantic React elements; it is not advertised as a general sanitizer for arbitrary user HTML. I would choose each defence at its actual input/output boundary rather than call every operation “cleaning the input.”

## 5. Why validate route parameters and query strings?

A URL is input, even when the interface normally constructs it. I validate it so malformed links do not silently select the wrong screen and direct requests receive the intended HTTP response.

StitchTrack's first consolidation incorrectly displayed Login for unsupported mode parameters. The final [state resolver](../../lib/auth/state.ts) permits only the agreed key-only states: Login, Signup, Reset and the guarded verification preview. Unknown keys, conflicting states and unexpected values are rejected. The proxy rejects before streaming can commit a successful status, and the page rechecks defensively.

Next.js also sends internal RSC navigation requests, whose serialized query differs from the visible URL. We handle that representation deliberately without accepting the same syntax as arbitrary public input. Tests cover both request types.

This is routing correctness, not proof of identity. A valid `/auth?verify` URL still needs the local-preview guard today, and future account actions require independent server authorization. I would apply the same distinction to record IDs: valid syntax does not grant access.

## 6. What is an SPA and how can it be discoverable by search engines?

An SPA updates views within the current document using client-side navigation, rather than replacing the whole document for each interaction. It can still request data from a server. StitchTrack's consolidated authentication page uses that style of switching, while Next.js also supplies server-rendered HTML.

For public content, I would provide useful HTML through server rendering or prerendering, crawlable links, meaningful URLs, page metadata and correct HTTP statuses. JavaScript-generated content can be indexed by Google, but rendering is an additional step and not every crawler executes scripts. [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) explains these limits.

StitchTrack's marketing homepage is the relevant discoverable content. The [authentication layout](../../app/%28auth%29/layout.tsx) deliberately specifies noindex and nofollow; I do not need Signup or recovery states promoted in search results. Our local-only previews should not be indexed or described as deployed features. I have not claimed that this project has a verified public deployment or search-engine indexing result.

## 7. What are the trade-offs between SPAs and multi-page applications?

I would choose around the user's task rather than label one architecture universally better. Client navigation can preserve the document and make related interactions feel continuous. It also creates responsibilities around URL state, focus, history, loading failures and the amount of JavaScript needed before interaction.

Separate pages give distinct entry points and can keep unrelated journeys simpler. Traditional full-document navigation can involve repeated downloads or lost transient state, although caching and modern frameworks change that trade-off. Next.js itself combines server-rendered first loads with client navigation; [its component documentation](https://nextjs.org/docs/app/getting-started/server-and-client-components) describes that hybrid.

In StitchTrack, consolidating three forms reduced duplicated route wrappers and centralized the state policy. The old pages already used Next.js Link, so I did not prove consolidation made navigation faster. Switching credential modes intentionally clears unfinished values. Terms views instead preserve the mounted Signup form. I would keep the client's invitation-based journey separate where its identity and access rules differ from tailor password login. [Rationale](spa-rationale.md).

## 8. Explain the four WCAG principles using StitchTrack examples.

I use the four principles as questions about whether people can perceive, operate and understand the interface, and whether assistive technology can interpret it reliably. [W3C's accessibility principles](https://www.w3.org/WAI/fundamentals/accessibility-principles/) provide the framework.

Perceivable means the information is available beyond one visual cue. StitchTrack combines error words and caution icons with colour, rather than showing only a red border.

Operable means people can use the controls. We retain native inputs/buttons, keyboard focus, an accessible password toggle and focus restoration when returning from a document view.

Understandable means instructions and outcomes make sense. Labels remain explicit, correction feedback identifies the problem, and valid local attempts say authentication is unavailable rather than implying success.

Robust means meaningful structure can be interpreted by browsers and assistive technology. Required states, associated error descriptions and semantic document headings/tables support that.

These examples are implemented decisions, not WCAG certification. The [audit](accessibility-audit.md) records owner-reported Narrator successes but still lacks exact comparative transcripts and four independently confirmed-and-fixed issues.

## 9. Why does semantic HTML matter for accessibility?

Semantic HTML gives software information that appearance alone cannot provide. A real label connects its text to an input; a native button supplies keyboard behaviour; headings expose document structure. I would use these elements before trying to recreate their behaviour with generic containers and ARIA. [W3C's form-label guidance](https://www.w3.org/WAI/tutorials/forms/labels/) explains the programmatic connection.

StitchTrack's earlier intermediate legal preview displayed Markdown as raw text inside pre. That text could still be read, but its heading and table syntax did not become navigable HTML structure. The current renderer produces headings, paragraphs, lists, links and scoped table headers while preserving the trusted draft wording.

The owner reports that Narrator announces opened document headings and reads the content with Insert + Down Arrow. Tab reaches interactive links rather than every paragraph, which is expected.

I do not turn those successes into a claim that the previous version was unreadable. Exact historical speech is missing. Semantic correction is source-backed; a complete before-and-after screen-reader failure comparison remains incomplete. [Audit](accessibility-audit.md).

## 10. Describe a disagreement with a customer about what to build.

I haven't had a direct experience where I disagreed with a customer's request, but I understand that such situations can happen during product development.

If I found myself in that situation, I wouldn't reject the customer's idea immediately. I would first try to understand the problem they want to solve and why they believe the requested feature is necessary.

After understanding their perspective, I would explain my concerns clearly, including how the decision might affect the product's usability, development time, cost, security, or future maintenance. I would also suggest alternatives that could achieve the same goal with fewer complications.

For example, if a customer requested several complex features for an initial product release, I might recommend starting with the essential features and improving the product based on user feedback.

My goal would not be to prove the customer wrong, but to help them make an informed decision that supports the product's long-term success.

## 11. Explain underperforming AI implementation to a nontechnical executive.

I would explain the user consequence and our response before discussing the tool. For example, our recorded first authentication consolidation showed Login when someone opened an unsupported query. That made a malformed link appear valid. The output needed correction even though a normal path could look convincing.

My explanation would be: the assistant produced a useful starting point, but it did not satisfy the agreed navigation contract. We reviewed the behaviour, made the allowed states explicit and added direct-request tests. Invalid states now return a real 404 instead of silently changing the intended action. [Consolidation record](spa-rationale.md).

I would avoid blaming an unspecified model or claiming a production outage. I would report what is verified, what remains untested and what review effort is still needed. Here, the work is local and authentication is unfinished. A generated implementation is not ready merely because it compiles; acceptance requires the actual user behaviour, security boundary and evidence to match the requirement. This is a proposed executive explanation, not a claimed meeting transcript.

## 12. Identify a StitchTrack validation rule that wrongly blocks some legitimate users and explain the trade-off.

The verification field accepts exactly six ASCII digits. That blocks someone with a legitimate intent who enters the equivalent digits using Arabic-Indic or fullwidth characters. The tests exercise these rejected forms. I have not observed a real customer encounter this; it is a documented compatibility cost.

I chose exact string comparison for this milestone because verification codes are identifiers. Silently converting characters, trimming input or treating a code as a quantity could change what is checked. Leading zeros such as `004281` must remain intact. The [numeric-input record](numeric-input.md) explains this decision.

The cost is an extra correction step for localized input. The error explains the accepted digits, while inputMode only suggests a mobile keyboard. Before real authentication, I would review generated-code format, localization, paste and server matching together. If user evidence justifies a mapping, it must be explicit, consistent and tested on both sides. I would not secretly broaden the client alone or pretend this format rule proves ownership.

## 13. Describe the actual direct HTTP request and what the response proves.

My recorded test was an agent-executed WSL curl POST to `http://127.0.0.1:3104/api/assessment/form-bypass`. It used JSON content type, the explicit assessment marker and the preserved payload file containing `{"email":"a@b","password":" "}`. The password is one synthetic ASCII space. [Evidence 16](../evidence/16-direct-request-command-and-response.txt) includes the actual command and response.

The response was HTTP 200 with outcome `fixed_synthetic_payload_observed`. It explicitly reported no account, session, persistence or email. The development-only loopback fixture checked its request envelope, bounded JSON body and exact synthetic allowlist; it deliberately did not apply Signup policy.

The same values were blocked by the browser form. Sending HTTP directly therefore avoided executing that frontend code. This does not prove a vulnerability in real registration, because no registration endpoint exists yet. It also does not prove data was saved.

Task Four must compare the same payload against an authorized real server implementation and test each rule independently. A rejection caused only by missing Terms would not prove both credential rules were enforced.

## 14. Critique the claim that frontend regex, disabled buttons and browser sanitisation eliminate injection and bad-data risks.

I would reject the claim because it confuses convenience controls with the receiving system's security boundary. Regex checks only the rules it expresses, disabled controls can be bypassed, and browser input handling does not protect a separate HTTP client.

Our actual attack run showed why I must distinguish layers: some pasted newline samples changed before the validator saw them, while direct function tests rejected the raw samples. I cannot infer that a future server receives or checks the same value from a browser-only result. [Attack evidence](../evidence/15-form-attack-results.txt).

On the server I would enforce input types, sizes and business rules, authorize the operation and handle data safely at its destination. For database values, parameterized queries keep data separate from SQL structure; blindly concatenating input is unsafe. [OWASP's SQL-injection guidance](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) explains that defence.

Rendering also needs context-appropriate handling, and invalid operations must not partly persist. These are future authentication/backend responsibilities, not protections established by our UI-only forms or the fixed-payload fixture.

## Additional note: user enumeration (not a fifteenth answer)

User enumeration means learning whether an account exists from differences in messages, status codes, redirects or timing. StitchTrack's UI-only Login and Reset perform no account lookup and give the same unavailable outcome for different format-valid synthetic addresses. That is not a test of registered versus unregistered accounts. Future authentication needs consistent failure/recovery behaviour and rate controls, verified against a real authorized backend. [Enumeration investigation](enumeration.md).

Assumptions: none.
