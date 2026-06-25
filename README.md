# Wordking Refactor Output

This folder contains a level-separated version of the current GitHub `outputs` files.

## Files

- `index.html`: updated to load separated question bank files.
- `data/level1.js`: level 1 questions, with `Q294` removed.
- `data/level2.js`: level 2 questions.
- `data/level3.js`: level 3 questions.
- `firebase-auth.js`, `firebase-config.js`: copied from the current repo output.

## Removed Problem

- `Q294`: `종이 울리자 학생들이 교실에 들었다.`
- Reason: the target word is `들다`, but the sentence contains `학생들이` before the intended target. The underline logic can mistakenly mark the particle-like `들이` portion instead of the verb form `들었다`.

## Behavior Notes

- Level 1 practice loads from `data/level1.js`.
- Level 2 practice loads from `data/level2.js`.
- Level 3 practice loads from `data/level3.js`.
- The first daily challenge still uses both level 1 and level 2 questions via `challengeStage(["level1","level2"])`.

To apply this to GitHub, copy these files into the repository's `outputs/` folder.
