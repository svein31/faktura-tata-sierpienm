import { GET as getStatus } from "@/app/api/ksef/status/[refNumber]/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: {
    elementReferenceNumber: string;
  };
}

export async function GET(req: Request, { params }: RouteParams) {
  return getStatus(req, { params: { refNumber: params.elementReferenceNumber } });
}
