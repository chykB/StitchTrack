# Task Two: Interview defence

I distinguish recorded StitchTrack results from practices I would use. Questions 9 and 14 require correcting their production and false-success premises. The additional viva answer is separate from the fifteen numbered answers.

## Version control

### 1. What is the difference between Git Flow and trunk-based development, and why have a lot of teams moved toward trunk-based?

I see Git Flow as a release-oriented branching model. It normally has long-lived main and develop branches, with feature, release and hotfix branches serving different purposes. It can suit software with scheduled releases or several supported versions, but changes need to travel through more branches.

With trunk-based development, I integrate small changes into one main development line frequently, usually at least daily. Short-lived branches and quick pull requests can support that approach. It does not mean skipping review, testing or release controls, and merging does not automatically mean deploying.

Teams favor this because smaller batches expose integration problems earlier and reduce long-running branch divergence. Reliable automated checks and keeping main usable are important; feature flags can separate integration from releasing unfinished functionality.

For StitchTrack, my feature branch and PR merge show a simpler main-plus-feature workflow, not full Git Flow. One project example does not prove a mature trunk-based team cadence. I would choose the workflow around delivery needs rather than its name. My references are the [original Git Flow description](https://nvie.com/posts/a-successful-git-branching-model/) and [DORA’s trunk-based guidance](https://dora.dev/capabilities/trunk-based-development/).

### 2. What does `git push --force` actually do, and why is `--force-with-lease` generally safer?

I understand force push as requesting a remote reference update even when it is not a fast-forward. For a branch, that can replace its tip with a history that omits commits currently reachable from the remote tip. It does not upload unstaged files or bypass the server’s permissions and protection rules.

For example, if somebody pushed a commit after my branch diverged, an unconditional force push could remove their commit from that branch’s visible history. Their clone might still contain it, so this is not necessarily immediate permanent erasure.

Force-with-lease adds an expectation about the current remote reference. The update is rejected if that expectation does not match. By default it commonly uses my remote-tracking reference; background fetches can advance that reference and weaken the protection. An explicit expected commit gives a more deliberate check.

I would still inspect and coordinate an authorized rewrite. A lease is not proof that my replacement preserves everyone’s work. StitchTrack’s recorded PR merge needed no force push. These details follow the [Git push manual](https://git-scm.com/docs/git-push).

### 3. Why is rewriting history, through rebase, amend or force push, dangerous on a shared branch?

I treat published commit IDs as shared reference points. A commit records its content, parents and metadata. Amend creates a replacement commit, and rebase can replay commits with new parents, producing new IDs even where the intended changes look similar.

If another person based work on the old commits, rewriting the shared branch leaves their history based on something the remote no longer presents as its current line. Their next integration may need manual repair, produce confusing duplicate changes or accidentally restore discarded work. Review links and checks tied to particular commits can also become harder to follow.

Rebase and amend happen locally first. The shared disruption occurs when the replacement history is published, usually through a forced update. Old objects are not instantly erased everywhere.

For StitchTrack, I would normally correct shared main with a new commit or a reviewed revert. My [saved branch history](../evidence/15-git-log-graph.txt) preserves the feature merge and rejected experiment. I would reserve coordinated rewriting for an explicitly approved exceptional need. The [Git book’s rebasing warning](https://git-scm.com/book/en/v2/Git-Branching-Rebasing) explains this risk.

### 4. What is the difference between `git merge` and `git rebase`, and when would you actually pick one over the other?

I use merge to integrate another line of development while preserving its existing commits. If the target can simply advance to a descendant, Git can fast-forward without creating a merge commit. With diverged histories, a normal merge combines changes and records a commit with both lines as parents.

Rebase instead replays selected commits onto a different base. It can produce a simpler linear sequence, but the replayed commits normally receive different IDs. Conflicts can require attention during several replayed commits, not just once.

I would pick merge for shared history where preserving ancestry and avoiding a published rewrite matter. StitchTrack provides a concrete example: feature commit 95ada9a joined main through PR #1 and merge commit e70de85, with two parents.

I might rebase my own unpublished feature work onto an updated main before review, after checking that nobody depends on those commits. That is a choice I could make, not an operation I claim to have performed here. Neither approach proves the combined code works. I would inspect the result and run relevant checks. See the [Git rebase manual](https://git-scm.com/docs/git-rebase).

### 5. What causes a merge conflict, and what is actually happening in the file when you see the conflict markers?

I expect a conflict when Git cannot safely combine changes using the available histories. Typical examples include incompatible edits to the same region, or one branch deleting a file that another changes. Two branches editing a file do not automatically conflict if their changes combine cleanly.

During a normal merge, Git compares both sides with a common ancestor. In an unresolved text hunk, `<<<<<<<` introduces the current side, `=======` separates the alternatives and `>>>>>>>` closes the incoming side. A diff3 presentation can also show the ancestor after `|||||||`. This is an unresolved representation, not working application code.

I would inspect status and the surrounding changes, understand the intended behavior, edit a coherent result, remove the markers and stage the resolution before continuing. I would then test the result, rather than blindly selecting “ours” everywhere. During rebase, those labels can be especially confusing.

StitchTrack’s rejected heading was a rejected experiment, not a documented merge conflict. I would not invent one. The [Git merge documentation](https://git-scm.com/docs/git-merge) explains the markers.

### 6. What is the difference between the working directory, the staging area and the repository?

I think of the working directory as the checked-out files I can edit, such as StitchTrack’s README and application source. Editing them changes my local files but does not create a commit.

The staging area, technically the index, describes the next snapshot I intend to commit. Git add records selected current content there. It does not physically move the file. If I edit the same file afterward, its staged version and working-directory version can differ. I can inspect unstaged changes with git diff and staged changes with git diff --cached.

The local repository stores commits, objects, references and history, normally through the .git directory. Git commit records the staged snapshot there. GitHub hosts a separate remote repository; it is not the staging area.

In StitchTrack, saving a documentation correction, staging it, committing it and pushing it are separate actions. Pushing shares committed history, not arbitrary local edits, and does not itself deploy anything. My [working-tree explanation](working-tree.md) and the [Git book’s three states](https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F) describe those boundaries.

### 7. What is branch protection, and what does it typically enforce?

I see branch protection as server-side policy controlling updates to important branches. Typical rules require a pull request, approving reviews, successful named status checks or resolved conversations before merging. Rules can also restrict who pushes and prevent force pushes or branch deletion. The exact enforcement depends on configuration, permissions and any bypass rights.

For StitchTrack, I can show that PR #1 merged information-design work. That does not prove protection rules were enabled, reviews were mandatory or CI checks were enforced. I have not verified those settings and would not claim otherwise.

If we adopted protection, I would first agree on the policy, automate the relevant existing checks, then require those actual check names. I would also verify administrator or other bypass behavior instead of assuming everyone is covered.

Protection reduces accidental changes but does not make code correct by itself. Our mocked database tests can pass while a real adapter failure is misclassified. That still needs investigation and review. The [GitHub protection documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) describes the available controls; a settings review would establish what this repository enforces.

## Engineering and customer delivery

### 8. Walk me through a technical project you built end to end.

My example is StitchTrack’s assessment implementation, not a completed production tailoring platform. I started with Task One: a Figma-based design system, a JavaScript token converter, tests and a static dashboard using sample orders.

For Task Two, I refined the scaffold prompt, reviewed the repository context and approved a bounded Next.js App Router and TypeScript implementation. The landing page reuses the existing semantic tokens and local DM Sans rather than replacing that work.

I then added a separate synthetic enquiry experiment with server validation, structured logs and Prisma-backed PostgreSQL persistence. I manually applied its migration to an isolated assessment database. Successful submissions returned HTTP 201 with IDs and timestamps, and Prisma Studio showed five records. A controlled failed connection produced no new record and truthful error feedback, although its 500 classification remains unresolved.

I also completed local information-design checks and an assisted independent Windows homepage test. The [Task Two overview](../README.md) links the evidence. Authentication, real orders, agreement approvals and notifications remain future work. I have not deployed StitchTrack to production or claimed that this slice completes the product.

### 9. Tell me about a time when something you built broke in production.

I cannot honestly give a StitchTrack production incident: the application has not been deployed to production. My closest relevant example is a deliberately controlled local database failure, and I would label it that way in an interview.

I changed only the assessment application’s connection to an unused local port. An initial attempt failed because required configuration was missing. After correcting that, the repeated test returned HTTP 500 with outcome internal_error. The form page itself still loaded, which showed why page availability and successful persistence are different checks.

The UI displayed an error and request ID. I compared that with the server log and checked that the database still held the same five records. I did not observe false success or customer impact.

I expected a recognized transport failure to be 503. The classifier misses some constructed adapter error kinds, but the historical exception shape remains unverified. My next step would be an authorized repeat and a regression fixture, not guessing the root cause. The [failure account](false-success.md) and [defect investigation](defects.md) preserve what actually happened and what is still open.

### 10. How do you approach learning a new technical platform or codebase quickly when starting a new engagement?

I would start by learning the product boundary before changing code. I would read the README, authoritative requirements, project instructions, folder structure and package scripts. I would identify what already works, what is experimental and which operations need approval.

For StitchTrack, that means treating the PRD as read-only, reading the agent rules and understanding that the enquiry experiment is separate from future customer workflows. I would trace one request from the form through the API, validation and persistence adapter, then check the related tests and configuration.

I would establish a small reproducible baseline, such as the database-free homepage and unit tests, rather than immediately connecting to an unfamiliar database. I would verify runtime versions, consult primary documentation for unfamiliar behavior and make one bounded change at a time.

The [original plan](../evidence/01-agent-plan.txt) shows why this matters: it surfaced missing documents and conflicting paths before implementation. I would also check later records, because historical blockers may already be resolved. Finally, I would summarize my understanding and remaining questions so the owner can correct misunderstandings early.

### 11. What is the difference between code that is correct and code that is complete?

I call code correct when it behaves according to a defined contract for the relevant conditions. I call an implementation complete when it covers the agreed scope, including required failure behavior, integration, verification and the information needed to operate or maintain it.

A passing happy-path test does not establish either property for every condition. In StitchTrack, returning 201 after an awaited write is part of the contract. Passing mocked transport tests only checks their fixtures; the real unused-port request returning 500 shows an unresolved classification problem against the intended behavior.

Completeness is also relative to scope. The initial landing scaffold did not need authentication or real order management. Leaving those out was deliberate, not proof that the scaffold was unfinished. Conversely, I cannot describe the entire planned product as complete just because its landing page works.

The [defects report](defects.md) separates open findings, resolved wrapping and verification limits. I would use acceptance criteria and evidence to decide completion, then clearly state remaining gaps. The README retest and model-switch evidence remain incomplete even though substantial application work is functioning.

### 12. How do you design software for a customer who will need to maintain it after you are gone?

I would optimize for the next maintainer understanding and safely changing the system, not just for my first delivery. I would use familiar structure, clear naming, a small dependency set and explicit configuration. I would document decisions and operational boundaries alongside the code.

StitchTrack already has useful foundations: locked dependencies, reusable design tokens, a root setup guide and separation between request handling, validation and database configuration. The landing page needs no database credentials, while the assessment refuses implicit database defaults. That makes the two modes easier to distinguish.

I would provide reproducible checks, explain what mocked tests do not prove, and record known defects instead of hiding them behind a successful build. Database deployment and cleanup need reviewed instructions; an applied migration must not disappear just because the assessment is temporary.

The independent [README test](readme-test.md) showed that my instructions still needed improvement. I corrected version, shell and existing-clone guidance, but an unaided retest remains outstanding. Before a real handover, I would also agree on ownership, backup, release and support procedures rather than claiming those production arrangements already exist.

## StitchTrack investigation

### 13. Your first page load took a specific number of milliseconds. Where did that time go? Name the parts you can measure and the parts you are guessing about.

My recorded first-page response was 789ms with HTTP 200, as shown in [04-first-load.txt](../evidence/04-first-load.txt). That is a development-server HTTP measurement. It is not a complete browser rendering measurement or a timing breakdown.

The evidence does not record how much of those 789ms belonged to connection establishment, server waiting, rendering or response transfer. I cannot subtract timings from a different request and present them as components of this one.

For a follow-up, I would measure curl phases such as name lookup, TCP connection, time to first byte and total transfer time. I would correlate the same request with server compilation and application timing, then use browser Network and Performance tools to inspect assets, font loading, scripting and paint separately. Browser work after the HTML response is not automatically included in curl’s total.

Compilation, cold caches and development overhead are plausible explanations, not measured causes here. There was no homepage database requirement to blame without evidence. I would compare cold and warm requests and a production build under recorded conditions. My [performance note](performance-note.md) keeps that uncertainty explicit.

### 14. Your application reported success to the user while writing nothing to the database. Explain the mechanism that allowed that, and name the one check that would have caught it in thirty seconds.

I need to correct the premise: StitchTrack did not show success for the recorded failed write. The [failure screenshot](../evidence/13-write-failed-ui.png) shows an error and request ID; the database remained at five records. The unresolved issue is HTTP 500 instead of the intended 503.

A false-success bug could happen if a handler returned before awaiting the write, swallowed a database exception and still returned success, or the browser displayed success regardless of response status. Those are hypothetical mechanisms, not incidents I observed here.

In StitchTrack, the [handler](../../lib/assessment/enquiry.ts) awaits persistence and validates the returned receipt before 201. The browser also requires 201 and a valid receipt. My [successful logs](../evidence/11-write-succeeded-logs.txt) include distinct IDs and timestamps, which I checked against [stored records](../evidence/12-database-rows.png).

The decisive quick check would be an independent lookup in the confirmed assessment database for that exact request ID, comparing its ID and timestamp. A page load, generic row count or success banner alone is weaker evidence. That lookup is a developer-run operation; I would not use the development database or treat a test plan as proof it executed.

### 15. Wrong-answer analysis: A candidate says, "I always check my app is working by signing up a test user and confirming I get taken to the dashboard. If the dashboard loads, the backend is working." Explain what is wrong, what this misses and what you would do instead.

I would say that the candidate has checked navigation and some visible behavior, not the whole backend. A dashboard might render from static content, cached state or a session cookie even if a required database write failed. It also says little about validation, authorization or failure handling.

I would inspect the actual submission’s HTTP status and response body, correlate its request ID with sanitized server logs, then independently verify the expected record in the intended database. I would compare the returned identifiers and timestamps with the stored values, not just check whether a familiar page appeared.

For StitchTrack, there is no implemented signup or product dashboard to claim as a test. The relevant evidence is the synthetic enquiry: successful POSTs returned 201 and real records were verified. During the controlled failure, the form GET still returned 200 while its POST returned 500 and created no new record.

I would also test invalid input and controlled failure cases, confirming that the UI does not claim success. The [failure account](false-success.md) demonstrates why HTTP response, logs and database evidence must be considered together.

## Additional viva preparation — not part of questions 1–15

**What would you do if you accidentally committed sensitive information to a public repository?**

I would treat a published credential as exposed immediately. I would notify the owner through the agreed incident process and revoke or rotate the credential first, then update authorized services securely. Deleting the latest file does not invalidate a password or token, and making the repository private cannot guarantee nobody copied it.

I would assess what was exposed and review available access logs without spreading the secret into screenshots or chat. If personal data were involved, I would involve the responsible privacy or security owner rather than invent a notification decision.

If history cleanup were necessary, I would coordinate it with collaborators, preserve needed work safely and follow a reviewed process using an appropriate tool such as git-filter-repo. I would address affected branches, tags and clones and seek GitHub assistance where cached references require it. Rewriting cannot recall every public copy.

For prevention, I would review staged changes, keep local secrets ignored, and consider secret scanning. This is a hypothetical response, not a claimed StitchTrack incident. The [GitHub sensitive-data guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) supports rotating secrets before considering disruptive history cleanup.

## Factual gaps to confirm before the interview

- No StitchTrack production incident exists in the supplied record. If I want to discuss a production incident from another project, I need to supply a genuine account; question 9 currently uses the explicitly local example.
- Effective GitHub branch protection settings and bypass permissions have not been verified. PR #1 alone is not evidence that those controls were configured.
- The original 789ms measurement has no recorded phase breakdown. Additional tracing would be new evidence, not a reconstruction of measured numbers.
- The failed request’s exact sanitized adapter exception shape remains unverified. The classifier probe supports a coverage gap, not a proven complete root cause.
- Historical underlying AI models, my actual Codex selection reason and the required different-model/tool comparison remain gaps in [model-choices.md](model-choices.md). The [Windows test](readme-test.md) still needs an unaided retest, original quotes and warning details.

All fifteen answer bodies are between 150 and 200 words, excluding question headings and these review notes. No application checks or database operations were performed to prepare this document; linked test results remain recorded evidence.
