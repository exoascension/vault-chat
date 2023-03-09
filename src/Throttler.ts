import { RateLimiter } from "limiter";
import { Interval } from "limiter/src/TokenBucket";

type ThrottlerOptions = {
	tokensPerInterval: number
	interval: Interval
}
export class Throttler {
	rateLimiter: RateLimiter

	constructor(options: ThrottlerOptions) {
		this.rateLimiter = new RateLimiter(options)
	}

	async throttleCall(callToThrottle: Function) {
		await this.rateLimiter.removeTokens(1)
		return callToThrottle()
	}
}
