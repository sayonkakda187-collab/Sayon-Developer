import { prisma } from "@/lib/db";

// The short, human-friendly code an admin reads out to a manager, who DMs the earnings
// Telegram bot `/start <CODE>` to link their chat. Format: up to 5 letters from the
// manager's name + "-" + 4 digits, e.g. "DARA-4827". Letters/digits only (easy to read
// aloud and type); uniqueness is enforced against the `PageManager.linkCode` column.

/** A candidate link code from a name (not yet checked for uniqueness). */
export function makeLinkCode(name: string): string {
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || "MGR";
  const digits = String(Math.floor(1000 + Math.random() * 9000)); // always 4 digits
  return `${prefix}-${digits}`;
}

/** A link code guaranteed unique against existing managers (retry on collision). */
export async function generateUniqueLinkCode(name: string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = makeLinkCode(name);
    const clash = await prisma.pageManager.findUnique({ where: { linkCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  // Astronomically unlikely fallback — append more entropy to guarantee uniqueness.
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || "MGR";
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}
