import { ToastProvider } from "@/components/admin/Toast";
import { AiImageGenerator } from "@/components/admin/AiImageGenerator";

export const dynamic = "force-dynamic";

export default function AdminAiImagesPage() {
  return (
    <div>
      <div className="adm-page-h">
        <h1>AI Images</h1>
        <p>Generate illustrations from a text prompt, then download, save to media, or use one as an article cover.</p>
      </div>
      <ToastProvider>
        <AiImageGenerator />
      </ToastProvider>
    </div>
  );
}
