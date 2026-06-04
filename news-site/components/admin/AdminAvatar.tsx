// Admin avatar content: the uploaded profile picture when one is set, otherwise
// the email initials. Render this INSIDE an `.adm-avatar` span/button (the circle
// frame in the shell, or the larger preview in Settings).
export function AdminAvatar({
  avatarUrl,
  initials,
}: {
  avatarUrl?: string | null;
  initials: string;
}) {
  if (avatarUrl) {
    // A tiny, fixed-size UI image; a plain <img> keeps the circle frame simple
    // (next/image fill needs a positioned wrapper). Same pattern as the cropper.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="adm-avatar-img" />;
  }
  return <>{initials}</>;
}
