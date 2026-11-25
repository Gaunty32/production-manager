---
name: Knowledge Centre Facebook sharing
description: User requirements for daily sharing of new Knowledge Centre articles to their Facebook page.
---

Check the Knowledge Centre daily for new articles and publish new articles to the company's Facebook page.

**Why:** The user explicitly requested this recurring workflow, confirmed the one-off Facebook test worked, then asked for the first two article paragraphs.

**How to apply:** Each post must include the article image, its first two actual prose paragraphs (not headings), and a Read more link directly to that article on the company's Knowledge Centre, not the external source feed. Preserve the paragraph break in captions and previews. Avoid duplicate posts. Do not describe the automation as active until the page is connected and scheduling is actually enabled.

Keep the integration on Facebook rather than switching to HighLevel.

**Why:** After being offered a HighLevel alternative, the user said, “lets fix the facebook connection.”

**How to apply:** Continue with a Facebook connection unless the user chooses another approach. Do not silently substitute a different publishing provider.

The confirmed Facebook destination is Select Branding Solutions: https://www.facebook.com/1133182819878646. Do not publish these articles to Select Uniforms.

**Why:** The user explicitly rejected Select Uniforms, then confirmed that the Select Branding Solutions link returned by Meta opens the correct company Page.

**How to apply:** Use the verified API Page ID `1133182819878646`, not the ID from the earlier supplied `profile.php` link. Verify the authorised Page before enabling or testing publication; access to other Pages is not permission to substitute them.

Soro was already connected to Select Branding Solutions and publishing article-related posts when this app's publisher was requested.

**Why:** The user confirmed this and supplied screenshots of Soro's connection and Facebook's published content.

**How to apply:** Preserve Soro's article source and connection; do not assume its rewritten, homepage-only Facebook captions can reliably identify the underlying articles.

Use this app instead of Soro to publish the Knowledge Centre article posts.

**Why:** The user selected “Use this app instead of Soro.”

**How to apply:** Before activating this app's publisher, require confirmation that Soro's article auto-sharing has actually been stopped. Choosing the replacement is not proof that Soro has been switched off. Never enable two competing article publishers.

Use a Page-scoped token derived from the extended User token; extending a User token separately does not extend a Page token already derived from the original temporary token.

**Why:** Correct Page identity and publishing permissions were not sufficient: the first Page token still inherited the temporary token's short lifetime. A newly derived Page token was required.

**How to apply:** On reconnection, validate Page identity, token type, publishing permissions and token lifetime independently. Treat Meta's token expiry and data-access expiry as separate checks; no scheduled token expiry does not guarantee irrevocable access.
