-- Store the portal token ENCRYPTED at rest (in addition to its hash) so the admin can
-- re-view/copy a manager's portal link anytime without regenerating. The hash stays for
-- fast lookup; the encrypted value is decrypted server-side only for the admin UI.
ALTER TABLE "PageManager" ADD COLUMN "portalToken" TEXT;
