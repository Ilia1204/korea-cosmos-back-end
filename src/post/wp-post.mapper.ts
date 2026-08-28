export function mapWpPostAdmin(post: any) {
	return {
		id: post.id,
		title: post.title?.rendered ?? '',
		description: post.content?.rendered ?? '',
		slug: post.slug,
		image: post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? '',
		featuredMediaId: post.featured_media || null,
		status: post.status,
		createdAt: post.date,
		updatedAt: post.modified
	}
}
