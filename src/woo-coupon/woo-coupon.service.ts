import { Injectable, NotFoundException } from '@nestjs/common'
import { WooCouponDto } from './woo-coupon.dto'
import { WooCouponWooClient } from './woo-coupon-woo.client'

@Injectable()
export class WooCouponService {
	constructor(private readonly woo: WooCouponWooClient) {}

	async getAll(search?: string) {
		const all = await this.woo.fetchAllCoupons()
		let result = all
		if (search) {
			const q = search.toLowerCase()
			result = result.filter(
				c =>
					c.code.toLowerCase().includes(q) ||
					(c.description || '').toLowerCase().includes(q)
			)
		}
		return result.map(c => this.format(c))
	}

	async getById(id: number) {
		try {
			const c = await this.woo.fetchCouponById(id)
			return this.format(c)
		} catch {
			throw new NotFoundException('Купон не найден')
		}
	}

	async create(dto: WooCouponDto) {
		const c = await this.woo.createCoupon(this.toWcPayload(dto))
		return this.format(c)
	}

	async update(id: number, dto: WooCouponDto) {
		const c = await this.woo.updateCoupon(id, this.toWcPayload(dto))
		return this.format(c)
	}

	async delete(id: number) {
		await this.woo.deleteCoupon(id)
		return { ok: true }
	}

	invalidateCache() {
		this.woo.invalidateCache()
	}

	private toWcPayload(dto: WooCouponDto) {
		return {
			code: dto.code.toLowerCase().trim(),
			discount_type: dto.discount_type,
			amount: String(dto.amount),
			description: dto.description ?? '',
			date_expires: dto.date_expires || null,
			usage_limit: dto.usage_limit ?? null,
			minimum_amount: dto.minimum_amount ?? '0',
			individual_use: dto.individual_use ?? false,
			usage_limit_per_user: dto.usage_limit_per_user ?? null
		}
	}

	private format(c: any) {
		return {
			id: c.id as number,
			code: c.code as string,
			discountType: c.discount_type as string,
			amount: c.amount as string,
			description: (c.description || '') as string,
			expiryDate: (c.date_expires || null) as string | null,
			usageLimit: (c.usage_limit || null) as number | null,
			usageCount: (c.usage_count ?? 0) as number,
			minimumAmount: (c.minimum_amount || '0') as string,
			individualUse: (c.individual_use ?? false) as boolean,
			usageLimitPerUser: (c.usage_limit_per_user || null) as number | null,
			status: c.status as string
		}
	}
}
