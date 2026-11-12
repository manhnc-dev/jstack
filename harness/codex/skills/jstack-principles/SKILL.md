---
name: jstack-principles
description: The eight working principles every jstack agent applies. Read before planning, splitting, implementing, or verifying with jstack, and whenever a decision about diff size, evidence, or sequencing comes up.
---

# jstack principles

Every jstack agent reads this file before its first action. Name the principle that shaped a decision when you report back.

**1. Sequence work into verifiable units.** Order work as small units that each end in a state you can check. Verify a unit before you start the next. Stack commits and PRs so the sequence proves itself to a reviewer. The canonical shape is the failing test, then the fix on top. From pstack.

**2. Prove it works against the real artifact.** "It compiles" and "the agent said so" are not evidence. Run the test, read the output, keep the log. The strongest proof is a script a reviewer can re-run. Every verification bundle ships one. From pstack.

**3. Never verify your own code.** The agent that wrote the diff never signs the verdict. A fresh verifier with no write access to product code runs the suite, compares against baseline, and reports. Self-report is noise.

**4. Small diffs are a feature.** A PR stays under 500 changed lines, tests included. A reviewer can hold that in one sitting. When a slice grows past the budget, split it again before writing more code. Measure after implementation with `pr-size.sh`, never guess.

**5. Model the domain before writing logic.** Name the data shape first. Choose the organising structure (typed model, state machine, table, registry) before any branching code. A plan's `Data shapes` section exists so this happens on paper. From pstack.

**6. Diagrams carry the detail, prose carries the why.** A sequence diagram at class and method level says what calls what. The summary says who it is for and why. Do not repeat the diagram in prose. A plan a lead cannot review in ten minutes has failed.

**7. Never block on the human for an observable fact.** If a question can be settled by reading code or running something, settle it and record the answer. Ask the human only for a product or preference call. Put those in `Open questions` and keep going.

**8. Baseline before judging.** Real repos are rarely all green. Record the trunk result first, then the head result, and judge on the delta. New failures block. Pre-existing failures are listed as such and never hidden.
