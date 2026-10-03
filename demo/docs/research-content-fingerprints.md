# Future SEC research content fingerprints

This is an additional, conservative diagnostic receipt. It does not change research eligibility, event identity, `sourceHash`, packet hashes, or publication checks. Existing packets must never be backfilled or amended. A newly computed digest of a later read says nothing about an earlier body that was not preserved.

## Scope and receipt

At a successful **future** capture, `lib/live-collector.cjs` adds `contentFingerprint` to a document only when `kind=research` and the URL is HTTPS on exactly `www.sec.gov`, with the SEC Archives EDGAR data/accession HTML path. Queries, fragments, credentials and non-default ports are outside this initial profile. Existing request sanitation, host/scheme guards, redirects, request budgets and 2 MiB limits remain unchanged. This helper grants no retrieval permission.

An available receipt has `version: 1`, `profile: sec-archives-html-syntax-v1`, `algorithm: sha256`, `status: available`, `sha256` and `tokenCount`. It contains no copied body or extracted full text. The original document URL, `sourceHash`, `bytes`, retrieval time and matching request receipt remain authoritative and unchanged. Unsupported input instead records `status: unavailable` plus a bounded reason code, without a digest; retrieval can still be successful. Missing or unavailable fingerprints are not matches.

The existing collector's `sourceHash` and `bytes` cover the UTF-8 re-encoding of `Response.text()`, not compressed network bytes or an original charset-preserving byte stream. The new projection uses that same decoded body. It refuses replacement characters and NUL rather than certifying ambiguous decoding.

## Version 1 algorithm

This is a lexical HTML **source-content** fingerprint, not a browser DOM, rendered-text or semantic-equivalence fingerprint. Its narrow equivalences are attribute order, whitespace used as markup separators, and attribute quote delimiters. Names, all attribute values, boolean-vs-valued attributes, tag order, start/end tags and explicit self-closing syntax are retained. Character data is retained exactly: no trimming, whitespace folding, entity decoding, Unicode normalization, numeric reformatting, sentence sorting or text deduplication.

Each token is a JSON array followed by LF, UTF-8 encoded and fed to SHA-256. The first token is `["profile","sec-archives-html-syntax-v1"]`. Regular tags become `["tag",closing,name,sortedAttributes,selfClosing]`; ordinary text becomes `["text",text]`. Attribute sorting uses exact lexical name order; duplicate names, compared case-insensitively, make the projection unavailable. The implementation is the normative profile definition and its behavior must not change under the same profile/version.

Comments, CDATA, processing instructions, supported simple HTML doctype declarations and raw-text elements are included verbatim as `["opaque",source]`. `title`, `textarea`, `style`, `xmp`, `iframe`, `noembed` and `noframes` are opaque through their closing tags. At the first opening `script`, `noscript`, `plaintext`, `template`, `svg` or `math`, the entire remaining source is included verbatim as one `["opaque-tail",source]` token. This intentionally avoids guessing complex parsing modes or silently stripping factual information from comments/scripts. Unsupported or unterminated syntax and nontrivial doctypes fail closed to an unavailable fingerprint. An actual HTML element must be encountered before an opaque tail.

Amounts, dates, ordered table rows/cells, spans, hidden content, image alt text, inline-XBRL attributes and all ordinary text changes therefore fail comparison. A comment/script addition also fails. Many harmless formatting changes fail too; this is intentional conservatism. Synthetic tests contain no copied third-party full bodies.

## Independent read procedure

1. Keep the original immutable result packet and verify its packet hash by the existing workflow. Identify the exact document ID, URL, raw `sourceHash`, `bytes`, retrieval time and collector-created fingerprint. Never substitute another URL or rewrite a receipt from a reread.
2. Make an authorized independent read of that exact URL. Preserve the actual body locally for the current review only and actually inspect its facts. Do not use a search excerpt, browser-transformed text, or a previously cached body as a fresh read. Do not work around a source access denial.
3. Run `node scripts/research-content-fingerprint.cjs EXACT_URL LOCAL_RESPONSE_BODY`. It performs no network requests, prints only hashes/metadata, matches the collector's UTF-8 decoding, and never modifies a packet. Compare URL, raw hash and byte count first. Record the independent retrieval method/time separately; the CLI cannot attest those facts or prove which body an analyst read.
4. If raw identity differs, explicitly record both hashes and byte counts. Only compare fingerprints when both have `status=available` and exactly the same profile, version and algorithm. Equal hashes/token counts establish equality of this specified lexical projection, subject to normal SHA-256 assumptions. A mismatch, missing metadata, unsupported profile or unavailable digest leaves content unverified. Do not substitute a plain text hash or omit opaque portions to obtain a pass.
5. Even a projection match does **not** establish raw identity, explain unknown extra bytes, prove authenticity or accuracy, or grant publication approval. Existing raw integrity and research/publication checks stay in force. Review source and rendering limitations before making any research claim. The analyst's actual reading, source attribution, factual review and any required decision on a raw mismatch remain separate.

## Limits and the unexplained 363-byte variants

The profile does not execute JavaScript, render CSS, inspect external images/styles/scripts, resolve external resources, or prove browser-visible output. Static attribute reordering can be observed by scripts even when their own bytes match; do not infer runtime equivalence. The lexer does not validate general HTML/XML/SGML correctness or extract normalized financial facts. SHA-256 protects a precisely defined projection, not the meaning or truth of a filing.

The three earlier SEC exhibits with frozen `bytes` larger by 363 have no capture-time content fingerprint and no inspectable frozen body. Computing this fingerprint on accessible rereads cannot reconstruct their missing variants, establish a match, identify the extra bytes or justify publishing the deferred studies. Unknown script/comment differences are deliberately covered, not discarded. Only a genuine later capture can start producing comparable receipts. There is no compiler bypass or automatic promotion of company studies in this change.
