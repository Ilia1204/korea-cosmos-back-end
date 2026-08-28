function decodeHtmlEntities(text: string): string {
	if (!text) return text

	return text
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, ' ')
}

export function mapWpPostAdmin(post: any) {
	return {
		id: post.id,
		title: decodeHtmlEntities(post.title?.rendered ?? ''),
		description: post.content?.rendered ?? '',
		slug: post.slug,
		image: post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? '',
		featuredMediaId: post.featured_media || null,
		status: post.status,
		createdAt: post.date,
		updatedAt: post.modified
	}
}
