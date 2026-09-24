import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TopicPage } from "@/components/seo/public-pages";
import { topicMap, topicsFor } from "@/lib/seo/content";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() { return topicsFor("/vat").map(topic => ({ slug: topic.path.split("/")[2] })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = topicMap.get(`/vat/${slug}`);
  if (!topic) return {};
  return { title: topic.title, description: topic.description, alternates: { canonical: topic.path }, openGraph: { title: topic.title, description: topic.description, url: topic.path, type: "article" } };
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const topic = topicMap.get(`/vat/${slug}`);
  if (!topic) notFound();
  return <TopicPage topic={topic} />;
}
