// Instant skeleton for the article editor (matches the 2-col editor layout).
export function EditorSkeleton() {
  return (
    <div className="adm-screen space-y-6">
      <div className="adm-editor-head">
        <div className="sk h-8 w-44 rounded-lg" />
        <div className="sk h-11 w-48 rounded-lg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="sk h-12 w-full rounded-lg" />
          <div className="sk h-20 w-full rounded-lg" />
          <div className="sk h-10 w-full rounded-lg" />
          <div className="sk h-[20rem] w-full rounded-lg" />
        </div>
        <div className="space-y-6">
          <div className="sk h-10 w-full rounded-lg" />
          <div className="sk h-40 w-full rounded-lg" />
          <div className="sk h-40 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
