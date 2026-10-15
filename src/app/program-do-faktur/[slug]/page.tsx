import type { Metadata } from "next";
import { topicMetadata } from "@/lib/seo/metadata";
import { notFound } from "next/navigation";
import { TopicPage } from "@/components/seo/public-pages";
import { topicMap, topicsFor } from "@/lib/seo/content";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() { return topicsFor("/program-do-faktur").map(topic => ({ slug: topic.path.split("/")[2] })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = topicMap.get(`/program-do-faktur/${slug}`);
  if (!topic) return {};
  return topicMetadata(topic);
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const topic = topicMap.get(`/program-do-faktur/${slug}`);
  if (!topic) notFound();
  return <TopicPage topic={topic} />;
}
