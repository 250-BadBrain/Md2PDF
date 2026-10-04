# Official specification fixtures

These fixtures are vendored for offline regression testing. They are not included in the application bundle.

| File | Source | Examples | SHA-256 |
| --- | --- | --- | --- |
| commonmark-0.31.2.json | https://spec.commonmark.org/0.31.2/spec.json | 652 | d431b29d97b6f73e69d547109cf5081578fac931e72afe95639ebe766c1b2a20 |
| gfm-0.29-spec.txt | https://raw.githubusercontent.com/github/cmark-gfm/0.29.0.gfm.13/test/spec.txt | 672 | 7d8e5814befec287ac116786d81ff14e0adc9b13295b4494649e995408fd871c |

Downloaded on 2026-10-04. CommonMark is by John MacFarlane and contributors; GFM is GitHub's specification based on CommonMark. Both specifications are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Original fixture files are unchanged. Extracting GFM examples, canonicalizing rendered DOM, and documenting product differences are adaptations for this project. The derived difference fixtures and compatibility documentation are provided under the same CC BY-SA 4.0 license.

`*-differences.json` stores the reviewed, exact normalized expected and actual output, the example source, and its reason. Never replace these files automatically to make tests pass. Diagnose a new difference, decide whether to fix it, and document a justified exception. `SPEC_DIAGNOSTICS=1` writes candidate differences only to ignored `tmp/`; it does not update reviewed baselines.

Run `npm run test:compatibility`. Tests verify the complete fixture counts and SHA-256 hashes, then invoke the actual application renderer using standard soft breaks. Local image references are supplied as simulated uploaded assets; production missing-image behavior has separate tests.
