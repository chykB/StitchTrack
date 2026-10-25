# Task Two, Step 3: Model choices

## What I actually used

I performed the original StitchTrack application scaffold using **Codex in VS Code**, not Antigravity. This tool attribution is my confirmation as the project owner; the saved agent reports do not identify an exact underlying model.

The original Ship & Found Task Two Step 3 instructions are now available. They require Antigravity for the initial scaffold, another AI model or tool for later feature work, observed differences, and a real wrong-choice-and-switch account. My initial workflow therefore deviated from the scaffold requirement. I cannot present it as an Antigravity scaffold or claim that I fulfilled the missing model/tool-switch requirement.

I reviewed the [first and refined scaffold prompts](scaffold-prompt.md), [initial agent plan](../evidence/01-agent-plan.txt), [files-created report](../evidence/02-files-created.txt), existing Task Two documentation and available Git history. The scaffold prompt is inside this task's documentation folder; there is no root `docs/scaffold-prompt.md`.

## Tools, tasks and evidence

| Work | Tool and model I can establish | Supporting record |
| --- | --- | --- |
| Original application scaffold | Codex in VS Code, confirmed by me. Exact underlying model: not verified. | Agent plan and files-created report; scaffold commit `c6d8e08` |
| Controlled nested-folder recovery | Codex is explicitly named. Its interface and underlying model are not recorded. | [06-nested-folder-fixed.txt](../evidence/06-nested-folder-fixed.txt) |
| Assessment persistence and tests | The reviewed repository records do not identify the AI tool or exact model for this work. | Commit `d19b308`, [persistence procedure](persistence-experiment.md) and [observed failure account](false-success.md) |
| Information-design changes | Codex, owner-reported from implementation reports previously shared by the project owner. Exact underlying model: not verified. | Owner-shared Codex implementation reports; commit `95ada9a` and [information-design report](information-design.md) |

The commit authors identify who recorded the changes, not which AI model generated them. I cannot infer a model from the code, writing style, commit date or the model selected for a later conversation. Codex is the tool name here, not an exact underlying model identifier.

## Engineering reasons and observed behavior

For the scaffold, my documented goal was to have a coding agent inspect the existing repository and design system, propose a narrow plan, wait for approval and then edit the approved files. Codex in VS Code was the tool I used for that repository work. The saved prompt supports those engineering requirements, but it does not record why I selected Codex over Antigravity or another model. I need to supply my actual selection reason rather than invent a comparison.

**Selection reason — pending:** [Project owner to supply my actual reason for selecting Codex.]

The initial plan identified conflicting paths, missing documents and missing token categories, and asked for decisions before implementation. The files-created report later described the source changes and reported the dependency-installation blocker. It explicitly said typechecking, the build and browser checks had not run at that stage. Those are concrete observations about the recorded agent output.

Those early reports are historical: their rule-path statements and unresolved installation status are not descriptions of today's repository. Later [README verification history](../../README.md) records successful installation and checks.

For the nested-folder recovery, I gave Codex a small, testable job: place a minimal `package.json` in the existing temporary parent directory and verify the dev command there. The evidence records an initial carriage-return problem in a piped invocation, followed by a successful direct invocation printing `in-place-scaffold-running`. This was an execution-method correction, not evidence that I changed AI models.

For persistence, the records distinguish mocked unit tests from my independent database verification. The [failure account](false-success.md) records HTTP 500 where a more specific 503 was expected, while the UI correctly withheld success. For information design, the report records measured heading wrapping and browser checks. These help me assess the work itself; they do not support a claim that one AI model was faster, more accurate or better at design than another.

## Wrong choice and switching

Using Codex instead of the requested Antigravity was a mismatch with the assessment workflow. I have no documented case here of an unsuitable AI tool/model followed by a verified switch to a different one, and no supported cross-model comparison.

Changing a shell invocation, moving from PowerShell to CMD, changing Node.js versions or rejecting a homepage heading is not an AI-model switch. I must not reuse those incidents to claim that I completed this part of Step 3.

## Evidence I still need to supply

- The original scaffold session's model-selection screenshot or exported session metadata, tied to the scaffold task. Today's model setting would not establish the historical choice.
- Exact model records for later tasks, and tool attribution where still unverified, tied to their prompts, outputs or commits. Codex attribution for information design is owner-reported; its underlying model remains unverified.
- My actual reasons for selecting each tool, identified as my explanation if added retrospectively.
- If a genuine wrong-tool/model choice and switch occurred: the original task, first tool/model, observed problem, replacement tool/model and result. If none occurred, I should say so and ask how the assessment deviation should be handled.
- Genuine observed comparison evidence for different AI models or tools, if available.

This document records the workflow honestly, but the exact-model identification, required use of another AI model or tool and wrong-choice/switch account remain unverified. A future comparison could produce new evidence; it would not retroactively change which tool performed the original scaffold.

Assumptions: none
