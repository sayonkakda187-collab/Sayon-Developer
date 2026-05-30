// Re-mounts on each navigation within this segment, so the incoming page fades
// in (see `.page-transition` in globals.css). Header/footer live in the layout
// and stay fixed. Pure CSS — no delay to interaction, disabled under reduced motion.
export default function PublicTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="page-transition">{children}</div>;
}
