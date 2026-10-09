import { llmsText } from "@/lib/seo/discovery";

// Build once, alongside the public guides. No runtime database or external API.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsText(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
