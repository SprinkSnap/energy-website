import { notFound } from "next/navigation";
import { SiteShell } from "@/components/layout/site-shell";
import { ResourceArticlePage } from "@/components/resources/resource-article-page";
import { RESOURCE_ARTICLES } from "@/lib/resources-content";
import { createMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return RESOURCE_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const article = RESOURCE_ARTICLES.find((a) => a.slug === slug);
  if (!article) return {};
  return createMetadata({
    title: article.metaTitle,
    description: article.metaDescription,
    path: article.path,
  });
}

export default async function ResourceSlugPage({ params }: Props) {
  const { slug } = await params;
  const article = RESOURCE_ARTICLES.find((a) => a.slug === slug);
  if (!article) notFound();

  return (
    <SiteShell>
      <ResourceArticlePage article={article} />
    </SiteShell>
  );
}
