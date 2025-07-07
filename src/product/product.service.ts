import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { LabelProductService } from 'src/label-product/label-product.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PaginationService } from 'src/pagination/pagination.service'
import { PrismaService } from 'src/prisma.service'
import { returnReviewObject } from 'src/review/return-review.object'
import { convertToNumber } from 'src/utils/convert-to-number'
import { generateSlug } from 'src/utils/generate-slug'
import { ApplyDiscountDto } from './dto/apply-discount.dto'
import {
	EnumProductSort,
	GetAllProductDto,
	GetProductsByCategoryDto
} from './dto/get-all-product.dto'
import { UpdateProductDto } from './dto/product.dto'
import {
	returnFullestProductObject,
	returnProductObject
} from './return-product.object'

@Injectable()
export class ProductService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly labelProductService: LabelProductService,
		private paginationService: PaginationService,
		private notificationsService: NotificationsService
	) {}

	async getAll(dto: GetAllProductDto = {}) {
		const { perPage, skip } = this.paginationService.getPagination(dto)
		const filters = this.createFilter(dto)

		const products = await this.prisma.product.findMany({
			where: filters,
			orderBy: this.getSortOption(dto.sort),
			skip,
			take: perPage,
			select: returnProductObject
		})

		return {
			products,
			length: await this.prisma.product.count({
				where: filters
			})
		}
	}

	private createFilter(dto: GetAllProductDto): Prisma.ProductWhereInput {
		const filters: Prisma.ProductWhereInput[] = []

		if (dto.searchTerm) filters.push(this.getSearchTermFilter(dto.searchTerm))

		if (dto.ratings)
			filters.push(
				this.getRatingFilter(dto.ratings.split('|').map(rating => +rating))
			)

		if (dto.minPrice || dto.maxPrice)
			filters.push(
				this.getPriceFilter(
					convertToNumber(dto.minPrice),
					convertToNumber(dto.maxPrice)
				)
			)

		if (dto.categoriesIds)
			filters.push(this.getCategoryFilter(dto.categoriesIds))

		return filters.length ? { AND: filters } : {}
	}

	private getSortOption(
		sort: EnumProductSort
	): Prisma.ProductOrderByWithRelationInput[] {
		switch (sort) {
			case EnumProductSort.LOW_PRICE:
				return [{ price: 'asc' }]
			case EnumProductSort.HIGH_PRICE:
				return [{ price: 'desc' }]
			case EnumProductSort.OLDEST:
				return [{ createdAt: 'desc' }]
			case EnumProductSort.NEWEST:
				return [{ inStock: 'desc' }, { createdAt: 'asc' }]
			case EnumProductSort.POPULAR:
				return [{ countOpened: 'desc' }]
			default:
				return [{ createdAt: 'desc' }, { inStock: 'asc' }]
		}
	}

	private getSearchTermFilter(searchTerm: string): Prisma.ProductWhereInput {
		return {
			OR: [
				{
					categories: {
						some: {
							name: {
								contains: searchTerm,
								mode: 'insensitive'
							}
						}
					}
				},
				{
					name: {
						contains: searchTerm,
						mode: 'insensitive'
					}
				},
				{
					description: {
						contains: searchTerm,
						mode: 'insensitive'
					}
				},
				{
					composition: {
						contains: searchTerm,
						mode: 'insensitive'
					}
				},
				{
					labelProduct: {
						name: {
							contains: searchTerm,
							mode: 'insensitive'
						}
					}
				}
			]
		}
	}

	private getRatingFilter(ratings: number[]): Prisma.ProductWhereInput {
		return {
			reviews: {
				some: {
					rating: {
						in: ratings
					}
				}
			}
		}
	}

	private getPriceFilter(
		minPrice?: number,
		maxPrice?: number
	): Prisma.ProductWhereInput {
		let priceFilter: Prisma.IntFilter | undefined = undefined

		if (minPrice) {
			priceFilter = {
				...priceFilter,
				gte: minPrice
			}
		}

		if (maxPrice) {
			priceFilter = {
				...priceFilter,
				lte: maxPrice
			}
		}

		return { price: priceFilter }
	}

	private getCategoryFilter(categoryIds: string[]): Prisma.ProductWhereInput {
		return {
			categories: {
				some: {
					id: {
						in: categoryIds
					}
				}
			}
		}
	}

	byId(id: string) {
		return this.prisma.product.findUnique({
			where: { id },
			select: returnFullestProductObject
		})
	}

	updateCountOpened(slug: string) {
		return this.prisma.product.update({
			where: { slug },
			data: { countOpened: { increment: 1 } }
		})
	}

	updateOrdersCount(productId: string) {
		return this.prisma.product.update({
			where: { id: productId },
			data: { ordersCount: { increment: 1 } }
		})
	}

	async updateReviewsCount(productId: string) {
		return this.prisma.product.update({
			where: { id: productId },
			data: { countReviews: { increment: 1 } }
		})
	}

	async bySlug(slug: string) {
		await this.updateCountOpened(slug)
		return this.prisma.product.findUnique({
			where: { slug },
			select: {
				...returnProductObject,
				reviews: {
					select: {
						...returnReviewObject,
						user: {
							select: {
								name: true
							}
						}
					},
					where: { isPublic: true },
					orderBy: {
						createdAt: 'desc'
					}
				}
			}
		})
	}

	async byCategory(dto: GetProductsByCategoryDto) {
		const { categorySlug, sort, searchTerm, minPrice, maxPrice, ratings } = dto
		const filters: Prisma.ProductWhereInput[] = []

		if (searchTerm)
			filters.push({
				OR: [
					{ name: { contains: searchTerm, mode: 'insensitive' } },
					{ description: { contains: searchTerm, mode: 'insensitive' } }
				]
			})

		if (minPrice || maxPrice) {
			const priceFilter: Prisma.IntFilter = {}
			if (minPrice) priceFilter.gte = Number(minPrice)
			if (maxPrice) priceFilter.lte = Number(maxPrice)
			filters.push({ price: priceFilter })
		}

		if (ratings)
			filters.push({
				reviews: {
					some: {
						rating: { in: ratings.split('|').map(Number) }
					}
				}
			})

		filters.push({
			categories: {
				some: {
					slug: categorySlug
				}
			}
		})

		const productsWithReviews = []
		const productsWithoutReviews = []

		if (sort === EnumProductSort.MOST_REVIEWED) {
			const mostReviewedProducts = await this.prisma.review.groupBy({
				by: ['productId'],
				_count: {
					id: true
				},
				orderBy: {
					_count: {
						id: 'desc'
					}
				}
			})

			const productIds = mostReviewedProducts.map(item => item.productId)

			if (productIds.length > 0) {
				productsWithReviews.push(
					...(await this.prisma.product.findMany({
						where: {
							AND: [
								...filters,
								{
									id: {
										in: productIds
									}
								}
							]
						},
						select: {
							...returnProductObject,
							description: false,
							composition: false
						},
						orderBy: [{ inStock: 'desc' }, { createdAt: 'asc' }]
					}))
				)
			}

			productsWithoutReviews.push(
				...(await this.prisma.product.findMany({
					where: {
						AND: [
							...filters,
							{
								id: {
									notIn: productIds
								}
							}
						]
					},
					select: {
						...returnProductObject,
						description: false,
						composition: false
					},
					orderBy: [{ inStock: 'desc' }, { createdAt: 'asc' }]
				}))
			)

			return [...productsWithReviews, ...productsWithoutReviews]
		} else {
			const orderBy = this.getSortOption(sort)

			return await this.prisma.product.findMany({
				where: filters.length ? { AND: filters } : {},
				select: {
					...returnProductObject,
					description: false,
					composition: false
				},
				orderBy
			})
		}
	}

	async getMostPopular() {
		return []
	}

	async getSimilar(id: string) {
		const currentProduct = await this.byId(id)
		if (!currentProduct)
			throw new NotFoundException('Текущий продукт не найден')

		const products = await this.prisma.product.findMany({
			where: {
				categories: {
					some: {
						name: {
							in: currentProduct.categories.map(category => category.name)
						}
					}
				},
				NOT: [{ id: currentProduct.id }, { inStock: false }]
			},
			take: 6,
			orderBy: { createdAt: 'desc' },
			select: returnProductObject
		})

		return products
	}

	async create(userId: string) {
		return await this.prisma.product.create({
			data: {
				name: '',
				slug: '',
				description: '',
				price: 0,
				rating: 0.0,
				discount: 0,
				countOpened: 0,
				countReviews: 0,
				ordersCount: 0,
				inStock: true,
				newPrice: 0,
				categories: { connect: [] },
				userId
			}
		})
	}

	async applyDiscountToCategory(dto: ApplyDiscountDto) {
		const {
			categories,
			discount,
			isSentNotification = false,
			startDate,
			endDate,
			title,
			message
		} = dto

		const categoryDetails = await Promise.all(
			categories.map(async categoryId => {
				return this.prisma.category.findUnique({
					where: { id: categoryId },
					select: { id: true, slug: true }
				})
			})
		)

		const firstCategorySlug =
			categoryDetails.length > 0 ? categoryDetails[0].slug : ''

		const users = await this.prisma.user.findMany()
		const products = await this.prisma.product.findMany({
			where: {
				categories: {
					some: {
						id: {
							in: categories
						}
					}
				}
			}
		})

		const startDiscount = async () => {
			const updateProducts = products.map(product => {
				const discountedPrice = product.price * (1 - discount / 100)
				const newPrice = Math.ceil(discountedPrice)

				return this.prisma.product.update({
					where: { id: product.id },
					data: {
						discount: discount,
						newPrice: newPrice
					}
				})
			})

			await Promise.all(updateProducts)

			if (isSentNotification) {
				users.forEach(user => {
					setTimeout(() => {
						this.notificationsService.sendPushNotificationToUser(
							user.id,
							title,
							message,
							{ categorySlug: firstCategorySlug, isRead: true }
						)
					}, 2000)

					this.notificationsService.saveNotification(user.id, title, message, {
						categorySlug: firstCategorySlug
					})
				})
			}

			if (endDate) {
				const timeToEnd = new Date(endDate).getTime() - Date.now()

				if (timeToEnd > 0)
					setTimeout(async () => {
						await this.resetDiscountForCategories(categories)
					}, timeToEnd)
				else await this.resetDiscountForCategories(categories)
			}
		}

		if (startDate) {
			const timeToStart = new Date(startDate).getTime() - Date.now()
			if (timeToStart > 0) setTimeout(startDiscount, timeToStart)
			else await startDiscount()
		} else await startDiscount()

		return products.length
	}

	async resetDiscountForCategories(categories: string[]) {
		const products = await this.prisma.product.findMany({
			where: {
				categories: {
					some: {
						id: { in: categories }
					}
				}
			}
		})

		const resetProducts = products.map(product => {
			return this.prisma.product.update({
				where: { id: product.id },
				data: {
					discount: 0,
					newPrice: 0
				}
			})
		})

		await Promise.all(resetProducts)
	}

	async updateProductRating(productId: string, newRating: number) {
		await this.prisma.product.update({
			where: { id: productId },
			data: { rating: newRating }
		})
	}

	async update(id: string, dto: UpdateProductDto) {
		const currentProduct = await this.prisma.product.findUnique({
			where: { id }
		})
		if (!currentProduct) throw new NotFoundException('Товар не найден')

		let labelProductConnect = {}
		if (dto.labelProductId) {
			const labelProduct = await this.labelProductService.getById(
				dto.labelProductId
			)
			if (!labelProduct)
				throw new NotFoundException('Метка для товара не найдена')
			labelProductConnect = { connect: { id: dto.labelProductId } }
		}

		const product = await this.prisma.product.update({
			where: { id },
			data: {
				name: dto.name,
				slug: generateSlug(dto.name),
				description: dto.description,
				price: dto.price,
				composition: dto.composition,
				rating: dto.rating,
				weight: dto.weight,
				images: dto.images,
				newPrice: dto.newPrice,
				discount: dto.discount,
				isPublic: dto.isPublic,
				inStock: dto.inStock,
				createdAt: dto.createdAt,
				categories: {
					set: dto.categories.map(categoryId => ({ id: categoryId })),
					disconnect: dto.categories
						?.filter(categoryId => !dto.categories.includes(categoryId))
						.map(categoryId => ({ id: categoryId }))
				},
				labelProduct: labelProductConnect
			}
		})

		if (!currentProduct.inStock && dto.inStock) {
			await this.notificationsService.notifyUsersAboutProductInStock(id)
			await this.notificationsService.notifySubscribedUsersAboutStock(id)
		}

		return product
	}

	async delete(id: string) {
		const product = await this.byId(id)
		if (!product) throw new NotFoundException('Товар не найден')

		await Promise.all(
			product.reviews.map(review =>
				this.prisma.review.delete({ where: { id: review.id } })
			)
		)

		return this.prisma.product.delete({ where: { id } })
	}
}
